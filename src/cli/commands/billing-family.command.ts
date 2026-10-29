import type { Command } from 'commander';

import { InputValidationError } from '../../lib/errors/app-error';
import type { VoucherLetter } from '../../modules/billing/billing.types';
import {
  getVoucherKindByFamilyAndLetter,
  VOUCHER_FAMILIES,
  VOUCHER_KIND_MAP,
  VOUCHER_LETTERS,
} from '../../modules/billing/voucher-kind-map';
import { configureSpanishHelp, createFamilyHelp } from '../help';

import { hideInapplicableBillingOptions } from './billing.command.options';
import { executeBillingCommand, registerBillingCommandOptions } from './billing.command.shared';

export function registerBillingFamilyCommands(program: Command): void {
  for (const family of VOUCHER_FAMILIES) {
    const definitions = Object.values(VOUCHER_KIND_MAP).filter((definition) => definition.family === family);
    const familyShortcuts = definitions.map((definition) => definition.shortcut).join(', ');
    const command = program
      .command(family, { hidden: true })
      .description(
        `usar ${family} por letra A, B o C con ejemplos y atajos${familyShortcuts ? ` (${familyShortcuts})` : ''}`,
      )
      .argument('<letra>', 'letra del comprobante', (value: string) => value.toLowerCase());

    configureSpanishHelp(command);

    registerBillingCommandOptions(command);
    hideInapplicableBillingOptions(command, {
      isElectronicCredit: definitions.some((definition) => definition.isElectronicCredit),
      isNote: definitions.some((definition) => definition.requiresAssociatedVoucher),
      letters: definitions.map((definition) => definition.letter),
    });

    command.action(async (letter: string) => {
      if (!VOUCHER_LETTERS.includes(letter as VoucherLetter)) {
        throw new InputValidationError(`La letra "${letter}" no es válida. Usá a, b o c.`);
      }

      const definition = getVoucherKindByFamilyAndLetter(family, letter as VoucherLetter);

      if (!definition) {
        throw new InputValidationError(`No existe un comprobante para la familia "${family}" y letra "${letter}".`);
      }

      await executeBillingCommand(command, definition.shortcut);
    });

    command.addHelpText('after', createFamilyHelp(family));
  }
}
