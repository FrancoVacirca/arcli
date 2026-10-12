import { describe, expect, it } from 'vitest';

import { formatTerminalOutput, sanitizeTerminalText } from '../terminal-stream';

const ESC = '\u001B';

describe('sanitizeTerminalText', () => {
  it('keeps colors, line breaks and tabs', () => {
    const text = `${ESC}[1m${ESC}[38;2;255;0;0mPRODUCCION${ESC}[39m${ESC}[22m\n\tok`;

    expect(sanitizeTerminalText(text)).toBe(text);
  });

  it.each([
    ['cursor up and clear line', `ok${ESC}[1A${ESC}[2Kfalso`, 'okfalso'],
    ['clear screen', `${ESC}[2J${ESC}[Hhola`, 'hola'],
    ['carriage return that overwrites the line', 'PRODUCCION\rTESTING   ', 'PRODUCCIONTESTING   '],
    ['OSC 8 hyperlink', `${ESC}]8;;https://malo.example${ESC}\\clic${ESC}]8;;${ESC}\\`, 'clic'],
    ['window title with BEL', `${ESC}]0;titulo\u0007texto`, 'texto'],
    ['bare ESC and C1 CSI', `a${ESC}cb\u009B2Jc`, 'ab2Jc'],
    ['other control characters', 'a\u0000b\u0007c\u007Fd', 'abcd'],
  ])('removes %s', (_, input, expected) => {
    expect(sanitizeTerminalText(input)).toBe(expected);
  });

  it('is applied to everything written to the terminal', () => {
    expect(formatTerminalOutput(`Observacion: ${ESC}[2Jlimpio`)).toBe('\nObservacion: limpio\n\n');
  });
});
