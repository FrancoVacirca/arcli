import type { ICbtesAsoc } from '@arcasdk/core/lib/domain/types/voucher.types';

import { formatArcaDateAsArgentineDate, parseArgentineDateInputAsArcaDate } from '../../lib/dates/arca-date';
import { InputValidationError } from '../../lib/errors/app-error';

import { formatVoucherLabel } from './billing.mappers';
import type { BillingCommandInput } from './billing.schemas';
import type { VoucherKindDefinition } from './billing.types';
import { getVoucherKindByArcaType } from './voucher-kind-map';

interface ResolveAssociatedVoucherOptions {
  readonly billingDate: string;
  readonly emitterCuit: number;
  readonly input: BillingCommandInput;
  readonly requireVoucherKind: (shortcut: string) => VoucherKindDefinition;
  readonly voucherKind: VoucherKindDefinition;
}

export function resolveAssociatedVouchers(options: ResolveAssociatedVoucherOptions): ICbtesAsoc[] | undefined {
  const { billingDate, emitterCuit, input, requireVoucherKind, voucherKind } = options;

  if (!voucherKind.requiresAssociatedVoucher) {
    if (input.associatedVoucher) {
      throw new InputValidationError(`El comprobante ${formatVoucherLabel(voucherKind)} no usa comprobante asociado.`);
    }

    return undefined;
  }

  // Con periodo asociado la nota no lleva CbtesAsoc; lo valida resolveAssociatedPeriod.
  if (input.associatedPeriod && !input.associatedVoucher) {
    return undefined;
  }

  const associatedVoucher = input.associatedVoucher;
  // En NC/ND FCE el asociado siempre es del propio emisor (10155), asi que el CUIT puede omitirse.
  const associatedCuit = associatedVoucher?.cuit ?? (voucherKind.isElectronicCredit ? String(emitterCuit) : undefined);
  const associatedVoucherType =
    associatedVoucher?.tipo ?? resolveAssociatedVoucherType(associatedVoucher?.shortcut, requireVoucherKind);
  const associatedVoucherKind = resolveAssociatedVoucherKind(associatedVoucher, requireVoucherKind);

  if (!associatedVoucher?.numero || !associatedVoucher.puntoVenta || !associatedVoucherType || !associatedCuit) {
    throw new InputValidationError(
      `El comprobante ${formatVoucherLabel(voucherKind)} requiere comprobante asociado. Use --ac o --at, junto con --apv o --asociado-punto-venta, --ar y --acuit${voucherKind.isElectronicCredit ? '' : ', o un periodo con --periodo-desde y --periodo-hasta'}.`,
    );
  }

  if (associatedVoucherKind) {
    validateAssociatedVoucherKind(associatedVoucherKind, voucherKind);
  }

  if (voucherKind.isElectronicCredit && associatedCuit !== String(emitterCuit)) {
    throw new InputValidationError(
      `En la ${formatVoucherLabel(voucherKind)} el comprobante asociado tiene que ser del CUIT emisor (${emitterCuit}). Quite --acuit o use ese CUIT.`,
    );
  }

  const associatedDate = resolveAssociatedVoucherDate(associatedVoucher.fecha, billingDate, voucherKind);

  return [
    {
      ...(associatedDate ? { CbteFch: associatedDate } : {}),
      Cuit: associatedCuit,
      Nro: associatedVoucher.numero,
      PtoVta: associatedVoucher.puntoVenta,
      Tipo: associatedVoucherType,
    },
  ];
}

/**
 * El tipo del asociado, por atajo (--ac) o por codigo ARCA (--at), para validar letra y familia igual en los dos
 * casos. Un codigo fuera del alcance de ARCLI no se valida aca: lo resuelve ARCA.
 */
function resolveAssociatedVoucherKind(
  associatedVoucher: BillingCommandInput['associatedVoucher'],
  requireVoucherKind: (shortcut: string) => VoucherKindDefinition,
): VoucherKindDefinition | undefined {
  const byShortcut = associatedVoucher?.shortcut ? requireVoucherKind(associatedVoucher.shortcut) : undefined;
  const byType = associatedVoucher?.tipo ? (getVoucherKindByArcaType(associatedVoucher.tipo) ?? undefined) : undefined;

  if (byShortcut && associatedVoucher?.tipo && byShortcut.arcaType !== associatedVoucher.tipo) {
    throw new InputValidationError(
      `El atajo "${associatedVoucher.shortcut}" es el tipo ${byShortcut.arcaType}, no el ${associatedVoucher.tipo}. Use uno solo para el comprobante asociado.`,
    );
  }

  return byShortcut ?? byType;
}

function resolveAssociatedVoucherDate(
  rawDate: string | undefined,
  billingDate: string,
  voucherKind: VoucherKindDefinition,
): string | undefined {
  if (!rawDate) {
    if (voucherKind.isElectronicCredit) {
      throw new InputValidationError(
        `La ${formatVoucherLabel(voucherKind)} requiere la fecha del comprobante asociado. Use --afecha <fecha>.`,
      );
    }

    return undefined;
  }

  const associatedDate = parseArgentineDateInputAsArcaDate(rawDate);

  if (associatedDate > billingDate) {
    throw new InputValidationError(
      `La fecha del comprobante asociado (${formatArcaDateAsArgentineDate(associatedDate)}) no puede ser posterior a la de la ${formatVoucherLabel(voucherKind)} (${formatArcaDateAsArgentineDate(billingDate)}).`,
    );
  }

  return associatedDate;
}

function resolveAssociatedVoucherType(
  shortcut: string | undefined,
  requireVoucherKind: (shortcut: string) => VoucherKindDefinition,
): number | undefined {
  if (!shortcut) {
    return undefined;
  }

  return requireVoucherKind(shortcut).arcaType;
}

function validateAssociatedVoucherKind(
  associatedVoucherKind: VoucherKindDefinition,
  voucherKind: VoucherKindDefinition,
): void {
  if (associatedVoucherKind.family !== 'factura' && associatedVoucherKind.family !== 'factura-credito-electronica') {
    throw new InputValidationError(
      `El comprobante asociado de ${formatVoucherLabel(voucherKind)} debe ser una factura, no otra nota.`,
    );
  }

  if (associatedVoucherKind.letter !== voucherKind.letter) {
    throw new InputValidationError(
      `El comprobante asociado debe usar la misma letra que ${formatVoucherLabel(voucherKind)}.`,
    );
  }

  if (associatedVoucherKind.isElectronicCredit !== voucherKind.isElectronicCredit) {
    throw new InputValidationError(
      `El comprobante asociado debe pertenecer a la misma categoria electronica que ${formatVoucherLabel(voucherKind)}.`,
    );
  }
}
