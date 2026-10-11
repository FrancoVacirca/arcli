#!/usr/bin/env node

import { renderUpdateNoticePanel } from '../modules/update-check/update-check.presenter';
import { checkForUpdate } from '../modules/update-check/update-check.service';
import { formatCliError, writeTerminalError, writeTerminalJsonError } from '../ui';

import { isInteractiveTerminal } from './commands/interactive.command';
import { shouldPrintErrorAsJson } from './error-output';
import { normalizeHelpArgv } from './help-argv';
import { createProgram } from './program';
import { CLI_VERSION } from './version';

const program = createProgram();
const useJson = process.argv.includes('--json');
const updateCheckPromise = useJson ? Promise.resolve(null) : checkForUpdate(CLI_VERSION).catch(() => null);

program
  .parseAsync(normalizeHelpArgv(process.argv, isInteractiveTerminal()))
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
