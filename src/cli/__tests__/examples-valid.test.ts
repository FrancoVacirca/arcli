import type { Command } from 'commander';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BillingService } from '../../modules/billing/billing.service';
import type { VoucherShortcut } from '../../modules/billing/billing.types';
import type { BillingGateway } from '../../modules/billing/billing.types.internal';
import { VOUCHER_FAMILIES, VOUCHER_SHORTCUTS } from '../../modules/billing/voucher-kind-map';
import { ConfigService } from '../../modules/config/config.service';
import { renderExamples } from '../../modules/examples/examples';
import type { PadronGateway } from '../../modules/padron/padron';
import { stripAnsi } from '../../ui';
import { parseBillingCommandPlan } from '../commands/billing.command.parser';
import { resolveBillingCommandDefaults } from '../commands/billing.command.shared';
import { createFamilyHelp, createProgramHelp, createShortcutHelp } from '../help';
import { createProgram } from '../program';

/**
 * Cada ejemplo de facturacion que mostramos (ayuda, `arcli ejemplos`, docs, README y llms.txt) y cada JSON de ejemplo
 * para `--cargar` tiene que pasar por el parser real y armar la solicitud a ARCA, con una config minima y sin red. Si
 * este test falla, arregla el ejemplo que lista; si es invalido a proposito, sumalo aca con el motivo.
 *
 * Por regla no se validan: los pedidos de ayuda (`ayuda`, `--ayuda`), los comandos sin flags (son el nombre del
 * comando, como `arcli factura a`), las sintaxis con marcadores (`<a|b|c>`, `...`) y los `--cargar` (necesitan un
 * archivo; los JSON de los docs se validan aparte).
 */
const EXCLUDED_EXAMPLES = new Map<string, string>([]);

/** Reloj fijo y lejano: un ejemplo con una fecha de comprobante escrita a mano envejece, y tiene que fallar ya. */
const NOW = new Date('2031-06-18T15:00:00Z');

/**
 * El setup minimo (CUIT, credenciales y punto de venta). En un bloque de los docs, los `arcli config establecer`
 * anteriores al ejemplo se suman a esta config.
 */
const BASE_CONFIG: ReadonlyArray<readonly [string, string]> = [
  ['cuit', '20123456789'],
  ['puntoVenta', '3'],
];

/** El padron conoce a cualquier CUIT como responsable inscripto, con nombre y domicilio. */
const padron: PadronGateway = {
  getTaxpayer: async (cuit) => ({
    activities: [],
    address: 'Calle 1, Ciudad',
    cuit,
    ivaCondition: 'responsable-inscripto',
    keyStatus: 'ACTIVO',
    monotributoCategory: null,
    name: 'Cliente SA',
    notices: [],
    personType: 'juridica',
    taxes: [],
  }),
};

const gateway: BillingGateway = {
  createVoucher: () => Promise.reject(new Error('los ejemplos no emiten')),
  getNextVoucherNumber: () => Promise.reject(new Error('los ejemplos no emiten')),
  getQuotation: async () => 1000,
};

const captured: Array<{ command: Command; shortcut: VoucherShortcut }> = [];

vi.mock('../commands/billing.command.shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('../commands/billing.command.shared')>();

  return {
    ...original,
    executeBillingCommand: async (command: Command, shortcut: VoucherShortcut) => {
      captured.push({ command, shortcut });
    },
  };
});

interface Example {
  /** Lo que va despues de `arcli`. */
  readonly args: readonly string[];
  /** `arcli config establecer` que el ejemplo da por hechos, ademas de `BASE_CONFIG`. */
  readonly config: ReadonlyArray<readonly [string, string]>;
  readonly source: string;
}

const BILLING_COMMANDS = new Set<string>([...VOUCHER_SHORTCUTS, ...VOUCHER_FAMILIES]);
const HELP_TOKENS = new Set(['ayuda', '--ayuda', '--help', '-h', 'help']);

const root = new URL('../../../', import.meta.url);
const docFiles = [
  ...readdirSync(new URL('docs/', root))
    .filter((file) => file.endsWith('.md'))
    .map((file) => `docs/${file}`),
  'README.md',
  'llms.txt',
];

/** Separa una linea de shell en palabras, con comillas, y corta en un comentario, un pipe o una redireccion. */
function shellWords(line: string): string[] {
  const words: string[] = [];
  let current: string | null = null;
  let quote: '"' | "'" | null = null;

  for (const char of line) {
    if (quote) {
      if (char === quote) quote = null;
      else current = (current ?? '') + char;
    } else if (char === '"' || char === "'") {
      quote = char;
      current ??= '';
    } else if (/\s/.test(char)) {
      if (current !== null) words.push(current);
      current = null;
    } else if ('#|;&>'.includes(char) && current === null) {
      break;
    } else {
      current = (current ?? '') + char;
    }
  }

  if (current !== null) words.push(current);

  return words;
}

