import { InputValidationError } from '../../lib/errors/app-error';

import { formatVoucherLabel } from './billing.mappers';
import type { BillingCommandInput, BillingIvaCondition } from './billing.schemas';
import type { VoucherKindDefinition, VoucherLetter } from './billing.types';

/**
 * Condiciones IVA del receptor admitidas por letra, segun FEParamGetCondicionIvaReceptor.
 * ARCA rechaza las demas combinaciones con el error 10243.
 */
const IVA_CONDITIONS_BY_LETTER: Record<VoucherLetter, readonly BillingIvaCondition[]> = {
  a: [
    'responsable-inscripto',
    'responsable-monotributo',
    'monotributista-social',
    'monotributo-trabajador-independiente-promovido',
  ],
  b: [
    'sujeto-exento',
    'consumidor-final',
    'sujeto-no-categorizado',
    'proveedor-del-exterior',
    'cliente-del-exterior',
    'iva-liberado',
    'iva-no-alcanzado',
  ],
  c: [
    'responsable-inscripto',
    'responsable-monotributo',
    'monotributista-social',
    'monotributo-trabajador-independiente-promovido',
    'sujeto-exento',
    'consumidor-final',
    'sujeto-no-categorizado',
    'proveedor-del-exterior',
    'cliente-del-exterior',
    'iva-liberado',
    'iva-no-alcanzado',
  ],
};

/** RG 5700/2025: desde $10.000.000 hay que identificar al consumidor final. */
export const CONSUMER_IDENTIFICATION_THRESHOLD = 10_000_000;

export function listAllowedIvaConditions(letter: VoucherLetter): readonly BillingIvaCondition[] {
  return IVA_CONDITIONS_BY_LETTER[letter];
}

export function isIvaConditionAllowed(letter: VoucherLetter, ivaCondition: BillingIvaCondition): boolean {
  return IVA_CONDITIONS_BY_LETTER[letter].includes(ivaCondition);
}

export function validateIvaConditionForVoucher(
  ivaCondition: BillingIvaCondition,
  voucherKind: VoucherKindDefinition,
): void {
  if (isIvaConditionAllowed(voucherKind.letter, ivaCondition)) {
    return;
  }

  const suggestedLetter = (['a', 'b'] as const).find((letter) => isIvaConditionAllowed(letter, ivaCondition));
  const suggestion = suggestedLetter ? ` Usá un comprobante letra ${suggestedLetter.toUpperCase()}.` : '';

  throw new InputValidationError(
    `La ${formatVoucherLabel(voucherKind)} no admite IVA receptor "${ivaCondition}".${suggestion}`,
  );
}

export function validateConsumerIdentification(
  input: Pick<BillingCommandInput, 'documentType' | 'totalAmount'>,
  exchangeRate: number,
  voucherKind: VoucherKindDefinition,
): void {
  if (input.documentType !== 'consumidor-final') {
    return;
  }

  if (input.totalAmount * exchangeRate >= CONSUMER_IDENTIFICATION_THRESHOLD) {
    throw new InputValidationError(
      `La ${formatVoucherLabel(voucherKind)} de $10.000.000 o más requiere identificar al consumidor final. Usá --dni, --cuit o --cuil.`,
    );
  }
}
