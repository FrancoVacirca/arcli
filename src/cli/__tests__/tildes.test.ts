import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * La salida humana va en voseo y con tildes. Busca las palabras sin tilde mas comunes en los textos de src
 * (literales con espacios). No mira comandos de ejemplo ("arcli ..."), lo que va entre comillas dobles,
 * ni flags, claves o marcadores (`--produccion`, `emisor.razonSocial`, `<numero>`): eso es contrato.
 */
const UNACCENTED = [
  'alicuota',
  'codigo',
  'condicion',
  'configuracion',
  'cotizacion',
  'credito',
  'debito',
  'electronica',
  'emision',
  'invalido',
  'numero',
  'padron',
  'periodo',
  'produccion',
  'ultimos',
  'valido',
  'version',
];
const USTED = [
  'Use',
  'Revise',
  'Verifique',
  'Configure',
  'Corra',
  'Indique',
  'Elija',
  'Complete',
  'Reintente',
  'Espere',
];

const SRC = new URL('../../', import.meta.url).pathname;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);

    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : sourceFiles(path);
    }

    return path.endsWith('.ts') ? [path] : [];
  });
}

/** El codigo sin comentarios, para no confundir backticks de un comentario con un template. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function humanText(literal: string): string {
  let text = literal;

  // Las expresiones de un template pueden tener llaves adentro: se sacan de adentro hacia afuera.
  while (/\$\{[^{}]*\}/.test(text)) {
    text = text.replace(/\$\{[^{}]*\}/g, '');
  }

  return text.replace(/arcli\s.*$/s, '').replace(/"[^"]*"/g, '');
}

describe('textos en voseo y con tildes', () => {
  it('no deja las palabras más comunes sin tilde ni en usted', () => {
    const words = new RegExp(`(?<![\\w.<\\-/])(${UNACCENTED.join('|')}|${USTED.join('|')})(?![\\w>\\-/])`, 'i');
    const offenders = sourceFiles(SRC).flatMap((file) =>
      [...withoutComments(readFileSync(file, 'utf8')).matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)]
        .map((match) => humanText(match[1] ?? match[2] ?? ''))
        // Un template anidado en otro corta mal el literal y deja codigo: se descarta.
        .filter((text) => text.includes(' ') && !text.includes('=>'))
        .flatMap((text) => {
          const found = words.exec(text)?.[1];

          // USTED distingue mayusculas ("Use" si, "use" de "en uso" no); el resto no.
          return found && (UNACCENTED.includes(found.toLowerCase()) || USTED.includes(found))
            ? [`${file.replace(SRC, 'src/')}: ${found} → ${text.trim().slice(0, 80)}`]
            : [];
        }),
    );

    expect(offenders).toEqual([]);
  });
});
