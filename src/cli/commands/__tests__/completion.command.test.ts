import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { currentCompletionEnvironment, resolveCompletionPath } from '../../../modules/completion/installer';
import { createProgram } from '../../program';

async function run(argv: string[]): Promise<{ error?: unknown; stdout: string }> {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

  try {
    await createProgram().parseAsync(['node', 'arcli', ...argv]);

    return { stdout: stdout.mock.calls.map(([chunk]) => String(chunk)).join('') };
  } catch (error) {
    return { error, stdout: '' };
  } finally {
    stdout.mockRestore();
  }
}

const complete = async (...words: string[]) =>
  (await run(['__completar', '--', ...words])).stdout.split('\n').filter(Boolean);

describe('arcli completado', () => {
  it('prints the script for each shell', async () => {
    expect((await run(['completado', 'zsh'])).stdout).toContain('compdef _arcli arcli');
    expect((await run(['completado', 'bash'])).stdout).toContain('complete -o default -F _arcli_completar arcli');
    expect((await run(['completado', 'fish'])).stdout).toContain('complete -c arcli');
  });

  it('rejects an unknown shell', async () => {
    expect((await run(['completado', 'powershell'])).error).toMatchObject({ code: 'INPUT_VALIDATION_ERROR' });
  });
});

describe('arcli __completar', () => {
  it('completes commands, without internal ones', async () => {
    const commands = await complete('');

    expect(commands).toEqual(expect.arrayContaining(['fc', 'factura', 'config', 'ultimos', 'completado']));
    expect(commands).not.toContain('storybook');
    expect(commands).not.toContain('__completar');
  });

  it('completes the flags and values of a voucher', async () => {
    expect(await complete('fc', '--ir-r')).toEqual(['--ir-ri', '--ir-rm']);
    expect(await complete('fc', '--iva-receptor', 'responsable-m')).toEqual(['responsable-monotributo']);
    expect(await complete('fc', '--transferencia', '')).toEqual(['sca', 'adc']);
  });

  it('completes shortcuts, config keys with their values, tables and letters', async () => {
    expect(await complete('ultimos', 'nc')).toEqual(expect.arrayContaining(['nca', 'ncb', 'ncc', 'ncea']));
    expect(await complete('config', 'establecer', 'punto')).toEqual(['puntoVenta']);
    expect(await complete('config', 'establecer', 'entorno', '')).toEqual(['testing', 'produccion']);
    expect(await complete('parametros', 'cot')).toEqual(['cotizacion']);
    expect(await complete('factura', '')).toEqual(['a', 'b', 'c']);
  });

  it('takes the typed words as they are, even flags or "ayuda"', async () => {
    expect(await complete('fc', '--monto', '1000', 'ayuda', '--ir-c')).toEqual(['--ir-ce', '--ir-cf']);
  });
});

describe('arcli completado instalar y desinstalar', () => {
  it('installs into the rc file of the given shell and reports it in JSON', async () => {
    const rc = resolveCompletionPath('bash', currentCompletionEnvironment());
    const installed = JSON.parse((await run(['completado', 'instalar', 'bash', '--json'])).stdout) as unknown;

    expect(installed).toMatchObject({ cambio: true, instalado: true, ruta: rc, shell: 'bash' });
    expect(readFileSync(rc, 'utf8')).toContain('arcli completado bash');

    const removed = JSON.parse((await run(['completado', 'desinstalar', 'bash', '--json'])).stdout) as unknown;

    expect(removed).toMatchObject({ cambio: true, instalado: false });
    expect(readFileSync(rc, 'utf8')).not.toContain('arcli completado');
  });

  it('completes the subcommands and shells after completado', async () => {
    expect(await complete('completado', '')).toEqual(['instalar', 'desinstalar', 'bash', 'zsh', 'fish']);
    expect(await complete('completado', 'instalar', 'z')).toEqual(['zsh']);
  });
});
