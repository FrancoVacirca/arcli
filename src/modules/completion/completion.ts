/** Valores para completar: una lista fija o una que depende de los argumentos anteriores del comando. */
export type CompletionValues = readonly string[] | ((previousArguments: readonly string[]) => readonly string[]);

export interface CompletionOption {
  /** `--monto` y `-m`, si tiene corta. */
  readonly flags: readonly string[];
  readonly takesValue: boolean;
  readonly values?: CompletionValues;
}

/** Un comando como lo ve el autocompletado: sale del arbol de commander, sin depender de el. */
export interface CompletionCommand {
  /** Valores de cada argumento posicional, en orden. */
  readonly argumentValues: readonly (CompletionValues | undefined)[];
  readonly name: string;
  readonly options: readonly CompletionOption[];
  readonly subcommands: readonly CompletionCommand[];
}

function resolveValues(values: CompletionValues | undefined, previousArguments: readonly string[]): readonly string[] {
  if (!values) {
    return [];
  }

  return typeof values === 'function' ? values(previousArguments) : values;
}

function findOption(command: CompletionCommand, word: string): CompletionOption | undefined {
  return command.options.find((option) => option.flags.includes(word));
}

/**
 * Lo que puede seguir en la linea, segun las palabras escritas despues de `arcli`. La ultima es la que se esta
 * completando (puede venir vacia). Sin candidatos devuelve una lista vacia y el shell completa rutas de archivo,
 * que es lo que piden `--cargar` y las rutas de config.
 */
export function completeWords(root: CompletionCommand, words: readonly string[]): string[] {
  const current = words.at(-1) ?? '';
  const previous = words.slice(0, -1);
  let command = root;
  let positionals: string[] = [];
  let pendingOption: CompletionOption | undefined;

  for (const word of previous) {
    if (pendingOption) {
      pendingOption = undefined;
      continue;
    }

    if (word.startsWith('-')) {
      const option = findOption(command, word);

      pendingOption = option?.takesValue ? option : undefined;
      continue;
    }

    const subcommand = positionals.length === 0 ? command.subcommands.find((sub) => sub.name === word) : undefined;

    if (subcommand) {
      command = subcommand;
      positionals = [];
    } else {
      positionals.push(word);
    }
  }

  const matches = (candidates: readonly string[]) =>
    [...new Set(candidates)].filter((candidate) => candidate.startsWith(current));

  if (pendingOption) {
    return matches(resolveValues(pendingOption.values, positionals));
  }

  if (current.startsWith('-')) {
    return matches(command.options.flatMap((option) => option.flags.filter((flag) => flag.startsWith('--'))));
  }

  return matches([
    ...(positionals.length === 0 ? command.subcommands.map((sub) => sub.name) : []),
    ...resolveValues(command.argumentValues[positionals.length], positionals),
  ]);
}
