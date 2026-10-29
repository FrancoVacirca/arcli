import { diffArcaDatesInDays, formatArcaDateAsArgentineDate } from '../../lib/dates/arca-date';
import { InputValidationError } from '../../lib/errors/app-error';
import { parseCuit } from '../../lib/identity/cuit';

import { formatDocumentFlag, formatVoucherLabel } from './billing.mappers';
import type { BillingCommandInput, BillingConcept } from './billing.schemas';
import type { VoucherKindDefinition } from './billing.types';

export function ensureDateOrder(serviceStartDate: string, serviceEndDate: string): void {
  if (serviceStartDate > serviceEndDate) {
    throw new InputValidationError('La fecha de inicio de servicio no puede ser posterior a la fecha de fin.');
  }
}

export function validateConceptDateInputs(input: BillingCommandInput, voucherKind: VoucherKindDefinition): void {
  const hasAnyServiceDate = Boolean(input.serviceStartDate || input.serviceEndDate);
  const hasPartialServiceDate = Boolean(input.serviceStartDate) !== Boolean(input.serviceEndDate);

  if (input.paymentDueDate) {
    if (voucherKind.isElectronicCredit && voucherKind.family !== 'factura-credito-electronica') {
      throw new InputValidationError(
        `La ${formatVoucherLabel(voucherKind)} no lleva vencimiento de pago. Sacá --vencimiento.`,
      );
    }

    if (!voucherKind.isElectronicCredit && input.concept === 'productos') {
      throw new InputValidationError('El concepto "productos" no usa --vencimiento.');
    }
  }

  if (input.concept === 'productos') {
    if (hasAnyServiceDate) {
      throw new InputValidationError(
        'El concepto "productos" no usa fechas de servicio. Sacá --servicio-desde y --servicio-hasta.',
      );
    }

    if (input.dueDay) {
      throw new InputValidationError('El concepto "productos" no usa --dia. Usá solo fecha o monto.');
    }

    return;
  }

  if (hasPartialServiceDate) {
    throw new InputValidationError(
      'Si informa fechas de servicio, debe enviar ambas: --servicio-desde y --servicio-hasta.',
    );
  }

  // --dia arma el fin del servicio desde hoy; con una fecha explicita no se usaria y nadie se enteraria.
  if (input.dueDay && (input.billingDate || input.serviceEndDate)) {
    throw new InputValidationError(
      '--dia no se combina con --fecha ni con --servicio-hasta: con esas fechas no se usa. Sacá --dia o esas fechas.',
    );
  }
}

export function validateDocumentIdentity(input: BillingCommandInput, voucherKind: VoucherKindDefinition): void {
  if (input.documentType === 'consumidor-final') {
    if (input.ivaCondition !== 'consumidor-final') {
      throw new InputValidationError(
        `La ${formatVoucherLabel(voucherKind)} usa consumidor final solo con --ir-cf o --iva-receptor consumidor-final.`,
      );
    }

    if (typeof input.documentNumber === 'number' && input.documentNumber !== 0) {
      throw new InputValidationError(
        `La ${formatVoucherLabel(voucherKind)} usa consumidor final solo con documento 0. Usá --consumidor-final.`,
      );
    }

    return;
  }

  if (typeof input.documentNumber !== 'number') {
    throw new InputValidationError(
      `La ${formatVoucherLabel(voucherKind)} requiere documento del receptor. Usá ${formatDocumentFlag(input.documentType)}.`,
    );
  }

  if (input.documentType === 'cuit' || input.documentType === 'cuil') {
    const result = parseCuit(input.documentNumber);

    if (!result.ok) {
      throw new InputValidationError(
        `${formatDocumentFlag(input.documentType)} ${input.documentNumber} no es válido en ${formatVoucherLabel(voucherKind)}: ${result.reason}.`,
      );
    }
  }

  if (input.documentType === 'dni' && !/^\d{7,8}$/.test(String(input.documentNumber))) {
    throw new InputValidationError(`--dni debe tener 7 u 8 digitos en ${formatVoucherLabel(voucherKind)}.`);
  }
}

interface BillingDateWindow {
  readonly maxDaysAfter: number;
  readonly maxDaysBefore: number;
  readonly sameMonthWhenFuture: boolean;
}

/** Ventana de CbteFch respecto de hoy segun ARCA (errores 10016 y 10152). */
function resolveBillingDateWindow(concept: BillingConcept, voucherKind: VoucherKindDefinition): BillingDateWindow {
  if (voucherKind.isElectronicCredit) {
    return { maxDaysAfter: 1, maxDaysBefore: 5, sameMonthWhenFuture: true };
  }

  if (concept === 'productos') {
    return { maxDaysAfter: 5, maxDaysBefore: 5, sameMonthWhenFuture: true };
  }

  return { maxDaysAfter: 10, maxDaysBefore: 10, sameMonthWhenFuture: false };
}

export function validateBillingDateWindow(
  billingDate: string,
  today: string,
  concept: BillingConcept,
  voucherKind: VoucherKindDefinition,
): void {
  const window = resolveBillingDateWindow(concept, voucherKind);
  const offset = diffArcaDatesInDays(today, billingDate);
  const label = formatArcaDateAsArgentineDate(billingDate);

  if (offset < -window.maxDaysBefore || offset > window.maxDaysAfter) {
    throw new InputValidationError(
      `La fecha ${label} esta fuera de rango para la ${formatVoucherLabel(voucherKind)}: ARCA acepta hasta ${window.maxDaysBefore} días antes y ${window.maxDaysAfter} después de hoy.`,
    );
  }

  if (window.sameMonthWhenFuture && offset > 0 && billingDate.slice(0, 6) !== today.slice(0, 6)) {
    throw new InputValidationError(
      `La fecha ${label} es futura y cae en otro mes. Para la ${formatVoucherLabel(voucherKind)} ARCA solo acepta fechas futuras dentro del mes actual.`,
    );
  }
}

export function validatePaymentDueDate(paymentDueDate: string, minimumPaymentDueDate: string): void {
  if (paymentDueDate < minimumPaymentDueDate) {
    throw new InputValidationError(
      `El vencimiento de pago (${formatArcaDateAsArgentineDate(paymentDueDate)}) no puede ser anterior al ${formatArcaDateAsArgentineDate(minimumPaymentDueDate)}.`,
    );
  }
}
