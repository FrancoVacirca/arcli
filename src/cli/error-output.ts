import { type Command, CommanderError } from 'commander';

import { AppError } from '../lib/errors/app-error';
import { formatCliError, writeTerminalError, writeTerminalJsonError } from '../ui';

import { readJsonDefault } from './global-options';

/**
 * Los errores salen en JSON con `--json` o, sin el flag, si la config tiene `json=true`, igual que los
 * resultados. La config se lee recien al fallar; si tambien falla (config invalida), sale en texto.
 */
export function shouldPrintErrorAsJson(argv: readonly string[], readDefault = readJsonDefault): boolean {
  if (argv.includes('--json')) {
    return true;
  }

  try {
    return readDefault();
  } catch {
    return false;
  }
}

/** Lo que commander señaliza por `exitOverride` sin que sea un error de uso: ayuda y version, ya impresas. */
const COMMANDER_NON_ERROR_CODES = new Set(['commander.help', 'commander.helpDisplayed', 'commander.version']);

/** Ayuda o version: commander ya las imprimio y solo queda salir con su exit code. */
export function isCommanderExit(error: unknown): error is CommanderError {
  return error instanceof CommanderError && COMMANDER_NON_ERROR_CODES.has(error.code);
}

/** Un error de uso de commander: opcion desconocida, valor faltante, argumento de mas, etc. */
export function isCommanderUsageError(error: unknown): error is CommanderError {
  return error instanceof CommanderError && !COMMANDER_NON_ERROR_CODES.has(error.code);
}

/** El error de uso de commander como `INPUT_VALIDATION_ERROR`, en el mismo formato que el resto. */
export function toUsageError(error: CommanderError): AppError {
  // Commander arma el mensaje con "error: " adelante y, a veces, una segunda linea "(Did you mean --monto?)".
  const message = error.message
    .replace(/^error:\s*/i, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

  return new AppError(message, {
    code: 'INPUT_VALIDATION_ERROR',
    suggestion: 'Usá "arcli ayuda" o "arcli <comando> --ayuda" para ver comandos y opciones.',
  });
}

/**
 * Commander tira los errores de uso en vez de cortar el proceso, para que `index.ts` los maneje como el resto. En
 * texto commander los escribe como siempre (con la pista de la ayuda); en JSON se callan y sale el JSON de error.
 * Va antes de registrar los comandos: los subcomandos copian esta config al crearse.
 */
export function configureUsageErrors(program: Command, errorsAsJson: () => boolean): void {
  let failing = false;

  program.exitOverride().configureOutput({
    outputError: (message, write) => {
      failing = true;

      if (!errorsAsJson()) {
        write(message);
      }
    },
    writeErr: (text) => {
      // Despues de un error, commander escribe la pista de la ayuda: en JSON no va.
      if (!(failing && errorsAsJson())) {
        process.stderr.write(text);
      }
    },
  });
}

/**
 * Imprime un error que corto la ejecucion y devuelve el exit code. Ayuda y version no son errores; los errores de
 * uso en texto ya los escribio commander.
 */
export function reportCliError(error: unknown, errorsAsJson: boolean): number {
  if (isCommanderExit(error)) {
    return error.exitCode;
  }

  if (isCommanderUsageError(error)) {
    if (errorsAsJson) {
      writeTerminalJsonError(formatCliError(toUsageError(error), true));
    }

    return error.exitCode;
  }

  if (errorsAsJson) {
    writeTerminalJsonError(formatCliError(error, true));
  } else {
    writeTerminalError(formatCliError(error, false));
  }

  return 1;
}
