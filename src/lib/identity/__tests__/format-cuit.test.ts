import { describe, expect, it } from 'vitest';

import { formatCuit } from '../format-cuit';

describe('formatCuit', () => {
  it('agrega los guiones', () => {
    expect(formatCuit(20333333334)).toBe('20-33333333-4');
  });

  it('deja igual lo que no tiene 11 digitos', () => {
    expect(formatCuit('123')).toBe('123');
  });
});
