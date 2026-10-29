import { describe, expect, it } from 'vitest';

import { parseCuit } from '../cuit';

describe('parseCuit', () => {
  it('accepts a CUIT with or without separators and returns the 11 digits', () => {
    expect(parseCuit('20409509763')).toEqual({ ok: true, value: '20409509763' });
    expect(parseCuit('20-40950976-3')).toEqual({ ok: true, value: '20409509763' });
    expect(parseCuit(' 30 70996581 2 ')).toEqual({ ok: true, value: '30709965812' });
    expect(parseCuit('20.40950976.3')).toEqual({ ok: true, value: '20409509763' });
    expect(parseCuit(30546689979)).toEqual({ ok: true, value: '30546689979' });
  });

  it('uses 0 when the formula gives 11 and rejects every digit when it gives 10', () => {
    expect(parseCuit('20010000050')).toEqual({ ok: true, value: '20010000050' });
    expect(parseCuit('20010000000')).toMatchObject({ ok: false });
    expect(parseCuit('20010000001')).toMatchObject({ ok: false });
  });

  it('rejects the wrong number of digits or other characters', () => {
    expect(parseCuit('2040950976')).toEqual({ ok: false, reason: expect.stringMatching(/11 digitos/) });
    expect(parseCuit('204095097634')).toMatchObject({ ok: false });
    expect(parseCuit('20-4095O976-3')).toMatchObject({ ok: false });
    expect(parseCuit('')).toMatchObject({ ok: false });
  });

  it('rejects a wrong check digit', () => {
    expect(parseCuit('20-40950976-4')).toEqual({ ok: false, reason: expect.stringMatching(/digito verificador/) });
  });
});
