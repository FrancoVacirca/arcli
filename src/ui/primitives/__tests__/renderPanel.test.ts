import { afterEach, describe, expect, it } from 'vitest';

import { renderPanel } from '../renderPanel';
import { stripAnsi } from '../text';

function withColors(run: () => void): void {
  const isTty = process.stdout.isTTY;
  const noColor = process.env.NO_COLOR;
  const forceColor = process.env.FORCE_COLOR;

  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;

  try {
    run();
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: isTty });

    if (noColor !== undefined) {
      process.env.NO_COLOR = noColor;
    }

    if (forceColor !== undefined) {
      process.env.FORCE_COLOR = forceColor;
    }
  }
}

describe('renderPanel', () => {
  it('does not add an extra blank body line when only subtitle is present', () => {
    const output = renderPanel({
      content: [],
      subtitle: 'Galeria visual del CLI',
      title: 'Terminal Storybook',
      width: 48,
    });

    expect(output).toContain('Galeria visual del CLI');
    expect(output).not.toContain(
      '│                                              │\n│                                              │\n│                                              │',
    );
  });

  it('renders footer divider and footer when provided', () => {
    const output = renderPanel({
      content: ['Línea 1', 'Línea 2'],
      footer: 'APROBADO',
      footerDivider: true,
      title: 'Demo',
      width: 40,
    });

    expect(output).toContain('APROBADO');
    expect(output).toContain('═');
  });

  describe('bordes', () => {
    const previousAscii = process.env.ARCLI_ASCII;

    afterEach(() => {
      if (previousAscii === undefined) {
        delete process.env.ARCLI_ASCII;
      } else {
        process.env.ARCLI_ASCII = previousAscii;
      }
    });

    it.each([
      ['ticket', '╒', '├┄'],
      ['warning', '┌', '├╌'],
      ['info', '╭', '├─'],
      ['data', '┌', '├┈'],
    ] as const)('dibuja el borde %s con su línea divisoria unida al borde', (borderType, corner, junction) => {
      const lines = stripAnsi(renderPanel({ borderType, content: ['x'], footer: 'OK', footerDivider: true, width: 30 }))
        .split('\n')
        // El ticket va centrado: se saca la sangria.
        .map((line) => line.trimStart());

      expect(lines[0]?.startsWith(corner)).toBe(true);
      expect(lines.some((line) => line.startsWith(junction) && line.length === 30)).toBe(true);
    });

    it.each([
      ['common', '╒'],
      ['error', '╭'],
      ['note', '┌'],
      ['debug', '┌'],
    ] as const)('el borde %s mantiene el divisor interno de siempre', (borderType, corner) => {
      const lines = stripAnsi(
        renderPanel({ borderType, content: ['x'], footer: 'OK', footerDivider: true, width: 30 }),
      ).split('\n');

      expect(lines[0]?.startsWith(corner)).toBe(true);
      expect(lines.some((line) => line.includes('══════'))).toBe(true);
    });

    it('el borde de error tiene la franja gruesa solo a la izquierda', () => {
      const lines = stripAnsi(renderPanel({ borderType: 'error', content: ['x'], width: 30 })).split('\n');

      expect(lines.slice(1, -1).every((line) => line.startsWith('┃') && line.endsWith('│'))).toBe(true);
    });

    it('el borde de aviso solo dibuja las esquinas', () => {
      const lines = stripAnsi(renderPanel({ borderType: 'note', content: ['x'], width: 30 })).split('\n');

      expect(lines[0]).toBe(`┌${' '.repeat(28)}┐`);
      expect(lines.at(-1)).toBe(`└${' '.repeat(28)}┘`);
      expect(lines.slice(1, -1).every((line) => !/[│|┃]/.test(line))).toBe(true);
    });

    it.each([
      ['attention', '╏'],
      ['tip', '┆'],
    ] as const)('el borde %s lleva su franja a la izquierda', (borderType, stripe) => {
      const lines = stripAnsi(renderPanel({ borderType, content: ['x'], width: 30 })).split('\n');

      expect(lines.slice(1, -1).every((line) => line.startsWith(stripe) && line.endsWith('│'))).toBe(true);
    });

    it('la ficha lleva el titulo a la izquierda', () => {
      const [top] = stripAnsi(
        renderPanel({ borderType: 'sheet', content: ['x'], title: 'Configuracion', width: 40 }),
      ).split('\n');

      expect(top?.startsWith('┌ CONFIGURACION ─')).toBe(true);
    });

    it('el checklist une el veredicto al borde doble', () => {
      const lines = stripAnsi(
        renderPanel({ borderType: 'checklist', content: ['✓ ok'], footer: 'Lista', footerDivider: true, width: 30 }),
      ).split('\n');

      expect(lines[0]?.startsWith('╓')).toBe(true);
      expect(lines).toContain(`╟${'─'.repeat(28)}╢`);
    });

    it('el listado no dibuja bordes a los costados', () => {
      const lines = stripAnsi(
        renderPanel({ borderType: 'listing', content: ['fila'], title: 'Ultimos', width: 30 }),
      ).split('\n');

      expect(lines[0]?.startsWith('═ ULTIMOS ═')).toBe(true);
      expect(lines.at(-1)).toBe('═'.repeat(30));
      expect(lines.slice(1, -1).every((line) => !/[│║┃]/.test(line))).toBe(true);
    });

    it('el estilo command no dibuja borde derecho ni parte las lineas', () => {
      const command = 'arcli fc -m 1000 --cs --consumidor-final --ir consumidor-final --emitir';
      const output = stripAnsi(
        renderPanel({ borderType: 'command', content: ['Esto equivale a:', '', command], width: 30 }),
      );

      expect(output.split('\n')).toEqual(['▎ Esto equivale a:', `▎ ${command}`]);
    });

    it('con ARCLI_ASCII=1 usa solo caracteres ASCII', () => {
      process.env.ARCLI_ASCII = '1';

      const panel = stripAnsi(
        renderPanel({ borderType: 'ticket', content: ['x'], footer: 'OK', footerDivider: true, title: 'Demo' }),
      );
      const command = stripAnsi(renderPanel({ borderType: 'command', content: ['arcli fc'] }));

      expect(/^[\x20-\x7E\n]*$/.test(panel)).toBe(true);
      expect(command).toBe('| arcli fc');
    });
  });

  it('preserves indentation when wrapping multiline pretty content', () => {
    const output = stripAnsi(
      renderPanel({
        content: ['{', '  "Msg": "uno dos tres cuatro cinco seis siete ocho nueve diez once doce"', '}'],
        maxWidth: 24,
        title: 'Demo',
        width: 24,
      }),
    );

    expect(output).toContain('│    "Msg": "uno dos');
    expect(output).toContain('│    tres cuatro');
    expect(output).toContain('│    cinco seis siete');
  });

  describe('ancho de la terminal', () => {
    const original = { stderr: process.stderr.columns, stdout: process.stdout.columns };

    afterEach(() => {
      mockColumns(original.stdout, original.stderr);
    });

    function mockColumns(stdout: number | undefined, stderr = stdout): void {
      Object.defineProperty(process.stdout, 'columns', { configurable: true, value: stdout, writable: true });
      Object.defineProperty(process.stderr, 'columns', { configurable: true, value: stderr, writable: true });
    }

    function widestLine(output: string): number {
      return Math.max(
        ...stripAnsi(output)
          .split('\n')
          .map((line) => line.length),
      );
    }

    it('achica el panel para que entre en una terminal angosta', () => {
      mockColumns(50);

      const output = renderPanel({
        content: ['Moneda                 Pesos argentinos (ARS)'],
        title: 'Factura',
        width: 'standard',
      });

      expect(widestLine(output)).toBeLessThanOrEqual(50);
    });

    it('el ticket es mas angosto y va centrado en el ancho de las cajas', () => {
      mockColumns(200);

      const lines = stripAnsi(renderPanel({ borderType: 'ticket', content: ['hola'], width: 'ticket' })).split('\n');

      expect(lines[0]).toMatch(/^ {12}╒═+╕$/);
      expect(lines[0]?.trimStart()).toHaveLength(68);
    });

    it('todas las cajas miden lo mismo cuando la terminal es ancha o desconocida', () => {
      mockColumns(200);
      expect(widestLine(renderPanel({ content: ['hola'], width: 'compact' }))).toBe(92);
      expect(widestLine(renderPanel({ content: ['x'.repeat(150)], width: 'wide' }))).toBe(92);

      mockColumns(undefined);
      expect(widestLine(renderPanel({ content: ['hola'], width: 'standard' }))).toBe(92);
    });
  });

  it('colorea el titulo cuando se pide un color', () => {
    withColors(() => {
      expect(renderPanel({ content: ['x'], title: 'Aprobado', titleColor: 'success' })).toContain('\u001B[32m');
      expect(renderPanel({ content: ['x'], title: 'Neutro' })).not.toContain('\u001B[32m');
    });
  });
});
