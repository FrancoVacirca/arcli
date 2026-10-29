import type { Command } from 'commander';

import { InputValidationError } from '../../lib/errors/app-error';
import { getGlobalOptions, registerEnvironmentOptions } from '../global-options';
import { configureSpanishHelp } from '../help';
import { runInteractiveMode } from '../interactive/interactive-mode';

export function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function registerInteractiveCommand(program: Command): void {
  const command = program
    .command('interactivo')
    .description('asistente paso a paso para emitir comprobantes; también se abre con "arcli" sin argumentos');

  // Solo el entorno: el asistente no tiene salida JSON ni respuesta bruta.
  registerEnvironmentOptions(command);
  configureSpanishHelp(command);

  command.action(async (_options: unknown, self: Command) => {
    if (!isInteractiveTerminal()) {
      throw new InputValidationError(
        'El modo interactivo necesita una terminal interactiva. Usá los comandos con flags.',
      );
    }

    // `--json` y `--bruto` se ignoran con un aviso: al asistente le llega solo el entorno.
    const { produccion, testing } = getGlobalOptions(self);

    await runInteractiveMode({ produccion, testing });
  });
}
