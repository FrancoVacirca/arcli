import { Arca, type ITicketStoragePort } from '@arcasdk/core';

import { InputValidationError } from '../lib/errors/app-error';
import { parseCuit } from '../lib/identity/cuit';
import { type CertificateExpiry, readCertificateExpiry } from '../lib/security/certificate';
import { type BillingCommandInput, billingCommandSchema } from '../modules/billing/billing.schemas';
import { BillingService } from '../modules/billing/billing.service';
import type { VoucherShortcut } from '../modules/billing/billing.types';
import type { BillingExecutionResult, BillingGateway } from '../modules/billing/billing.types.internal';
import { getVoucherKindByShortcut } from '../modules/billing/voucher-kind-map';
import {
  CertificateExpiredError,
  type CertificateExpiryNotice,
  inspectCertificateExpiry,
} from '../modules/config/certificate-expiry';
import { arcliConfigSchema, type ArcliEnvironment } from '../modules/config/config.schemas';
import type { PadronGateway, Taxpayer } from '../modules/padron/padron';
import type { IssuedVoucher, VoucherHistoryGateway } from '../modules/vouchers/voucher-history';
import { ArcaBillingGateway } from '../services/arca/arca-billing.gateway';
import type { ResolvedArcaRuntime } from '../services/arca/arca-context.resolver';
import { ArcaPadronGateway } from '../services/arca/arca-padron.gateway';
import { ArcaVoucherHistoryGateway } from '../services/arca/arca-voucher-history.gateway';

/** Los adaptadores sobre ARCA que usa el cliente. Solo los tests los reemplazan. */
export interface ArcliGateways {
  readonly billing: BillingGateway;
  readonly history: VoucherHistoryGateway;
  readonly padron: PadronGateway;
}

export interface ArcliClientOptions {
  /** Contenido PEM del certificado, no una ruta. */
  readonly cert: string;
  /** CUIT del emisor, con o sin guiones. */
  readonly cuit: number | string;
  /** Solo para tests: reemplaza los adaptadores sobre ARCA. */
  readonly gateways?: Partial<ArcliGateways>;
  /** Contenido PEM de la clave privada, no una ruta. */
  readonly key: string;
  /** Reloj para el vencimiento del certificado; solo lo cambian los tests. */
  readonly now?: () => Date;
  /** Punto de venta por defecto: el pedido puede traer otro en `pointOfSale`. */
  readonly pointOfSale?: number;
  /** `true` emite en producción. Por defecto, testing (homologación). */
  readonly production?: boolean;
  /**
   * Dónde se guarda el ticket de WSAA. Es obligatorio a propósito: WSAA rechaza un login nuevo mientras el ticket
   * anterior siga vigente, así que un proceso que lo pierde (un contenedor que se reinicia) queda sin poder emitir
   * hasta 12 horas. Guardalo en algo que sobreviva al proceso (base de datos, Redis); `MemoryTicketStorage` sirve
   * para scripts y tests.
   */
  readonly ticketStorage: ITicketStoragePort;
  /** Agente HTTPS con la configuración TLS vieja que piden algunos servidores de ARCA. Ver el FAQ de `@arcasdk/core`. */
  readonly useHttpsAgent?: boolean;
}

/** Los campos que `billingCommandSchema` completa solo si faltan. */
type DefaultedField = 'cancellation' | 'currencyCode' | 'documentType' | 'sameCurrency';

/**
 * Lo mismo que `arcli <comprobante>` recibe por flags o JSON, con los mismos nombres y defaults, sin `emit`, `dryRun`
 * ni `pdf`: emitir o previsualizar lo decide el método que se llama, y el PDF queda a cargo de quien usa la librería.
 */
export type InvoiceRequest = Omit<BillingCommandInput, 'dryRun' | 'emit' | 'pdf' | DefaultedField> &
  Partial<Pick<BillingCommandInput, DefaultedField>>;

export interface CertificateStatus extends CertificateExpiry {
  /** El aviso de la CLI cuando faltan 30 días o menos, o si ya venció. */
  readonly notice?: CertificateExpiryNotice;
}

export interface ArcliClient {
  /** Fecha de vencimiento del certificado, leída del PEM sin ir a ARCA. Null si el PEM no se puede leer. */
  certificate(): CertificateStatus | null;
  /**
   * Emite el comprobante: login en WSAA, último número + 1 y `FECAESolicitar`, con las mismas validaciones que la
   * CLI. Si falla el login o el pedido del número, no se envió nada y el error sale tal cual. Si falla la llamada
   * que emite, tira `EmissionUncertainError`: ARCA pudo haberlo autorizado, así que hay que verificarlo con
   * `lastVoucherNumber` / `findVoucher` antes de reintentar.
   */
  emitInvoice(request: InvoiceRequest): Promise<BillingExecutionResult>;
  readonly environment: ArcliEnvironment;
  /** El comprobante emitido con ese número, o `undefined` si ARCA no lo tiene. */
  findVoucher(shortcut: VoucherShortcut, number: number, pointOfSale?: number): Promise<IssuedVoucher | undefined>;
  /** Constancia de inscripción (`ws_sr_constancia_inscripcion`): nombre, domicilio y condición IVA. */
  getTaxpayer(cuit: number | string): Promise<Taxpayer | null>;
  /** Último número autorizado para ese comprobante y punto de venta; 0 si no hay ninguno. */
  lastVoucherNumber(shortcut: VoucherShortcut, pointOfSale?: number): Promise<number>;
  /** Valida y arma la solicitud que se mandaría a ARCA, sin llamar a ARCA. */
  previewInvoice(request: InvoiceRequest): Promise<BillingExecutionResult>;
}

