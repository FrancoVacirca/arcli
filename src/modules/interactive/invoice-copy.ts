import { ARCA_LOCAL_CURRENCY_CODE } from '../billing/billing.currency';
import type { BillingIvaRate } from '../billing/billing.schemas';
import type { VoucherKindDefinition } from '../billing/billing.types';
import { inferIvaRate, type IssuedVoucher } from '../vouchers/voucher-history';

/** Lo que se puede copiar de una factura emitida para repetirla o para una nota sobre ella. */
export interface InvoiceCopy {
  /** Codigo ARCA (`PES`, `DOL`…). Una nota va en la moneda de su factura. */
  readonly currencyCode: string;
  readonly exchangeRate?: number;
  readonly exemptAmount?: number;
  readonly ivaRate?: BillingIvaRate;
  /** Por que no se puede reproducir el total exacto; sin motivo, se puede. */
  readonly limitation?: string;
  readonly untaxedAmount?: number;
}

/**
 * ARCA devuelve los totales de la factura, no el detalle por alicuota: con varias alicuotas (o tributos, que ARCLI
 * no maneja) no se puede armar otra igual. En ese caso se devuelve el motivo para avisar y no ofrecer el total.
 */
export function copyInvoiceAmounts(invoice: IssuedVoucher, letter: VoucherKindDefinition['letter']): InvoiceCopy {
  const currencyCode = invoice.currency ?? ARCA_LOCAL_CURRENCY_CODE;
  const foreign = currencyCode !== ARCA_LOCAL_CURRENCY_CODE;
  const discriminatesIva = letter !== 'c';
  const ivaRate = discriminatesIva ? inferIvaRate(invoice.netAmount, invoice.ivaAmount) : undefined;
  const limitation =
    (invoice.taxesAmount ?? 0) > 0
      ? 'La factura tiene tributos o percepciones, que ARCLI no maneja.'
      : discriminatesIva && invoice.netAmount > 0 && !ivaRate
        ? 'No se pudo deducir la alícuota de la factura: tiene varias o una que no es estandar.'
        : undefined;

  return {
    currencyCode,
    exchangeRate: foreign ? invoice.exchangeRate : undefined,
    exemptAmount: discriminatesIva ? invoice.exemptAmount || undefined : undefined,
    ivaRate,
    limitation,
    untaxedAmount: discriminatesIva ? invoice.untaxedAmount || undefined : undefined,
  };
}
