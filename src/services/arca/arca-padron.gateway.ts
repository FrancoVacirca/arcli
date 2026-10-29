import type { Arca } from '@arcasdk/core';

import { AppError } from '../../lib/errors/app-error';
import {
  deriveIvaCondition,
  type PadronGateway,
  type Taxpayer,
  type TaxpayerActivity,
  type TaxpayerTax,
} from '../../modules/padron/padron';

const NOT_AUTHORIZED_MESSAGE =
  'El certificado no está autorizado para el servicio ws_sr_constancia_inscripcion (padrón). Autorizalo igual que wsfe: en testing desde WSASS ("Crear autorizacion a servicio") y en producción desde el Administrador de Relaciones.';

/** La respuesta real trae mas de lo que tipa el SDK: se lee de forma defensiva. */
type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  return value === undefined || value === null ? [] : [value];
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readName(general: UnknownRecord | undefined): string | null {
  const businessName = asText(general?.razonSocial);

  if (businessName) return businessName;

  const fullName = [asText(general?.apellido), asText(general?.nombre)].filter(Boolean).join(' ');

  return fullName || null;
}

function readAddress(general: UnknownRecord | undefined): string | null {
  const address = asRecord(general?.domicilioFiscal);
  const parts = [
    asText(address?.direccion),
    asText(address?.localidad),
    asText(address?.codPostal) ? `CP ${asText(address?.codPostal)}` : null,
    asText(address?.descripcionProvincia),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : null;
}

function readTaxes(...sources: Array<UnknownRecord | undefined>): TaxpayerTax[] {
  return sources.flatMap((source) =>
    asArray(source?.impuesto).flatMap((item) => {
      const tax = asRecord(item);
      const id = Number(tax?.idImpuesto);

      return Number.isInteger(id)
        ? [
            {
              active: (asText(tax?.estadoImpuesto) ?? 'AC') === 'AC',
              description: asText(tax?.descripcionImpuesto) ?? '',
              id,
            },
          ]
        : [];
    }),
  );
}

function readActivities(...sources: Array<UnknownRecord | undefined>): TaxpayerActivity[] {
  return sources.flatMap((source) =>
    asArray(source?.actividad ?? source?.actividadMonotributista).flatMap((item) => {
      const activity = asRecord(item);
      const id = Number(activity?.idActividad);

      return Number.isInteger(id) ? [{ description: asText(activity?.descripcionActividad) ?? '', id }] : [];
    }),
  );
}

function readMonotributoCategory(monotributo: UnknownRecord | undefined): string | null {
  const category = monotributo?.categoriaMonotributo;

  return asText(category) ?? asText(asRecord(category)?.descripcionCategoria);
}

function readNotices(details: UnknownRecord): string[] {
  return asArray(asRecord(details.errorConstancia)?.error).flatMap((item) => asText(item) ?? []);
}

function readPersonType(value: unknown): Taxpayer['personType'] {
  const type = asText(value)?.toUpperCase();

  return type === 'FISICA' ? 'fisica' : type === 'JURIDICA' ? 'juridica' : null;
}

/** Arma un `Taxpayer` con la respuesta de `getTaxpayerDetails`. */
export function mapTaxpayerDetails(cuit: number, raw: unknown): Taxpayer {
  const details = asRecord(raw) ?? {};
  const general = asRecord(details.datosGenerales);
  const monotributo = asRecord(details.datosMonotributo);
  const generalRegime = asRecord(details.datosRegimenGeneral);
  const taxes = readTaxes(generalRegime, monotributo);

  return {
    activities: readActivities(generalRegime, monotributo),
    address: readAddress(general),
    cuit,
    ivaCondition: deriveIvaCondition({ monotributo: Boolean(monotributo), taxes }),
    keyStatus: asText(details.estadoClave) ?? asText(general?.estadoClave),
    monotributoCategory: readMonotributoCategory(monotributo),
    name: readName(general),
    notices: readNotices(details),
    personType: readPersonType(details.tipoPersona ?? general?.tipoPersona),
    taxes,
  };
}

export class ArcaPadronGateway implements PadronGateway {
  public constructor(private readonly arca: Arca) {}

  public async getTaxpayer(cuit: number): Promise<Taxpayer | null> {
    let details: unknown;

    try {
      details = await this.arca.registerInscriptionProofService.getTaxpayerDetails(cuit);
    } catch (error) {
      if (error instanceof Error && error.message.includes('notAuthorized')) {
        throw new AppError(NOT_AUTHORIZED_MESSAGE, { code: 'PADRON_SERVICE_NOT_AUTHORIZED' });
      }

      throw error;
    }

    return details ? mapTaxpayerDetails(cuit, details) : null;
  }
}
