/**
 * Modo librería de ARCLI: `import { createArcli } from 'arcli/api'`.
 *
 * Es la misma lógica que usan los comandos (validaciones, armado de la solicitud, emisión en dos pasos), sin la
 * config de la CLI ni archivos. Ver docs/libreria.md.
 *
 * `AccessTicket`, `MemoryTicketStorage` e `ITicketStoragePort` salen de `@arcasdk/core`: están acá para guardar el
 * ticket de WSAA en otro lado sin depender directo del SDK.
 */

export { AppError, ConfigurationError, InputValidationError } from '../lib/errors/app-error';
export { EmissionUncertainError } from '../modules/billing/billing.errors';
export { listAllowedIvaConditions } from '../modules/billing/billing.iva-receptor';
export {
  type BillingCommandInput,
  type BillingConcept,
  type BillingDocumentType,
  type BillingIvaCondition,
  billingIvaConditionSchema,
} from '../modules/billing/billing.schemas';
export type { VoucherKindDefinition, VoucherLetter, VoucherShortcut } from '../modules/billing/billing.types';
export type { BillingExecutionResult, BillingResponseSummary } from '../modules/billing/billing.types.internal';
export { CertificateExpiredError, type CertificateExpiryNotice } from '../modules/config/certificate-expiry';
export type { ArcliEnvironment } from '../modules/config/config.schemas';
export type { Taxpayer } from '../modules/padron/padron';
export { formatIvaConditionName } from '../modules/pdf/pdf-issuer';
export type { IssuedVoucher } from '../modules/vouchers/voucher-history';
export {
  type ArcliClient,
  type ArcliClientOptions,
  type ArcliGateways,
  type CertificateStatus,
  createArcli,
  type InvoiceRequest,
} from './arcli-client';
export {
  AccessTicket,
  type ArcaServiceName,
  type ILoginCredentials,
  type ITicketStoragePort,
  MemoryTicketStorage,
} from '@arcasdk/core';
