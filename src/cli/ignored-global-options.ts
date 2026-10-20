import type { Command } from 'commander';

import { colorize, writeTerminalError } from '../ui';

/**
 * Opciones del programa que un comando puede no usar. Commander las acepta en cualquier comando (las parsea el
 * programa), asi que `arcli config revisar --produccion` no fallaba ni hacia nada.
 */
const GLOBAL_OPTION_FLAGS = ['--testing', '--produccion', '--json', '--bruto'] as const;

/** Las opciones globales que se pasaron pero el comando no declara: se ignoran. Las del padre no cuentan. */
export function findIgnoredGlobalOptions(program: Command, actionCommand: Command): string[] {
  const values = program.opts<Record<string, unknown>>();

  return GLOBAL_OPTION_FLAGS.filter(
    (flag) => values[flag.slice(2)] !== undefined && !actionCommand.options.some((option) => option.long === flag),
  );
}

function commandPath(program: Command, command: Command): string {
  const names: string[] = [];

  for (let current: Command | null = command; current && current !== program; current = current.parent) {
    names.unshift(current.name());
  }

  return ['arcli', ...names].join(' ');
}

export function formatIgnoredGlobalOptionsWarning(options: readonly string[], command: string): string {
  const flags = options.join(', ');
  const verb = options.length === 1 ? 'no aplica' : 'no aplican';

  return `Aviso: ${flags} ${verb} a \`${command}\`, se ignora${options.length === 1 ? '' : 'n'}.`;
}

/** Avisa por stderr, sin cortar la ejecucion, cuando una opcion global no aplica al comando. */
export function warnAboutIgnoredGlobalOptions(program: Command): void {
  program.hook('preAction', (_thisCommand, actionCommand) => {
    const ignored = findIgnoredGlobalOptions(program, actionCommand);

    if (ignored.length > 0) {
      writeTerminalError(
        colorize(formatIgnoredGlobalOptionsWarning(ignored, commandPath(program, actionCommand)), 'warning', 'stderr'),
      );
    }
  });
}
