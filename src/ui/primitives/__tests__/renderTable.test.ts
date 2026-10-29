import { describe, expect, it } from 'vitest';

import { renderTable } from '../renderTable';

describe('renderTable', () => {
  it('renders key value rows with aligned labels', () => {
    const output = renderTable([
      ['CUIT', '20-33333333-4'],
      ['Punto de venta', '3'],
    ]);

    expect(output).toContain('CUIT');
    expect(output).toContain('Punto de venta');
    expect(output).toContain('20-33333333-4');
    expect(output).toContain('3');
  });
});
