#!/usr/bin/env node

import { renderUpdateNoticePanel } from '../modules/update-check/update-check.presenter';
import { checkForUpdate } from '../modules/update-check/update-check.service';
import { formatCliError, writeTerminalError, writeTerminalJsonError } from '../ui';

import { isInteractiveTerminal } from './commands/interactive.command';
import { shouldPrintErrorAsJson } from './error-output';
import { createProgram } from './program';
import { CLI_VERSION } from './version';

function normalizeHelpArgv(argv: string[]): string[] {
  const cliArgs = argv.slice(2);

  // Sin argumentos y en una terminal interactiva se abre el asistente; sin TTY sigue mostrando la ayuda.
  if (cliArgs.length === 0) {
    return isInteractiveTerminal() ? argv.concat('interactivo') : argv;
  }

  if (cliArgs[0] === 'ayuda') {
    const rest = cliArgs.slice(1);

    return argv.slice(0, 2).concat(rest.length > 0 ? [...rest, '--ayuda'] : ['--ayuda']);
  }

  if (cliArgs[cliArgs.length - 1] === 'ayuda') {
    return argv.slice(0, 2).concat([...cliArgs.slice(0, -1), '--ayuda']);
  }

  return argv;
}

const program = createProgram();
const useJson = process.argv.includes('--json');
const updateCheckPromise = useJson ? Promise.resolve(null) : checkForUpdate(CLI_VERSION).catch(() => null);

program
  .parseAsync(normalizeHelpArgv(process.argv))
  .then(async () => {
    const updateResult = await updateCheckPromise;

    if (updateResult) {
      writeTerminalError(renderUpdateNoticePanel(updateResult));
    }
  })
  .catch((error: unknown) => {
    const errorAsJson = shouldPrintErrorAsJson(process.argv);

    if (errorAsJson) {
      writeTerminalJsonError(formatCliError(error, errorAsJson));
    } else {
      writeTerminalError(formatCliError(error, errorAsJson));
    }

    process.exitCode = 1;
  });
