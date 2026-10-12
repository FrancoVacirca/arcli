import { describe, expect, it } from 'vitest';

import { extractChangelog } from '../changelog';

const CHANGELOG = `# Changelog

## [Sin publicar]

### Agregado

- **Algo sin publicar:** no tiene que aparecer.

## [1.10.0] - 2026-10-20

Suma \`arcli algo\`. Ningún flag cambia.

### Agregado

- **Nuevo comando \`arcli algo\`:** hace algo.
- **Modo interactivo:**
  - **Repetir una factura:** copia una anterior.
- **Docs:** guía nueva del modo interactivo. Y otra cosa.
- Un cambio sin negrita. Con una segunda oración.

## [1.9.0] - 2026-10-12

### Corregido

- **Ver la [guía](https://example.com):** link arreglado.

## [1.8.0] - 2026-10-09

### Cambiado

- **Ya instalada:** no tiene que aparecer.
`;

describe('extractChangelog', () => {
  it('trae las versiones nuevas, de la mas nueva a la mas vieja, sin la instalada ni lo sin publicar', () => {
    expect(extractChangelog(CHANGELOG, '1.8.0', '1.10.0')).toEqual([
      {
        changes: [
          { kind: 'agregado', nested: false, text: 'Nuevo comando arcli algo' },
          { kind: 'agregado', nested: false, text: 'Modo interactivo' },
          { kind: 'agregado', nested: true, text: 'Repetir una factura' },
          { kind: 'agregado', nested: false, text: 'guía nueva del modo interactivo.', topic: 'Docs' },
          { kind: 'agregado', nested: false, text: 'Un cambio sin negrita.' },
        ],
        date: '2026-10-20',
        summary: 'Suma arcli algo.',
        version: '1.10.0',
      },
      { changes: [{ kind: 'corregido', nested: false, text: 'Ver la guía' }], date: '2026-10-12', version: '1.9.0' },
    ]);
  });

  it('no pasa de la ultima version publicada', () => {
    expect(extractChangelog(CHANGELOG, '1.8.0', '1.9.0').map((entry) => entry.version)).toEqual(['1.9.0']);
  });

  it('sin versiones nuevas devuelve una lista vacia', () => {
    expect(extractChangelog(CHANGELOG, '1.10.0', '1.10.0')).toEqual([]);
  });
});
