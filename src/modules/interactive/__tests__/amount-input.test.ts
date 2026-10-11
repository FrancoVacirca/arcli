import { describe, expect, it } from 'vitest';

import { parseAmountInput, parseExchangeRateInput } from '../amount-input';

describe('parseAmountInput', () => {
  it.each([
    ['150000', 150000],
    ['150.000', 150000],
    ['1.500.000', 1500000],
    ['1500,50', 1500.5],
    ['1.500,50', 1500.5],
    ['$ 2.000', 2000],
    [' 12 ', 12],
  ])('interpreta %s como %s', (raw, expected) => {
    expect(parseAmountInput(raw)).toBe(expected);
  });

  it.each(['', 'abc', '0', '1,5,0', '-10', '10e3', '1500.50', '1500.5', '1500,555'])('rechaza %s', (raw) => {
    expect(parseAmountInput(raw)).toBeUndefined();
  });
});

describe('parseExchangeRateInput', () => {
  it('acepta hasta 6 decimales', () => {
    expect(parseExchangeRateInput('1.452,123456')).toBe(1452.123456);
    expect(parseExchangeRateInput('1452,1234567')).toBeUndefined();
  });
});
