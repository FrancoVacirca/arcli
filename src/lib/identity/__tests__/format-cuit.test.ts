import { describe, expect, it } from 'vitest';

import { formatCuit } from '../format-cuit';

describe('formatCuit', () => {
  it('agrega los guiones', () => {
    expect(formatCuit(20409509763)).toBe('20-40950976-3');
  });

  it('deja igual lo que no tiene 11 digitos', () => {
    expect(formatCuit('123')).toBe('123');
  });
});
