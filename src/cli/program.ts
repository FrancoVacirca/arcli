import { Command } from 'commander';

import { registerGlobalOptions } from './commands/billing.command.shared';
import { registerBillingFamilyCommands } from './commands/billing-family.command';
import { registerBillingShortcutCommands } from './commands/billing-shortcuts.command';
import { registerConfigCommand } from './commands/config.command';
import { registerExamplesCommand } from './commands/examples.command';
import { registerFceObligationCommand } from './commands/fce-obligation.command';
import { registerInteractiveCommand } from './commands/interactive.command';
import { registerParametersCommands } from './commands/parameters.command';
import { registerPdfCommand } from './commands/pdf.command';
import { registerStorybookCommand } from './commands/storybook.command';
import { registerVoucherQueryCommands } from './commands/vouchers.command';
import { configureSpanishHelp, createProgramHeader, createProgramHelp } from './help';
import { warnAboutIgnoredGlobalOptions } from './ignored-global-options';
import { CLI_VERSION } from './version';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('arcli')
    .description(
      'Emití y revisá comprobantes ARCA desde terminal con una UX mas simple, validaciones claras y salida lista para automatizar.',
    )
    .version(CLI_VERSION)
    .showHelpAfterError('(usa "ayuda" para ver comandos y ejemplos)');

  configureSpanishHelp(program);
  registerGlobalOptions(program);
  warnAboutIgnoredGlobalOptions(program);

  registerBillingShortcutCommands(program);
  registerBillingFamilyCommands(program);
  registerConfigCommand(program);
  registerExamplesCommand(program);
  registerFceObligationCommand(program);
  registerInteractiveCommand(program);
  registerPdfCommand(program);
  registerParametersCommands(program);
  registerVoucherQueryCommands(program);
  registerStorybookCommand(program);

  program.addHelpText('beforeAll', ({ command }) => (command === program ? createProgramHeader() : ''));
  program.addHelpText('afterAll', ({ command }) => (command === program ? createProgramHelp() : ''));

  return program;
}
