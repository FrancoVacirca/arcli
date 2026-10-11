import { describe, expect, it } from 'vitest';

import { stripAnsi } from '../../../ui';
import { renderExamples } from '../examples';

describe('examples', () => {
  it('includes minima and full examples in long and short forms', () => {
    const output = stripAnsi(renderExamples());

    expect(output).toContain('[MINIMA LARGA]');
    expect(output).toContain('[MINIMA CORTA]');
    expect(output).toContain('[FULL LARGA]');
    expect(output).toContain('[FULL CORTA]');
    expect(output).toContain('arcli factura c --monto 300000');
    expect(output).toContain('arcli fc -m 300000 --cs --cfinal --ir-cf --previsualizar');
  });

  it('uses dates relative to today and includes the FCE data', () => {
    const output = stripAnsi(renderExamples(new Date('2026-03-18T15:00:00Z')));

    expect(output).toContain('-f 18-03-2026 --mda PES --cm 1 --sd 01-03-2026 --sh 18-03-2026 --vto 28-03-2026');
    expect(output).toContain(
      'arcli fcea -m 1 --cs --cuit 20168598204 --ir-ri --cbu 0110599520000012345678 --previsualizar',
    );
    expect(output).toContain('--acuit 20409509763 --afecha 01-03-2026 --previsualizar');
  });
});