function requireCuit(value: number | string, label: string): number {
  const result = parseCuit(value);

  if (!result.ok) {
    throw new InputValidationError(`El CUIT ${label} ${result.reason}.`);
  }

  return Number(result.value);
}

function parseRequest(request: InvoiceRequest, emit: boolean): BillingCommandInput {
  const parsed = billingCommandSchema.safeParse({ ...request, dryRun: !emit, emit, pdf: false });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    );

    throw new InputValidationError(`La solicitud no es válida: ${issues.join('; ')}`, { issues });
  }

  return parsed.data;
}

/**
 * Cliente de ARCLI para usar desde código (un panel, un backend). No lee la config de la CLI ni archivos: el
 * certificado y la clave llegan como texto y el ticket de WSAA se guarda en `ticketStorage`. Por dentro usa el mismo
 * `BillingService` y los mismos adaptadores que los comandos.
 */
export function createArcli(options: ArcliClientOptions): ArcliClient {
  const cuit = requireCuit(options.cuit, 'del emisor');
  const environment: ArcliEnvironment = options.production ? 'produccion' : 'testing';
  const now = options.now ?? (() => new Date());
  const billingService = new BillingService();
  const config = arcliConfigSchema.parse({});
  let arca: Arca | undefined;

  if (!options.cert.trim() || !options.key.trim()) {
    throw new InputValidationError('Faltan el certificado o la clave privada (contenido PEM).');
  }

  function runtime(): ResolvedArcaRuntime {
    const certificateExpiry = inspectCertificateExpiry(options.cert, environment, now());

    return {
      certificateExpiry,
      certificateNotices: certificateExpiry ? [certificateExpiry] : [],
      config,
      context: {
        cert: options.cert,
        cuit,
        key: options.key,
        production: environment === 'produccion',
        ticketStorage: options.ticketStorage,
        useHttpsAgent: options.useHttpsAgent,
      },
      environment,
      outputJson: true,
      outputRaw: false,
      pointOfSale: options.pointOfSale,
    };
  }

  /** Como `ArcaClientFactory`: con el certificado vencido corta antes de pedir el ticket a WSAA. */
  function client(): Arca {
    const current = runtime();

    if (current.certificateExpiry?.expired) {
      throw new CertificateExpiredError(current.certificateExpiry);
    }

    arca ??= new Arca(current.context);

    return arca;
  }

  const gateways = {
    billing: () => options.gateways?.billing ?? new ArcaBillingGateway(client()),
    history: () => options.gateways?.history ?? new ArcaVoucherHistoryGateway(client()),
    padron: () => options.gateways?.padron ?? new ArcaPadronGateway(client()),
  };

  function voucherType(shortcut: VoucherShortcut): number {
    const kind = getVoucherKindByShortcut(shortcut);

    if (!kind) {
      throw new InputValidationError(`El atajo "${shortcut}" no corresponde a un comprobante soportado.`);
    }

    return kind.arcaType;
  }

  function requirePointOfSale(pointOfSale: number | undefined): number {
    const value = pointOfSale ?? options.pointOfSale;

    if (!value) {
      throw new InputValidationError('Falta el punto de venta.');
    }

    return value;
  }

  async function run(request: InvoiceRequest, emit: boolean): Promise<BillingExecutionResult> {
    const gateway = gateways.billing();
    const input = await billingService.resolveExchangeRate(parseRequest(request, emit), gateway);

    return billingService.execute({ gateway, input, runtime: runtime() });
  }

  return {
    certificate() {
      const at = now();

      try {
        const expiry = readCertificateExpiry(options.cert, at);

        return { ...expiry, notice: inspectCertificateExpiry(options.cert, environment, at) };
      } catch {
        return null;
      }
    },
    emitInvoice: (request) => run(request, true),
    environment,
    // async: una validación que falla rechaza la promesa, igual que un error de ARCA.
    findVoucher: async (shortcut, number, pointOfSale) =>
      gateways.history().getVoucher(number, requirePointOfSale(pointOfSale), voucherType(shortcut)),
    getTaxpayer: async (receiverCuit) => gateways.padron().getTaxpayer(requireCuit(receiverCuit, 'del receptor')),
    lastVoucherNumber: async (shortcut, pointOfSale) =>
      gateways.history().getLastNumber(requirePointOfSale(pointOfSale), voucherType(shortcut)),
    previewInvoice: (request) => run(request, false),
  };
}
