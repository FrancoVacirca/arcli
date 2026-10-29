import { resolveBillingIvaConditionCode } from '../billing/billing.mappers';
import type { BillingExecutionResult } from '../billing/billing.types.internal';

/** RG 5614 (Ley 27.743): titulo y datos del regimen de transparencia fiscal, en comprobantes a consumidor final. */
export const TRANSPARENCY_TITLE = 'Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)';

/** RG 5003 (RG 1415, art. 15, inc. a): comprobante A a un sujeto adherido al monotributo. */
export const MONOTRIBUTO_CREDIT_LEGEND =
  'El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618';

const MONOTRIBUTO_CONDITION_CODES: ReadonlySet<number> = new Set([
  resolveBillingIvaConditionCode('responsable-monotributo'),
  resolveBillingIvaConditionCode('monotributista-social'),
  resolveBillingIvaConditionCode('monotributo-trabajador-independiente-promovido'),
]);

function formatAmount(value: number, currency: string): string {
  const amount = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);

  return `${currency === 'PES' ? '$' : currency} ${amount}`;
}

/**
 * Leyendas que la normativa exige en el comprobante y la plantilla de `@arcasdk/pdf` 0.2.x no trae.
 * Van en texto plano: la plantilla las muestra como observaciones, debajo del CAE.
 */
export function buildPdfLegends(result: BillingExecutionResult): string | undefined {
  const { payload, voucherKind } = result;

  if (voucherKind.letter === 'b') {
    // arcli no informa tributos: no hay impuestos internos ni otros nacionales indirectos que mostrar.
    return [
      TRANSPARENCY_TITLE,
      `IVA Contenido: ${formatAmount(payload.ImpIVA, payload.MonId)}`,
      `Otros Impuestos Nacionales Indirectos: ${formatAmount(0, payload.MonId)}`,
    ].join(' · ');
  }

  if (voucherKind.letter === 'a' && MONOTRIBUTO_CONDITION_CODES.has(payload.CondicionIVAReceptorId)) {
    return MONOTRIBUTO_CREDIT_LEGEND;
  }

  return undefined;
}
