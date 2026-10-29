import { describe, expect, it } from 'vitest';

import { completeWords, type CompletionCommand } from '../completion';
import { buildCompletionScript, COMPLETE_COMMAND, COMPLETION_SHELLS } from '../shell-scripts';

const fc: CompletionCommand = {
  argumentValues: [],
  name: 'fc',
  options: [
    { flags: ['--monto', '-m'], takesValue: true },
    { flags: ['--iva-receptor'], takesValue: true, values: ['consumidor-final', 'responsable-inscripto'] },
    { flags: ['--ir-cf'], takesValue: false },
    { flags: ['--cargar'], takesValue: true },
  ],
  subcommands: [],
};

const config: CompletionCommand = {
  argumentValues: [],
  name: 'config',
  options: [],
  subcommands: [
    {
      argumentValues: [['entorno', 'cuit'], ([key]) => (key === 'entorno' ? ['testing', 'produccion'] : [])],
      name: 'establecer',
      options: [],
      subcommands: [],
    },
  ],
};

const root: CompletionCommand = {
  argumentValues: [],
  name: 'arcli',
  options: [{ flags: ['--json'], takesValue: false }],
  subcommands: [fc, config, { argumentValues: [['fa', 'fc']], name: 'ultimos', options: [], subcommands: [] }],
};

describe('completeWords', () => {
  it('completes commands by prefix', () => {
    expect(completeWords(root, [''])).toEqual(['fc', 'config', 'ultimos']);
    expect(completeWords(root, ['c'])).toEqual(['config']);
  });

  it('completes the long flags of the command being typed', () => {
    expect(completeWords(root, ['fc', '--'])).toEqual(['--monto', '--iva-receptor', '--ir-cf', '--cargar']);
    expect(completeWords(root, ['fc', '--ir'])).toEqual(['--ir-cf']);
  });

  it('completes the values of the option right before the cursor', () => {
    expect(completeWords(root, ['fc', '--iva-receptor', 'resp'])).toEqual(['responsable-inscripto']);
  });

  it('skips the value of an option already written', () => {
    expect(completeWords(root, ['fc', '--monto', '1000', '--ir'])).toEqual(['--ir-cf']);
    expect(completeWords(root, ['fc', '-m', '1000', ''])).toEqual([]);
  });

  it('returns nothing for a free value, so the shell completes file paths', () => {
    expect(completeWords(root, ['fc', '--cargar', ''])).toEqual([]);
    expect(completeWords(root, ['fc', '--monto', ''])).toEqual([]);
  });

  it('completes subcommands and arguments that depend on the previous ones', () => {
    expect(completeWords(root, ['config', 'e'])).toEqual(['establecer']);
    expect(completeWords(root, ['config', 'establecer', ''])).toEqual(['entorno', 'cuit']);
    expect(completeWords(root, ['config', 'establecer', 'entorno', ''])).toEqual(['testing', 'produccion']);
    expect(completeWords(root, ['ultimos', 'f'])).toEqual(['fa', 'fc']);
  });

  it('does not offer a subcommand once an argument was written', () => {
    expect(completeWords(root, ['ultimos', 'fc', ''])).toEqual([]);
  });
});

describe('buildCompletionScript', () => {
  it.each(COMPLETION_SHELLS)('the %s script asks arcli on every Tab', (shell) => {
    const script = buildCompletionScript(shell);

    expect(script).toContain(`arcli ${COMPLETE_COMMAND} --`);
    expect(script).toContain(`arcli completado ${shell}`);
  });
});
