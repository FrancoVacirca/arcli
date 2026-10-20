import { highlightJsonValues } from '../primitives/renderJson';
import { supportsColor } from '../primitives/text';

interface TerminalStreamOptions {
  readonly json?: boolean;
  readonly target?: 'stderr' | 'stdout';
}

// OSC (titulo, hipervinculos), CSI (cursor, borrar pantalla, colores), otros ESC y caracteres de control sueltos.
/* eslint-disable no-control-regex */
const TERMINAL_SEQUENCES =
  /\u001B\][\s\S]*?(?:\u0007|\u001B\\)|\u001B\[[0-?]*[ -/]*[@-~]|\u001B[@-~]|[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
const COLOR_SEQUENCE = /^\u001B\[[0-9;]*m$/;
/* eslint-enable no-control-regex */

/**
 * Lo que se muestra incluye textos de afuera (observaciones de ARCA, datos del JSON, errores de npm). Solo pasan
 * los colores (SGR), saltos de linea y tabs: un texto no puede mover el cursor, borrar la pantalla ni pisar una
 * linea para ocultar, por ejemplo, el aviso de PRODUCCION.
 */
export function sanitizeTerminalText(content: string): string {
  return content.replace(TERMINAL_SEQUENCES, (sequence) => (COLOR_SEQUENCE.test(sequence) ? sequence : ''));
}

export function formatTerminalOutput(content: string, options: TerminalStreamOptions = {}): string {
  const target = options.target ?? 'stdout';
  const safeContent = sanitizeTerminalText(content);
  const renderedContent =
    options.json && shouldHighlightJson(target) ? highlightJsonValues(safeContent, target) : safeContent;

  return `\n${renderedContent}\n\n`;
}

// FORCE_COLOR no alcanza para pintar el JSON: si va a un pipe o a un archivo, tiene que poder parsearse.
function shouldHighlightJson(target: 'stderr' | 'stdout'): boolean {
  const stream = target === 'stderr' ? process.stderr : process.stdout;

  return stream.isTTY === true && supportsColor(target);
}

export function writeTerminalOutput(content: string): void {
  process.stdout.write(formatTerminalOutput(content, { target: 'stdout' }));
}

export function writeTerminalJson(content: string): void {
  process.stdout.write(formatTerminalOutput(content, { json: true, target: 'stdout' }));
}

export function writeTerminalError(content: string): void {
  process.stderr.write(formatTerminalOutput(content, { target: 'stderr' }));
}

export function writeTerminalJsonError(content: string): void {
  process.stderr.write(formatTerminalOutput(content, { json: true, target: 'stderr' }));
}
