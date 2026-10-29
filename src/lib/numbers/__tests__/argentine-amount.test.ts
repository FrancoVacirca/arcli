import { describe, expect, it } from 'vitest';

import {
  EXCHANGE_RATE_DECIMALS,
  formatArgentineAmountInput,
  hasAtMostDecimals,
  parseArgentineAmount,
} from '../argentine-amount';

describe('parseArgentineAmount', () => {
  it.each([
    ['15000', 15000],
    ['15.000', 15000],
    ['1.500.000', 1500000],
    ['100.555', 100555],
    ['1500,5', 1500.5],
    ['1500,50', 1500.5],
    ['1.500,50', 1500.5],
    ['0,01', 0.01],
    ['$ 2.000', 2000],
    ['$2.000,25', 2000.25],
    [' 12 ', 12],
  ])('interpreta %s como %s', (raw, expected) => {
    expect(parseArgentineAmount(raw)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['1500.50', 'usá coma para los decimales'],
    ['1500.5', 'usá coma para los decimales'],
    ['15.00', 'usá coma para los decimales'],
    ['1500,555', 'usá hasta 2 decimales'],
    ['0', 'tiene que ser mayor a 0'],
    ['0,00', 'tiene que ser mayor a 0'],
  ])('rechaza %s: %s', (raw, reason) => {
    expect(parseArgentineAmount(raw)).toEqual({ ok: false, reason });
  });

  it.each(['', 'abc', '12abc', '1,5,0', '-10', '10e3', '1500.555', '1.50.000', '1.500.', ',50', 'Infinity'])(
    'rechaza %s por formato',
    (raw) => {
      expect(parseArgentineAmount(raw)).toEqual({ ok: false, reason: expect.stringContaining('punto para miles') });
    },
  );

  it('acepta mas decimales cuando se piden, como en una cotizacion', () => {
    expect(parseArgentineAmount('1.452,123456', { maxDecimals: EXCHANGE_RATE_DECIMALS })).toEqual({
      ok: true,
      value: 1452.123456,
    });
    expect(parseArgentineAmount('1,1234567', { maxDecimals: EXCHANGE_RATE_DECIMALS })).toEqual({
      ok: false,
      reason: 'usá hasta 6 decimales',
    });
  });
});

describe('formatArgentineAmountInput', () => {
  it.each([
    [1234.5, '1234,5'],
    [1500, '1500'],
    [0.01, '0,01'],
  ])('escribe %s como %s', (value, expected) => {
    expect(formatArgentineAmountInput(value)).toBe(expected);
    expect(parseArgentineAmount(expected)).toEqual({ ok: true, value });
  });
});

describe('hasAtMostDecimals', () => {
  it.each([
    [100, 2, true],
    [100.55, 2, true],
    [0.1, 2, true],
    [100.555, 2, false],
    [1452.123456, 6, true],
    [1452.1234567, 6, false],
    [Number.NaN, 2, false],
  ])('%s con hasta %s decimales: %s', (value, decimals, expected) => {
    expect(hasAtMostDecimals(value, decimals)).toBe(expected);
  });
});
