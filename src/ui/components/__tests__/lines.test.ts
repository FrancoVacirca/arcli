import { afterEach, describe, expect, it, vi } from 'vitest';

import { stripAnsi } from '../../primitives/text';
import { sectionHeading } from '../sectionHeading';
import { statusBar } from '../statusBar';

describe('lineas de encabezado', () => {
  const original = process.stdout.columns;

  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: original, writable: true });
    delete process.env.ARCLI_ASCII;
  });

  it('la barra de estado lleva titulo y estado y ocupa el ancho disponible', () => {
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 60, writable: true });

    const bar = stripAnsi(statusBar([{ text: '20-40950976-3' }, { text: 'PV 3' }], [{ text: 'ARCA' }]));

    expect(bar).toMatch(/^━━ 20-40950976-3 · PV 3 ━+ ARCA ━━$/);
    expect(bar).toHaveLength(60);
  });

  it('cada dato puede ir en color', () => {
    // El hook de pre-commit corre con NO_COLOR, que gana sobre FORCE_COLOR.
    vi.stubEnv('NO_COLOR', '');
    vi.stubEnv('FORCE_COLOR', '1');

    try {
      expect(statusBar([{ color: 'success', text: 'ARCA FUNCIONANDO' }])).toContain('\u001B[32m');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('los datos de un lado se pueden separar con un tramo de la barra', () => {
    const bar = stripAnsi(
      statusBar([{ text: 'PV 3' }], [{ text: 'ARCA FUNCIONANDO' }, { text: 'TESTING' }], { rightSeparator: 'rule' }),
    );

    expect(bar).toMatch(/━ ARCA FUNCIONANDO ━ TESTING ━━$/);
  });

  it('el titulo de seccion es una sola linea con el nombre', () => {
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 40, writable: true });

    const heading = stripAnsi(sectionHeading('Factura C'));

    expect(heading).toMatch(/^── FACTURA C ─+$/);
    expect(heading).toHaveLength(40);
  });

  it('con ARCLI_ASCII=1 usa caracteres ASCII', () => {
    process.env.ARCLI_ASCII = '1';

    expect(stripAnsi(statusBar([{ text: 'ARCA FUNCIONANDO' }], [{ text: 'testing' }]))).toMatch(
      /^== ARCA FUNCIONANDO =+ testing ==$/,
    );
    expect(stripAnsi(sectionHeading('Factura C'))).toMatch(/^-- FACTURA C -+$/);
  });
});
