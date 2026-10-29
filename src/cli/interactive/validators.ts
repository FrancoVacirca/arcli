import { parseArgentineDateInputAsArcaDate } from '../../lib/dates/arca-date';
import { parseCuit } from '../../lib/identity/cuit';
import { EXCHANGE_RATE_DECIMALS, parseArgentineAmount } from '../../lib/numbers/argentine-amount';

export function validateAmount(value: string): string | true {
  const result = parseArgentineAmount(value);

  return result.ok ? true : `Monto invalido: ${result.reason}. Por ejemplo 150000, 150.000 o 1.500,50.`;
}

export function validateCuit(value: string): string | true {
  const result = parseCuit(value);

  return result.ok ? true : `El CUIT ${result.reason}.`;
}

export function validateDni(value: string): string | true {
  return /^\d{7,8}$/.test(value.replace(/\./g, '')) ? true : 'El DNI tiene 7 u 8 digitos.';
}

export function validateCbu(value: string): string | true {
  return /^\d{22}$/.test(value) ? true : 'El CBU tiene 22 digitos.';
}

export function normalizeDocumentNumber(value: string): number {
  return Number(value.replace(/[-.]/g, ''));
}

export function validateDate(value: string): string | true {
  try {
    parseArgentineDateInputAsArcaDate(value);

    return true;
  } catch {
    return 'Fecha invalida. Usa D/M/AAAA, D/M o solo el dia (por ejemplo 15/10).';
  }
}

/** Monto opcional: vacio es "no", si no tiene que ser un monto valido. */
export function validateOptionalAmount(value: string): string | true {
  return value.trim() === '' ? true : validateAmount(value);
}

export function validateExchangeRate(value: string): string | true {
  const result = parseArgentineAmount(value, { maxDecimals: EXCHANGE_RATE_DECIMALS });

  if (!result.ok) {
    return `Cotizacion invalida: ${result.reason}. Por ejemplo 1200 o 1.185,50.`;
  }

  return result.value !== 1 ? true : 'Ingresa la cotizacion acordada, por ejemplo 1200 o 1.185,50.';
}
