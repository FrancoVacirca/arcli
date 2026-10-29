import { describe, expect, it } from 'vitest';

import { InputValidationError } from '../../errors/app-error';
import {
  diffArcaDatesInDays,
  formatArcaDateAsArgentineDate,
  formatDateAsArcaDate,
  maxArcaDate,
  parseArgentineDateInputAsArcaDate,
} from '../arca-date';

const referenceDate = new Date('2026-08-20T12:00:00Z');

describe('arca-date', () => {
  it.each([
    ['18-03-2026', '20260318'],
    ['18/03/2026', '20260318'],
    ['5/8/26', '20260805'],
    ['5-8-26', '20260805'],
    ['05/9', '20260905'],
    ['09-08', '20260809'],
    ['5', '20260805'],
    ['05', '20260805'],
  ])('parses %s as %s', (input, expected) => {
    expect(parseArgentineDateInputAsArcaDate(input, referenceDate)).toBe(expected);
  });

  it('formats a Date as an ARCA date', () => {
    expect(formatDateAsArcaDate(referenceDate)).toBe('20260820');
  });

  it('uses the Argentine calendar day whatever the machine time zone', () => {
    // 22:30 del 20/08 en Argentina; en UTC ya es el 21.
    expect(formatDateAsArcaDate(new Date('2026-08-21T01:30:00Z'))).toBe('20260820');
    // 00:30 del 21/08 en Argentina.
    expect(formatDateAsArcaDate(new Date('2026-08-21T03:30:00Z'))).toBe('20260821');
  });

  it('completes month and year from the Argentine day', () => {
    // 22:00 del 31/07 en Argentina: "15" es el 15 de julio, aunque en UTC ya sea agosto.
    expect(parseArgentineDateInputAsArcaDate('15', new Date('2026-08-01T01:00:00Z'))).toBe('20260715');
    // 22:00 del 31/12/2026 en Argentina: el ano todavia es 2026.
    expect(parseArgentineDateInputAsArcaDate('1/12', new Date('2027-01-01T01:00:00Z'))).toBe('20261201');
  });

  it('computes day differences across months', () => {
    expect(diffArcaDatesInDays('20260330', '20260402')).toBe(3);
    expect(diffArcaDatesInDays('20260402', '20260330')).toBe(-3);
  });

  it('picks the latest ARCA date', () => {
    expect(maxArcaDate('20260318', '20260402', '20260320')).toBe('20260402');
  });

  it('formats an ARCA date in Argentine format', () => {
    expect(formatArcaDateAsArgentineDate('20260318')).toBe('18/03/2026');
  });

  it('rejects ISO dates', () => {
    expect(() => parseArgentineDateInputAsArcaDate('2026-08-09', referenceDate)).toThrow(InputValidationError);
    expect(() => parseArgentineDateInputAsArcaDate('2026-08-09', referenceDate)).toThrow(
      /Usá D, DD, D-MM, D\/MM, D-MM-YY, D\/MM\/YY, D-MM-YYYY o D\/MM\/YYYY/,
    );
  });

  it('rejects impossible dates', () => {
    expect(() => parseArgentineDateInputAsArcaDate('31/02/2026', referenceDate)).toThrow(
      /La fecha "31\/02\/2026" no es válida/,
    );
  });
});
