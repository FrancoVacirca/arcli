import { describe, expect, it } from 'vitest';

import { parseCuit } from '../cuit';

describe('parseCuit', () => {
  it('accepts a CUIT with or without separators and returns the 11 digits', () => {
    expect(parseCuit('20333333334')).toEqual({ ok: true, value: '20333333334' });
    expect(parseCuit('20-33333333-4')).toEqual({ ok: true, value: '20333333334' });
    expect(parseCuit(' 30 70996581 2 ')).toEqual({ ok: true, value: '30709965812' });
    expect(parseCuit('20.33333333.4')).toEqual({ ok: true, value: '20333333334' });
    expect(parseCuit(30546689979)).toEqual({ ok: true, value: '30546689979' });
  });

  it('uses 0 when the formula gives 11 and rejects every digit when it gives 10', () => {
    expect(parseCuit('20010000050')).toEqual({ ok: true, value: '20010000050' });
    expect(parseCuit('20010000000')).toMatchObject({ ok: false });
    expect(parseCuit('20010000001')).toMatchObject({ ok: false });
  });

  it('rejects the wrong number of digits or other characters', () => {
    expect(parseCuit('2033333333')).toEqual({ ok: false, reason: expect.stringMatching(/11 digitos/) });
    expect(parseCuit('203333333344')).toMatchObject({ ok: false });
    expect(parseCuit('20-3333O333-4')).toMatchObject({ ok: false });
    expect(parseCuit('')).toMatchObject({ ok: false });
  });

  it('rejects a wrong check digit', () => {
    expect(parseCuit('20-33333333-5')).toEqual({ ok: false, reason: expect.stringMatching(/digito verificador/) });
  });
});
