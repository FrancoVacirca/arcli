import type { BillingCommandInput } from '../billing/billing.schemas';
import type { VoucherKindDefinition } from '../billing/billing.types';

/** Respuesta de wsfecred consultarMontoObligadoRecepcion. */
export interface FceObligation {
  readonly minimumAmount: number;
  readonly obligated: boolean;
}

export interface FceObligationGateway {
  /** `issueDate` en formato ARCA yyyymmdd. */
  getObligation(cuit: number, issueDate: string): Promise<FceObligation>;
}

const MONEY_FORMATTER = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

function formatMoney(value: number): string {
  return `$${MONEY_FORMATTER.format(value)}`;
}

function isInvoice(voucherKind: VoucherKindDefinition): boolean {
  return voucherKind.family === 'factura' || voucherKind.family === 'factura-credito-electronica';
}

/** Solo las facturas (comunes o FCE) a un receptor con CUIT dependen del regimen FCE. */
export function shouldCheckFceObligation(
  input: Pick<BillingCommandInput, 'documentNumber' | 'documentType'>,
  voucherKind: VoucherKindDefinition,
): input is Pick<BillingCommandInput, 'documentType'> & { readonly documentNumber: number } {
  return isInvoice(voucherKind) && input.documentType === 'cuit' && typeof input.documentNumber === 'number';
}

/**
 * Compara el comprobante elegido con lo que exige el regimen FCE MiPyMEs:
 * con receptor obligado y monto igual o superior al minimo corresponde FCE; si no, factura comun.
 */
export function evaluateFceObligation(
  obligation: FceObligation,
  voucherKind: VoucherKindDefinition,
  amountInPesos: number,
): string[] {
  const requiresFce = obligation.obligated && amountInPesos >= obligation.minimumAmount;
  const regularShortcut = `f${voucherKind.letter}`;
  const fceShortcut = `fce${voucherKind.letter}`;

  if (voucherKind.family === 'factura' && requiresFce) {
    return [
      `El receptor está obligado a recibir FCE desde ${formatMoney(obligation.minimumAmount)} y este monto lo supera. Corresponde emitir ${fceShortcut} en lugar de ${regularShortcut}.`,
    ];
  }

  if (voucherKind.family === 'factura-credito-electronica' && !requiresFce) {
    const reason = obligation.obligated
      ? `el monto es menor al mínimo del régimen (${formatMoney(obligation.minimumAmount)})`
      : 'el receptor no está obligado a recibir FCE';

    return [`Para este comprobante ${reason}. Corresponde emitir ${regularShortcut} en lugar de ${fceShortcut}.`];
  }

  return [];
}
