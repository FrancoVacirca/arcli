import {
  calendarDateToArcaDate,
  formatDateAsArcaDate,
  maxArcaDate,
  parseArgentineDateInputAsArcaDate,
  toArgentineCalendarDate,
} from '../../lib/dates/arca-date';

import { isElectronicCreditInvoice } from './billing.fce';
import type { BillingCommandInput } from './billing.schemas';
import type { VoucherKindDefinition } from './billing.types';
import {
  ensureDateOrder,
  validateBillingDateWindow,
  validateConceptDateInputs,
  validatePaymentDueDate,
} from './billing.validation';

export interface BillingDateRange {
  readonly billingDate: string;
  readonly paymentDueDate?: string;
  readonly serviceEndDate?: string;
  readonly serviceStartDate?: string;
}

/** Fecha ARCA del proximo `dueDay`, contando desde hoy en Argentina. La cuenta va en UTC para no cruzar zonas. */
function resolvePaymentDateFromDueDay(dueDay: number, now = new Date()): string {
  const today = toArgentineCalendarDate(now);
  const paymentDate = new Date(Date.UTC(today.year, today.month - 1, today.day));

  if (dueDay < today.day) {
    paymentDate.setUTCMonth(paymentDate.getUTCMonth() + 1);
  }

  paymentDate.setUTCDate(dueDay);

  return calendarDateToArcaDate({
    day: paymentDate.getUTCDate(),
    month: paymentDate.getUTCMonth() + 1,
    year: paymentDate.getUTCFullYear(),
  });
}

/**
 * Que fechas lleva el comprobante:
 * - servicios: FchServDesde, FchServHasta y FchVtoPago (10049)
 * - factura FCE: FchVtoPago siempre, aunque sea de productos (10163)
 * - NC/ND FCE: sin FchVtoPago salvo anulacion (10175)
 */
function shouldSendPaymentDueDate(input: BillingCommandInput, voucherKind: VoucherKindDefinition): boolean {
  if (voucherKind.isElectronicCredit) {
    return isElectronicCreditInvoice(voucherKind);
  }

  return input.concept !== 'productos';
}

function resolveServiceDates(
  input: BillingCommandInput,
  billingDate: string,
): Required<Pick<BillingDateRange, 'serviceEndDate' | 'serviceStartDate'>> {
  const defaultServiceEndDate =
    input.billingDate || !input.dueDay ? billingDate : resolvePaymentDateFromDueDay(input.dueDay);
  const serviceEndDate = input.serviceEndDate
    ? parseArgentineDateInputAsArcaDate(input.serviceEndDate)
    : defaultServiceEndDate;
  const serviceStartDate = input.serviceStartDate
    ? parseArgentineDateInputAsArcaDate(input.serviceStartDate)
    : serviceEndDate;

  ensureDateOrder(serviceStartDate, serviceEndDate);

  return { serviceEndDate, serviceStartDate };
}

export function resolveBillingDateRange(
  input: BillingCommandInput,
  voucherKind: VoucherKindDefinition,
  today = formatDateAsArcaDate(new Date()),
): BillingDateRange {
  validateConceptDateInputs(input, voucherKind);

  const billingDate = input.billingDate ? parseArgentineDateInputAsArcaDate(input.billingDate) : today;

  validateBillingDateWindow(billingDate, today, input.concept, voucherKind);

  const serviceDates = input.concept === 'productos' ? undefined : resolveServiceDates(input, billingDate);

  if (!shouldSendPaymentDueDate(input, voucherKind)) {
    return { billingDate, ...serviceDates };
  }

  // FCE: el vencimiento no puede ser anterior a la fecha del comprobante ni a hoy (10164).
  const minimumPaymentDueDate = isElectronicCreditInvoice(voucherKind) ? maxArcaDate(billingDate, today) : billingDate;
  const paymentDueDate = input.paymentDueDate
    ? parseArgentineDateInputAsArcaDate(input.paymentDueDate)
    : maxArcaDate(serviceDates?.serviceEndDate ?? minimumPaymentDueDate, minimumPaymentDueDate);

  validatePaymentDueDate(paymentDueDate, minimumPaymentDueDate);

  return { billingDate, paymentDueDate, ...serviceDates };
}
