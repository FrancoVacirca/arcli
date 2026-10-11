import { describe, expect, it } from 'vitest';

import { parseDocumentNumber, parseStrictInteger } from '../strict-integer';

describe('parseStrictInteger', () => {
  it.each([
    ['3', 3],
    [' 12 ', 12],
    ['0', 0],
  ])('lee %s como %s', (raw, expected) => {
    expect(parseStrictInteger(raw)).toBe(expected);
  });

  it.each(['', '3a', '3.5', '-3', '1e3', '0x10', '20111111112xyz'])('rechaza %s', (raw) => {
    expect(parseStrictInteger(raw)).toBeUndefined();
  });
});

describe('parseDocumentNumber', () => {
  it.each([
    ['20-11111111-2', 20111111112],
    ['30.111.222', 30111222],
    ['20 11111111 2', 20111111112],
  ])('lee %s como %s', (raw, expected) => {
    expect(parseDocumentNumber(raw)).toBe(expected);
  });

  it.each(['20111111112xyz', 'abc', ''])('rechaza %s', (raw) => {
    expect(parseDocumentNumber(raw)).toBeUndefined();
  });
});
