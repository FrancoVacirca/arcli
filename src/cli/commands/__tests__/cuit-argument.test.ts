import { describe, expect, it } from 'vitest';

import { parseCuitArgument } from '../cuit-argument';

describe('parseCuitArgument', () => {
  it('accepts the CUIT with or without dashes', () => {
    expect(parseCuitArgument('20201797064')).toBe(20201797064);
    expect(parseCuitArgument('20-20179706-4')).toBe(20201797064);
  });

  it('rejects a wrong length or check digit', () => {
    expect(() => parseCuitArgument('2020179706')).toThrow(/debe tener 11 digitos/);
    expect(() => parseCuitArgument('20-20179706-5')).toThrow(/digito verificador/);
  });
});
