import type { Command } from 'commander';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { configPublicKeySchema } from '../../modules/config/config.schemas';
import { createProgram } from '../program';

/**
 * Comandos, flags y claves de config son contrato público: cada uno tiene que estar en la doc que le
 * corresponde según la tabla de CONTRIBUTING.md y en llms.txt. Si este test falla, documentá lo que
 * lista; si es algo que no se documenta a propósito, sumalo a las excepciones con el motivo.
 */
const UNDOCUMENTED_FLAGS = new Set([
  '--version', // lo agrega commander
]);

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const docsDir = new URL('docs/', root);
const allDocs = readdirSync(docsDir)
  .filter((file) => file.endsWith('.md'))
  .map((file) => readFileSync(new URL(file, docsDir), 'utf8'))
  .join('\n');
const cliReference = read('docs/cli-reference.md');
const configuration = read('docs/configuration.md');
const llms = read('llms.txt');

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (text: string) => `(?<![\\w.-])${escape(text)}(?![\\w-])`;
const mentions = (doc: string, text: string) => new RegExp(word(text)).test(doc);

/** `config ruta` o la forma compacta `config [revisar|ruta|eliminar]`. */
function mentionsCommand(doc: string, path: string[]): boolean {
  if (mentions(doc, path.join(' '))) return true;
  const parent = path.slice(0, -1).join(' ');
  const leaf = path.at(-1) ?? '';
  return parent !== '' && new RegExp(`${word(parent)} \\[[^\\]]*${word(leaf)}[^\\]]*\\]`).test(doc);
}

/** El script de autocompletado lo llama en cada Tab; no se usa a mano. */
const UNDOCUMENTED_COMMANDS = new Set(['__completar']);

/** Herramientas de desarrollo ocultas en la ayuda: van en docs/development.md, no en llms.txt. */
const INTERNAL_COMMANDS = new Set(['storybook']);

function collect(program: Command) {
  const commands: string[][] = [];
  const flags = new Set<string>();
  const walk = (command: Command, path: string[]) => {
    for (const option of command.options) {
      if (option.long && !option.hidden) flags.add(option.long);
    }
    for (const sub of command.commands) {
      if (UNDOCUMENTED_COMMANDS.has(sub.name())) continue;
      commands.push([...path, sub.name()]);
      walk(sub, [...path, sub.name()]);
    }
  };
  walk(program, []);
  return { commands, flags: [...flags].filter((flag) => !UNDOCUMENTED_FLAGS.has(flag)) };
}

const { commands, flags } = collect(createProgram());

describe('docs al día con el CLI', () => {
  it('encuentra comandos y flags para revisar', () => {
    expect(commands.length).toBeGreaterThan(10);
    expect(flags.length).toBeGreaterThan(10);
  });

  it.each([
    ['docs/', allDocs],
    ['llms.txt', llms],
  ])('cada comando aparece en %s', (name, doc) => {
    const expected = name === 'llms.txt' ? commands.filter((path) => !INTERNAL_COMMANDS.has(path[0] ?? '')) : commands;

    expect(expected.filter((path) => !mentionsCommand(doc, path)).map((path) => path.join(' '))).toEqual([]);
  });

  it.each([
    ['docs/cli-reference.md', cliReference],
    ['llms.txt', llms],
  ])('cada flag aparece en %s', (_name, doc) => {
    expect(flags.filter((flag) => !mentions(doc, flag))).toEqual([]);
  });

  it.each([
    ['docs/configuration.md', configuration],
    ['llms.txt', llms],
  ])('cada clave de config aparece en %s', (_name, doc) => {
    expect(configPublicKeySchema.options.filter((key) => !mentions(doc, key))).toEqual([]);
  });
});
