import type { Command } from 'commander';

import { InputValidationError } from '../../lib/errors/app-error';
import { billingIvaConditionSchema, IVA_RATE_ALIASES } from '../../modules/billing/billing.schemas';
import { VOUCHER_LETTERS, VOUCHER_SHORTCUTS } from '../../modules/billing/voucher-kind-map';
import { completeWords, type CompletionCommand, type CompletionValues } from '../../modules/completion/completion';
import {
  formatCompletionResultAsText,
  formatCompletionStateAsJson,
  formatCompletionStateAsText,
} from '../../modules/completion/completion.presenter';
import {
  type CompletionEnvironment,
  currentCompletionEnvironment,
  detectShell,
  getCompletionState,
  installCompletion,
  uninstallCompletion,
} from '../../modules/completion/installer';
import {
  buildCompletionScript,
  COMPLETE_COMMAND,
  COMPLETION_SHELLS,
  type CompletionShell,
} from '../../modules/completion/shell-scripts';
import { configPublicKeySchema } from '../../modules/config/config.schemas';
import { ConfigService } from '../../modules/config/config.service';
import { CONFIG_FIELDS } from '../../modules/interactive/config-fields';
import { PARAMETER_TABLE_NAMES } from '../../modules/parameters/parameters';
import { writeTerminalJson, writeTerminalOutput } from '../../ui';
import { registerJsonOption, resolveOutputJson } from '../global-options';
import { configureSpanishHelp, createCompletionHelp } from '../help';

/** No se ofrecen: herramientas internas. */
const INTERNAL_COMMANDS = new Set([COMPLETE_COMMAND, 'storybook']);

const IVA_RATES = [...new Set([...Object.values(IVA_RATE_ALIASES), '5', '2.5', ...Object.keys(IVA_RATE_ALIASES)])];

/** Valores que aceptan las opciones, por flag largo. */
const OPTION_VALUES: Readonly<Record<string, CompletionValues>> = {
  '--ac': VOUCHER_SHORTCUTS,
  '--alicuota': IVA_RATES,
  '--concepto': ['productos', 'servicios', 'productos-servicios'],
  '--ir': billingIvaConditionSchema.options,
  '--iva-receptor': billingIvaConditionSchema.options,
  '--mda': ['ARS', 'USD'],
  '--moneda': ['ARS', 'USD'],
  '--transferencia': ['sca', 'adc'],
};

/** `config establecer <clave> <valor>`: el valor depende de la clave. */
const configValues: CompletionValues = ([key]) => CONFIG_FIELDS.find((field) => field.key === key)?.choices ?? [];

/** Valores de los argumentos posicionales, por nombre del argumento. */
const ARGUMENT_VALUES: Readonly<Record<string, CompletionValues>> = {
  clave: configPublicKeySchema.options,
  letra: VOUCHER_LETTERS,
  moneda: ['USD', 'DOL'],
  shell: COMPLETION_SHELLS,
  tabla: [...PARAMETER_TABLE_NAMES, 'cotizacion'],
  tipo: VOUCHER_SHORTCUTS,
  valor: configValues,
};

/** El arbol de commander como lo necesita el autocompletado. */
export function describeCompletionTree(command: Command): CompletionCommand {
  return {
    argumentValues: command.registeredArguments.map((argument) => ARGUMENT_VALUES[argument.name()]),
    name: command.name(),
    options: command.options.map((option) => ({
      flags: [option.long, option.short].filter((flag): flag is string => Boolean(flag)),
      hidden: option.hidden,
      takesValue: option.required || option.optional,
      values: option.long ? OPTION_VALUES[option.long] : undefined,
    })),
    subcommands: command.commands
      .filter((subcommand) => !INTERNAL_COMMANDS.has(subcommand.name()))
      .map(describeCompletionTree),
  };
}

function parseShell(value: string): CompletionShell {
  if (!COMPLETION_SHELLS.includes(value as CompletionShell)) {
    throw new InputValidationError(`El shell "${value}" no es válido. Usá ${COMPLETION_SHELLS.join(', ')}.`);
  }

  return value as CompletionShell;
}

/** El shell pedido o, si no se paso, el de `$SHELL`. */
export function resolveShell(value: string | undefined, environment: CompletionEnvironment): CompletionShell {
  if (value) {
    return parseShell(value);
  }

  const detected = detectShell(environment.shell);

  if (!detected) {
    throw new InputValidationError(
      `No se pudo saber qué shell usás${environment.shell ? ` (${environment.shell})` : ''}. Indicalo: bash, zsh o fish.`,
    );
  }

  return detected;
}

function isJson(command: Command): boolean {
  const service = new ConfigService();

  try {
    return resolveOutputJson(command, service.getConfig());
  } finally {
    service.close();
  }
}

export function registerCompletionCommands(program: Command): void {
  const environment = currentCompletionEnvironment();
  const command = registerJsonOption(
    program
      .command('completado')
      .description('autocompletado con Tab para bash, zsh o fish: instalarlo, desinstalarlo o ver el script')
      .argument('[shell]', `${COMPLETION_SHELLS.join(', ')}: imprime el script; sin shell, muestra si está instalado`),
  ).action((shell: string | undefined, _options: unknown, self: Command) => {
    if (shell) {
      process.stdout.write(buildCompletionScript(parseShell(shell)));

      return;
    }

    const state = getCompletionState(resolveShell(undefined, environment), environment);

    if (isJson(self)) {
      writeTerminalJson(formatCompletionStateAsJson(state));
    } else {
      writeTerminalOutput(formatCompletionStateAsText(state, environment.home));
    }
  });

  configureSpanishHelp(command);
  command.addHelpText('after', createCompletionHelp());

  // Pedir el comando ya es la confirmacion, como en `pdf instalar`: no se vuelve a preguntar.
  for (const [name, description, run] of [
    ['instalar', 'agregar el autocompletado al archivo de inicio del shell', installCompletion],
    ['desinstalar', 'sacar el autocompletado que agrego arcli', uninstallCompletion],
  ] as const) {
    const subcommand = registerJsonOption(
      command
        .command(name)
        .description(description)
        .argument('[shell]', `${COMPLETION_SHELLS.join(', ')}; por defecto el de $SHELL`),
    ).action((shell: string | undefined, _options: unknown, self: Command) => {
      const result = run(resolveShell(shell, environment), environment);

      if (isJson(self)) {
        writeTerminalJson(formatCompletionStateAsJson(result));
      } else {
        writeTerminalOutput(formatCompletionResultAsText(result, environment.home));
      }
    });

    configureSpanishHelp(subcommand);
  }

  // Lo llama el script del shell en cada Tab: `arcli __completar -- <palabras escritas>`. Una por linea.
  program
    .command(COMPLETE_COMMAND, { hidden: true })
    .argument('[palabras...]')
    .allowUnknownOption()
    .action((words: string[] = []) => {
      const candidates = completeWords(describeCompletionTree(program), words);

      if (candidates.length > 0) {
        process.stdout.write(`${candidates.join('\n')}\n`);
      }
    });
}
