import { CommanderError } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigService } from '../../modules/config/config.service';
import { reportCliError } from '../error-output';
import { createProgram } from '../program';

// La config vive en el HOME temporal del setup de vitest: no toca la del equipo.
function setJsonDefault(value: boolean): void {
  const service = new ConfigService();

  try {
    service.setValue('json', String(value));
  } finally {
    service.close();
  }
}

interface RunResult {
  readonly error?: unknown;
  readonly stderr: string;
  readonly stdout: string;
}

async function run(argv: string[], errorsAsJson = () => argv.includes('--json')): Promise<RunResult> {
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const text = (spy: typeof stderr) => spy.mock.calls.map(([chunk]) => String(chunk)).join('');

  try {
    await createProgram({ errorsAsJson }).parseAsync(['node', 'arcli', ...argv]);

    return { stderr: text(stderr), stdout: text(stdout) };
  } catch (error) {
    return { error, stderr: text(stderr), stdout: text(stdout) };
  } finally {
    stderr.mockRestore();
    stdout.mockRestore();
  }
}

/** Corre el CLI e imprime el error como `index.ts`. */
async function runReportingErrors(argv: string[]): Promise<RunResult & { exitCode?: number }> {
  const result = await run(argv);

  if (result.error === undefined) {
    return result;
  }

  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

  try {
    const exitCode = reportCliError(result.error, argv.includes('--json'));

    return { ...result, exitCode, stderr: result.stderr + stderr.mock.calls.map(([chunk]) => String(chunk)).join('') };
  } finally {
    stderr.mockRestore();
  }
}

beforeEach(() => setJsonDefault(false));
afterEach(() => setJsonDefault(false));

describe('JSON output resolved the same way in every command', () => {
  it.each([
    [['pdf']],
    [['pdf', 'estado']],
    [['parametros']],
    [['config']],
    [['config', 'ruta']],
    [['config', 'revisar']],
  ])('%j prints JSON with json=true in the config', async (argv) => {
    setJsonDefault(true);

    const { error, stdout } = await run(argv);

    expect(error).toBeUndefined();
    expect(() => JSON.parse(stdout) as unknown).not.toThrow();
  });

  it.each([[['pdf']], [['parametros']], [['config', 'ruta']]])('%j prints JSON with --json', async (argv) => {
    const { stdout } = await run([...argv, '--json']);

    expect(() => JSON.parse(stdout) as unknown).not.toThrow();
  });

  it('lets --json win over json=false and prints text without either', async () => {
    expect((await run(['config', 'ruta'])).stdout).not.toContain('{');
    expect(JSON.parse((await run(['config', 'ruta', '--json'])).stdout)).toEqual({ ruta: expect.any(String) });
  });
});

describe('commander usage errors', () => {
  it.each([
    [['fc', '--montoo', '1', '--json'], "opción desconocida '--montoo' (¿quisiste decir --monto?)"],
    [['fc', '--json', '--monto'], "falta el valor de la opción '-m, --monto <numero>'"],
    [['comando-que-no-existe', '--json'], "comando desconocido 'comando-que-no-existe'"],
    [['padron', '1', '2', '--json'], 'sobran argumentos: espera 1 y recibió 2 (1, 2).'],
  ])('%j prints a parseable INPUT_VALIDATION_ERROR with --json', async (argv, message) => {
    const { exitCode, stderr, stdout } = await runReportingErrors(argv);

    expect(stdout).toBe('');
    expect(JSON.parse(stderr)).toMatchObject({ codigo: 'INPUT_VALIDATION_ERROR', error: message });
    expect(exitCode).toBe(1);
  });

  it('uses JSON for usage errors when the config has json=true', async () => {
    setJsonDefault(true);

    const { error, stderr } = await run(['fc', '--montoo', '1'], () => true);

    expect(error).toBeInstanceOf(CommanderError);
    expect(stderr).toBe('');
  });

  it('keeps the readable text error without JSON', async () => {
    const { exitCode, stderr } = await runReportingErrors(['fc', '--montoo', '1']);

    expect(stderr).toContain("error: opción desconocida '--montoo'");
    expect(stderr).toContain('(¿quisiste decir --monto?)');
    expect(stderr).toContain('(usa "ayuda" para ver ejemplos y opciones)');
    expect(exitCode).toBe(1);
  });

  it.each([[['--version']], [['fc', '--ayuda']], [['fc', '--ayuda', '--json']]])(
    '%j is not turned into an error',
    async (argv) => {
      const { exitCode, stderr, stdout } = await runReportingErrors(argv);

      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).not.toBe('');
    },
  );
});

describe('--bruto only where it is used', () => {
  it.each([
    [['padron', '20201797064', '--bruto'], 'arcli padron'],
    [['fce-obligado', '20201797064', '--bruto'], 'arcli fce-obligado'],
    [['ultimos', 'fc', '--bruto'], 'arcli ultimos'],
    [['consultar', 'fc', '1', '--bruto'], 'arcli consultar'],
    [['parametros', '--bruto'], 'arcli parametros'],
    [['estado', '--bruto'], 'arcli estado'],
  ])('%j warns that --bruto does not apply', async (argv, command) => {
    expect((await run(argv)).stderr).toContain(`Aviso: --bruto no aplica a \`${command}\`, se ignora.`);
  });

  it('warns instead of failing when interactivo gets --json or --bruto', async () => {
    const { error, stderr } = await run(['interactivo', '--json', '--bruto']);

    expect(stderr).toContain('Aviso: --json, --bruto no aplican a `arcli interactivo`, se ignoran.');
    // Sin TTY en los tests: falla por la terminal, no por --json.
    expect(error).toMatchObject({ message: expect.not.stringContaining('--json') });
  });

  it('keeps --bruto in billing commands', async () => {
    const { stderr } = await run(['fc', '--bruto', '-m', '1']);

    expect(stderr).not.toContain('Aviso');
  });
});

describe('strict numbers and CUITs in query arguments', () => {
  it.each([['1e3'], ['0x10'], ['3a']])('consultar rejects the number %s before contacting ARCA', async (number) => {
    expect((await run(['consultar', 'fc', number])).error).toMatchObject({
      code: 'INPUT_VALIDATION_ERROR',
      message: expect.stringContaining(`El número "${number}" no es válido`),
    });
  });

  it('padron rejects a CUIT with a wrong check digit before contacting ARCA', async () => {
    expect((await run(['padron', '20-20179706-5'])).error).toMatchObject({
      code: 'INPUT_VALIDATION_ERROR',
      message: expect.stringContaining('digito verificador'),
    });
  });
});