/** Los argumentos despues de `arcli` (o `yarn dev`), o null si la linea no es un comando de arcli. */
function arcliArgs(line: string): string[] | null {
  const words = shellWords(line);
  const start = words.findIndex((word, index) => word === 'arcli' || (word === 'dev' && words[index - 1] === 'yarn'));

  // Antes de `arcli` solo puede haber variables de entorno (`ARCLI_ASCII=1 arcli ...`), `npx` o `yarn`.
  if (start === -1 || !words.slice(0, start).every((word) => /^[A-Z_]+=/.test(word) || /^(npx|yarn)$/.test(word))) {
    return null;
  }

  return words.slice(start + 1);
}

const isBilling = (args: readonly string[] | null): args is string[] => BILLING_COMMANDS.has(args?.[0] ?? '');

function isValidatable(args: readonly string[]): boolean {
  return (
    args.some((arg) => arg.startsWith('-')) &&
    !args.some(
      (arg) =>
        HELP_TOKENS.has(arg) || arg === '--cargar' || arg.includes('...') || arg.includes('…') || /^[<[]/.test(arg),
    )
  );
}

const display = (args: readonly string[]) =>
  ['arcli', ...args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))].join(' ');

function examplesFromText(text: string, source: string): Example[] {
  return stripAnsi(text)
    .split('\n')
    .flatMap((line, index) => {
      const match = /\barcli\s.*$/.exec(line);
      const args = match ? arcliArgs(match[0]) : null;

      return isBilling(args) ? [{ args, config: [], source: `${source}:${index + 1}` }] : [];
    });
}

interface CodeBlock {
  readonly content: string;
  readonly language: string;
  /** Numero de linea (desde 1) de la primera linea de contenido. */
  readonly line: number;
}

function codeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let open: { language: string; line: number; lines: string[] } | null = null;

  text.split('\n').forEach((line, index) => {
    const fence = /^\s*```(\w*)/.exec(line);

    if (fence && !open) {
      open = { language: fence[1] ?? '', line: index + 2, lines: [] };
    } else if (fence && open) {
      blocks.push({ content: open.lines.join('\n'), language: open.language, line: open.line });
      open = null;
    } else {
      open?.lines.push(line);
    }
  });

  return blocks;
}

function examplesFromBashBlock(block: CodeBlock, file: string): Example[] {
  const examples: Example[] = [];
  const config: Array<readonly [string, string]> = [];
  const lines = block.content.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const first = index;
    let line = lines[index] ?? '';

    while (line.endsWith('\\') && index + 1 < lines.length) {
      index += 1;
      line = `${line.slice(0, -1)} ${lines[index] ?? ''}`;
    }

    const args = arcliArgs(line);

    if (args?.[0] === 'config' && args[1] === 'establecer' && args.length === 4) {
      config.push([args[2] as string, args[3] as string]);
    } else if (isBilling(args)) {
      examples.push({ args, config: [...config], source: `${file}:${block.line + first}` });
    }
  }

  return examples;
}

const readDoc = (file: string) => readFileSync(new URL(file, root), 'utf8');

function collectHelpExamples(): Example[] {
  return [
    ...examplesFromText(createProgramHelp(), 'arcli --ayuda'),
    ...VOUCHER_SHORTCUTS.flatMap((shortcut) =>
      examplesFromText(createShortcutHelp(shortcut), `arcli ${shortcut} --ayuda`),
    ),
    ...VOUCHER_FAMILIES.flatMap((family) => examplesFromText(createFamilyHelp(family), `arcli ${family} --ayuda`)),
  ];
}

const collectExamplesCommand = () => examplesFromText(renderExamples(NOW), 'arcli ejemplos');

function collectDocExamples(): Example[] {
  return docFiles.flatMap((file) =>
    codeBlocks(readDoc(file))
      .filter((block) => block.language === 'bash' || block.language === 'sh')
      .flatMap((block) => examplesFromBashBlock(block, file)),
  );
}

interface JsonExample {
  readonly items: readonly Record<string, unknown>[];
  readonly shortcut: VoucherShortcut;
  readonly source: string;
}

/** Un comprobante de entrada de `--cargar` (no una respuesta ni un error): tiene `montoTotal` o `alicuotas`. */
function isBillingInput(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('codigo' in value) &&
    ('montoTotal' in value || 'alicuotas' in value)
  );
}

/** Con asociado, la nota de credito de esa letra (`fa` -> `nca`, `fcea` -> `ncea`); si no, Factura C. */
function shortcutForJsonInput(items: readonly Record<string, unknown>[]): VoucherShortcut {
  const associated = items.map((item) => item.comprobanteAsociado).find((value) => typeof value === 'object');
  const atajo = (associated as { atajo?: unknown } | undefined)?.atajo;

  if (typeof atajo !== 'string') return 'fc';

  return (atajo.startsWith('fce') ? `nce${atajo.slice(3)}` : `nc${atajo.slice(1)}`) as VoucherShortcut;
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function collectJsonExamples(): JsonExample[] {
  return docFiles.flatMap((file) =>
    codeBlocks(readDoc(file))
      .filter((block) => block.language === 'json')
      .flatMap((block) => {
        const value = parseJson(block.content);
        const items: unknown[] = Array.isArray(value) ? value : [value];

        return items.length > 0 && items.every(isBillingInput)
          ? [{ items, shortcut: shortcutForJsonInput(items), source: `${file}:${block.line}` }]
          : [];
      }),
  );
}

function createTestProgram(): Command {
  const program = createProgram();
  const silence = (command: Command) => {
    command.exitOverride().configureOutput({ writeErr: () => {}, writeOut: () => {} });
    command.commands.forEach(silence);
  };

  silence(program);

  return program;
}

function createConfig(settings: ReadonlyArray<readonly [string, string]>) {
  const service = new ConfigService({ cwd: mkdtempSync(join(tmpdir(), 'arcli-ejemplos-')) });

  try {
    for (const [key, value] of [...BASE_CONFIG, ...settings]) service.setValue(key, value);

    return service.getConfig();
  } finally {
    service.close();
  }
}

/** El camino de `executeBillingCommand` hasta la solicitud a ARCA, sin emitir. */
async function validate(args: readonly string[], settings: Example['config'] = []): Promise<void> {
  const config = createConfig(settings);
  const runtime = {
    certificateNotices: [],
    config,
    context: { cert: 'CERT', cuit: Number(config.cuit), key: 'KEY', production: false },
    environment: 'testing' as const,
    outputJson: false,
    outputRaw: false,
    pointOfSale: config.puntoVentaPorDefecto,
  };
  const service = new BillingService();

  captured.length = 0;
  await createTestProgram().parseAsync(['node', 'arcli', ...args]);

  const call = captured[0];

  if (!call) throw new Error('no llego a un comando de facturacion');

  const plan = parseBillingCommandPlan(call.command, call.shortcut, resolveBillingCommandDefaults(config));

  if (plan.invalidItems.length > 0) throw new Error(plan.invalidItems.map((item) => item.message).join('; '));

  for (const input of plan.inputs) {
    const resolution = await service.resolveIvaConditionFromPadron(input, padron);

    service.buildVoucherPayload(await service.resolveExchangeRate(resolution.input, gateway), runtime);
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function findInvalid(examples: readonly Example[]): Promise<string[]> {
  const invalid: string[] = [];

  for (const example of examples) {
    const command = display(example.args);

    if (EXCLUDED_EXAMPLES.has(command) || !isValidatable(example.args)) continue;

    try {
      await validate(example.args, example.config);
    } catch (error) {
      invalid.push(`${example.source}: ${command}\n    ${errorMessage(error)}`);
    }
  }

  return invalid;
}

describe('ejemplos de facturacion validos', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('finds examples to check in every source', () => {
    const validatable = (examples: readonly Example[]) => examples.filter((example) => isValidatable(example.args));

    expect(validatable(collectHelpExamples()).length).toBeGreaterThan(VOUCHER_SHORTCUTS.length * 3);
    expect(validatable(collectExamplesCommand())).toHaveLength(VOUCHER_SHORTCUTS.length * 4);
    expect(validatable(collectDocExamples()).length).toBeGreaterThan(20);
    expect(collectJsonExamples().length).toBeGreaterThan(3);
  });

  it('only excludes examples that still exist', () => {
    const commands = new Set(
      [...collectHelpExamples(), ...collectDocExamples()].map((example) => display(example.args)),
    );

    expect([...EXCLUDED_EXAMPLES.keys()].filter((command) => !commands.has(command))).toEqual([]);
  });

  it('accepts every billing example in the help', async () => {
    expect(await findInvalid(collectHelpExamples())).toEqual([]);
  });

  it('accepts every example of arcli ejemplos', async () => {
    expect(await findInvalid(collectExamplesCommand())).toEqual([]);
  });

  it('accepts every billing command in docs, README and llms.txt', async () => {
    expect(await findInvalid(collectDocExamples())).toEqual([]);
  });

  it('accepts every --cargar JSON example in docs and llms.txt', async () => {
    const invalid: string[] = [];

    for (const example of collectJsonExamples()) {
      const path = join(mkdtempSync(join(tmpdir(), 'arcli-ejemplo-')), 'comprobante.json');

      writeFileSync(path, JSON.stringify(example.items));

      try {
        await validate([example.shortcut, '--cargar', path]);
      } catch (error) {
        invalid.push(`${example.source} (como ${example.shortcut}): ${errorMessage(error)}`);
      }
    }

    expect(invalid).toEqual([]);
  });
});
