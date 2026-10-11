import { EXCHANGE_RATE_DECIMALS, parseArgentineAmount } from '../../lib/numbers/argentine-amount';

/** Monto escrito en el modo interactivo, con las mismas reglas que los flags: `1.500,50`. */
export function parseAmountInput(raw: string): number | undefined {
  const result = parseArgentineAmount(raw);

  return result.ok ? result.value : undefined;
}

/** Cotizacion escrita en el modo interactivo: como un monto, pero con hasta 6 decimales. */
export function parseExchangeRateInput(raw: string): number | undefined {
  const result = parseArgentineAmount(raw, { maxDecimals: EXCHANGE_RATE_DECIMALS });

  return result.ok ? result.value : undefined;
}
