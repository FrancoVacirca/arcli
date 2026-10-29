import type { Command } from 'commander';

import { VOUCHER_KIND_MAP, VOUCHER_SHORTCUTS } from '../../modules/billing/voucher-kind-map';
import { configureSpanishHelp, createShortcutHelp } from '../help';

import { hideInapplicableBillingOptions } from './billing.command.options';
import { executeBillingCommand, registerBillingCommandOptions } from './billing.command.shared';

export function registerBillingShortcutCommands(program: Command): void {
  for (const shortcut of VOUCHER_SHORTCUTS) {
    const definition = VOUCHER_KIND_MAP[shortcut];
    // Ocultos en la lista de comandos: la ayuda principal los muestra en una tabla por familia y letra.
    const command = program
      .command(shortcut, { hidden: true })
      .description(`${definition.displayName} por shortcut, con ayuda guiada para previsualizar o emitir`);

    configureSpanishHelp(command);

    registerBillingCommandOptions(command);
    hideInapplicableBillingOptions(command, {
      isElectronicCredit: definition.isElectronicCredit,
      isNote: definition.requiresAssociatedVoucher,
      letters: [definition.letter],
    });

    command.action(async () => {
      await executeBillingCommand(command, shortcut);
    });

    command.addHelpText('after', createShortcutHelp(shortcut));
  }
}
