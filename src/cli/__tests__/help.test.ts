import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';

import { configPublicKeySchema } from '../../modules/config/config.schemas';
import { createConfigHelp, createConfigSetHelp, createShortcutHelp, createStorybookHelp } from '../help';
import { createProgram } from '../program';

function allCommands(command: Command): Command[] {
  return [command, ...command.commands.flatMap(allCommands)];
}

describe('help', () => {
  it.each([
    ['config', createConfigHelp],
    ['config establecer', createConfigSetHelp],
  ])('lists every public config key in `%s --ayuda`', (_command, createHelp) => {
    const help = createHelp();
    const missing = configPublicKeySchema.options.filter((key) => !help.includes(`- ${key}: `));

    expect(missing).toEqual([]);
  });

  it('lists the bordes storybook scene', () => {
    expect(createStorybookHelp()).toContain('arcli storybook bordes');
  });

  it('does not leave commander text in English in any help', () => {
    const english = /\b(Usage|Options|Commands|Arguments|output the version)\b|\[options\]|\[command\]|<number>|<path>/;
    const offenders = allCommands(createProgram())
      .filter((command) => english.test(command.helpInformation()))
      .map((command) => command.name());

    expect(offenders).toEqual([]);
  });

  describe('ayuda de cada comprobante', () => {
    const program = createProgram();
    const optionsOf = (name: string) => {
      const command = program.commands.find((candidate) => candidate.name() === name);
      const help = command?.helpInformation() ?? '';

      return help.slice(help.indexOf('Opciones:'), help.indexOf('--ayuda'));
    };
    const shows = (name: string, flag: string) => new RegExp(`\\s${flag}[\\s,]`).test(optionsOf(name));

    it.each([
      ['fc', ['--cuit', '--servicio-desde'], ['--alicuota', '--ac', '--cbu', '--anulacion', '--periodo-desde']],
      ['fa', ['--alicuota', '--exento'], ['--ac', '--cbu']],
      ['nca', ['--ac', '--acuit', '--periodo-desde'], ['--cbu', '--anulacion']],
      ['fcea', ['--cbu', '--transferencia'], ['--ac', '--anulacion']],
      ['ncea', ['--ac', '--afecha', '--anulacion'], ['--periodo-desde', '--cbu']],
      ['nota-credito', ['--alicuota', '--ac', '--periodo-desde'], ['--cbu']],
    ])('%s muestra solo lo que aplica', (name, visible, hidden) => {
      expect(visible.filter((flag) => !shows(name, flag))).toEqual([]);
      expect(hidden.filter((flag) => shows(name, flag))).toEqual([]);
    });

    it('menciona los alias en la opción principal en lugar de listarlos aparte', () => {
      expect(shows('fc', '--pv')).toBe(false);
      expect(optionsOf('fc')).toContain('(alias: --pv)');
    });

    it('no repite la tabla de parámetros debajo de las opciones', () => {
      expect(createShortcutHelp('fc')).not.toContain('Más parámetros disponibles');
      expect(createShortcutHelp('fc')).not.toContain('No aplica');
    });
  });
});
