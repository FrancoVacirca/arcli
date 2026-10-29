import { InputValidationError } from '../../lib/errors/app-error';

import { DEFAULT_EXCHANGE_RATE } from './billing.constants';
import { resolveBillingCurrencyCode } from './billing.mappers';
import type { BillingCommandInput } from './billing.schemas';

export const ARCA_LOCAL_CURRENCY_CODE = 'PES';

export interface BillingCurrencyFields {
  readonly CanMisMonExt?: 'N' | 'S';
  readonly MonCotiz: number;
  readonly MonId: string;
}

type CurrencyInput = Pick<BillingCommandInput, 'currencyCode' | 'exchangeRate' | 'sameCurrency'>;

export function isForeignCurrency(input: { readonly currencyCode?: string }): boolean {
  return resolveBillingCurrencyCode(input.currencyCode) !== ARCA_LOCAL_CURRENCY_CODE;
}

/**
 * Con CanMisMonExt = S, ARCA exige la cotizacion oficial exacta (error 10038),
 * asi que el CLI la consulta en lugar de pedirsela al usuario.
 */
export function needsOfficialExchangeRate(input: CurrencyInput): boolean {
  return input.sameCurrency && isForeignCurrency(input) && typeof input.exchangeRate !== 'number';
}

export function resolveBillingCurrencyFields(
  input: CurrencyInput,
  billingDate: string,
  today: string,
): BillingCurrencyFields {
  const currencyCode = resolveBillingCurrencyCode(input.currencyCode);
  const inputCurrencyCode = input.currencyCode.trim().toUpperCase();

  if (currencyCode === ARCA_LOCAL_CURRENCY_CODE) {
    if (input.sameCurrency) {
      throw new InputValidationError('--misma-moneda solo aplica a comprobantes en moneda extranjera.');
    }

    if (typeof input.exchangeRate === 'number' && input.exchangeRate !== DEFAULT_EXCHANGE_RATE) {
      throw new InputValidationError('En pesos la cotización debe ser 1. Sacá --cotizacion-moneda o usá --cm 1.');
    }

    // ARCA rechaza CanMisMonExt cuando MonId = PES (error 10241).
    return {
      MonCotiz: DEFAULT_EXCHANGE_RATE,
      MonId: currencyCode,
    };
  }

  if (input.sameCurrency) {
    if (billingDate < today) {
      throw new InputValidationError(
        'Con --misma-moneda la fecha del comprobante no puede ser anterior a hoy: ARCA exige la cotización oficial de ese día y solo se puede consultar la vigente.',
      );
    }

    if (typeof input.exchangeRate !== 'number') {
      throw new InputValidationError(`No se pudo obtener la cotización oficial de ${inputCurrencyCode} desde ARCA.`);
    }

    return {
      CanMisMonExt: 'S',
      MonCotiz: input.exchangeRate,
      MonId: currencyCode,
    };
  }

  if (typeof input.exchangeRate !== 'number' || input.exchangeRate === DEFAULT_EXCHANGE_RATE) {
    throw new InputValidationError(
      `Falta la cotización de ${inputCurrencyCode}. Usá --cotizacion-moneda o --cm, o --misma-moneda si el pago se hace en ${inputCurrencyCode}.`,
    );
  }

  return {
    CanMisMonExt: 'N',
    MonCotiz: input.exchangeRate,
    MonId: currencyCode,
  };
}
