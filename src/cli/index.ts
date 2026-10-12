#!/usr/bin/env node

import { OWNER_ONLY_UMASK } from '../lib/files/restrict-to-owner';
import { renderUpdateNoticePanel } from '../modules/update-check/update-check.presenter';
import { checkForUpdate } from '../modules/update-check/update-check.service';
import { formatCliError, writeTerminalError, writeTerminalJsonError } from '../ui';

import { isInteractiveTerminal } from './commands/interactive.command';
import { shouldPrintErrorAsJson } from './error-output';
import { normalizeHelpArgv } from './help-argv';
import { createProgram } from './program';
import { CLI_VERSION } from './version';

// Tickets de ARCA, config y PDFs se crean solo para el usuario (el SDK escribe los tickets con permisos por defecto).
process.umask(OWNER_ONLY_UMASK);

const program = createProgram();
const argv = normalizeHelpArgv(process.argv, isInteractiveTerminal());
const useJson = process.argv.includes('--json');
// El modo interactivo muestra la actualizacion como primera opcion del menu, no al cerrar.
const isInteractiveMode = argv[2] === 'interactivo';
const updateCheckPromise =
  useJson || isInteractiveMode ? Promise.resolve(null) : checkForUpdate(CLI_VERSION).catch(() => null);

program
  .parseAsync(argv)
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
