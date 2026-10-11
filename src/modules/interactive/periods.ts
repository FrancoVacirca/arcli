import { toArgentineCalendarDate } from '../../lib/dates/arca-date';

/** Periodos de servicio para repetir una factura: el mes actual o el anterior, en formato D/MM/YYYY. */
export interface ServicePeriod {
  readonly from: string;
  readonly to: string;
}

function format(value: Date): string {
  return `${value.getDate()}/${String(value.getMonth() + 1).padStart(2, '0')}/${value.getFullYear()}`;
}

function monthPeriod(year: number, month: number): ServicePeriod {
  return { from: format(new Date(year, month, 1)), to: format(new Date(year, month + 1, 0)) };
}

// monthPeriod hace la cuenta con fechas locales de punta a punta; solo "hoy" sale de la fecha argentina.
export function currentMonthPeriod(now: Date): ServicePeriod {
  const today = toArgentineCalendarDate(now);

  return monthPeriod(today.year, today.month - 1);
}

export function previousMonthPeriod(now: Date): ServicePeriod {
  const today = toArgentineCalendarDate(now);

  return monthPeriod(today.year, today.month - 2);
}
