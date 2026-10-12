import checkbox from '@inquirer/checkbox';
import input from '@inquirer/input';
import select, { Separator } from '@inquirer/select';
import { emitKeypressEvents } from 'node:readline';
import { styleText } from 'node:util';

import { BACK, type Back } from '../../modules/interactive/wizard';
import { colorize } from '../../ui';

export interface Choice<T> {
  readonly description?: string;
  readonly name: string;
  /** Lo que queda en la linea "✔ pregunta respuesta" al elegirla; por defecto, `name`. */
  readonly short?: string;
  readonly value: T;
}

type HelpKey = [key: string, action: string];

// La ayuda de teclas de @inquirer viene en ingles.
const HELP_TRANSLATIONS: Record<string, HelpKey> = {
  'a all': ['a', 'todos'],
  'i invert': ['i', 'invertir'],
  'space select': ['espacio', 'marcar'],
  '↑↓ navigate': ['↑↓', 'mover'],
  '⏎ select': ['⏎', 'elegir'],
  '⏎ submit': ['⏎', 'confirmar'],
};

function keysHelpTip(extra: readonly HelpKey[]): (keys: HelpKey[]) => string {
  return (keys) =>
    [...keys.map(([key, action]) => HELP_TRANSLATIONS[`${key} ${action}`] ?? [key, action]), ...extra]
      .map(([key, action]) => `${styleText('bold', key)} ${styleText('dim', action)}`)
      .join(styleText('dim', ' • '));
}

/**
 * La pregunta activa lleva dos lineas en blanco arriba, para separarla de las ya respondidas. Al responderla
 * @inquirer la redibuja con el prefijo "done", sin esas lineas, y las respuestas quedan juntas.
 */
const PROMPT_PREFIX = { idle: `\n\n${styleText('blue', '?')}` };
/** Una sola linea arriba: para una pregunta que ya tiene una linea en blanco fija antes, como el menu bajo la barra. */
const COMPACT_PROMPT_PREFIX = { idle: `\n${styleText('blue', '?')}` };

type PromptStatus = 'done' | 'idle' | 'loading';

/**
 * En las listas, mientras la pregunta esta activa, una linea en blanco entre la pregunta y las opciones, y otra
 * entre la descripcion de la opcion marcada y la ayuda de teclas.
 */
function listStyle(extraKeys: readonly HelpKey[]) {
  return {
    description: (text: string) => `${styleText('cyan', text)}\n`,
    keysHelpTip: keysHelpTip(extraKeys),
    message: (text: string, status: PromptStatus) =>
      status === 'done' ? styleText('bold', text) : `${styleText('bold', text)}\n`,
  };
}

const MENU_THEME = { prefix: PROMPT_PREFIX, style: listStyle([]) };
const STEP_THEME = { prefix: PROMPT_PREFIX, style: listStyle([['esc', 'volver']]) };
const TEXT_THEME = { prefix: PROMPT_PREFIX };

/**
 * Una lista simple. Con `escapeValue`, Esc la cierra devolviendo ese valor (por ejemplo, "volver", "no" o
 * "salir") y la ayuda de teclas lo muestra con `escapeLabel`; sin el, Esc no hace nada. Con `compactTop`, una
 * sola linea en blanco arriba en lugar de dos.
 */
export async function chooseOne<T>(
  message: string,
  choices: ReadonlyArray<Choice<T> | Separator>,
  defaultValue?: T,
  options: { readonly compactTop?: boolean; readonly escapeLabel?: string; readonly escapeValue?: T } = {},
): Promise<T> {
  const { compactTop = false, escapeLabel = 'volver', escapeValue } = options;
  const prefix = compactTop ? COMPACT_PROMPT_PREFIX : PROMPT_PREFIX;
  const config = {
    choices: [...choices],
    default: defaultValue,
    loop: false,
    message,
    pageSize: 12,
    theme:
      escapeValue === undefined
        ? { ...MENU_THEME, prefix }
        : { prefix, style: listStyle([['esc', escapeLabel] as HelpKey]) },
  };

  if (escapeValue === undefined) {
    return select<T>(config);
  }

  const result = await runStepPrompt(
    (context) => select<T>(config, context),
    (answer) => ({ answer: choiceName(choices, answer), message }),
  );

  return 'answer' in result && result.answer !== BACK ? result.answer : escapeValue;
}

export async function askText(
  message: string,
  options: { readonly defaultValue?: string; readonly validate?: (value: string) => string | true } = {},
): Promise<string> {
  const answer = await input({
    default: options.defaultValue,
    message,
    theme: TEXT_THEME,
    validate: options.validate,
  });

  return answer.trim();
}

/** Si o no; Esc cuenta como no. */
export async function confirm(message: string, yesLabel: string, noLabel = 'Cancelar'): Promise<boolean> {
  return chooseOne(
    message,
    [
      { name: yesLabel, value: true },
      { name: noLabel, value: false },
    ],
    undefined,
    { escapeValue: false },
  );
}

/** Ctrl+C dentro de un prompt de @inquirer. */
export function isPromptCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === 'ExitPromptError';
}

// Lineas que ocupa el prompt fuera de la lista: linea en blanco, pregunta, descripcion y ayuda de teclas.
const PROMPT_CHROME_LINES = 6;

/** Alto de lista para `count` opciones: todas si entran en la terminal, si no las que entren (minimo 12). */
export function fitPageSize(count: number): number {
  const available = (process.stdout.rows || 24) - PROMPT_CHROME_LINES;

  return Math.max(12, Math.min(count, available));
}

const BACK_CHOICE = { name: '← Volver', value: BACK } as const;
// Linea en blanco entre las opciones y "Volver".
const BACK_SPACER = new Separator(' ');
// Alternativa a Esc, por si la terminal no la manda.
const BACK_TEXT = '<';
const ESCAPE_REASON = 'esc';

/** La misma linea que deja @inquirer al responder; hace falta cuando el prompt se borra al cerrarse. */
function writeAnsweredLine(message: string, answer: string): void {
  process.stdout.write(`${styleText('green', '✔')} ${styleText('bold', message)} ${styleText('cyan', answer)}\n`);
}

/**
 * Corre un prompt de paso que se cierra con Esc (vuelve al paso anterior) o cuando se aborta `signal`.
 * El prompt se borra al cerrarse, asi una pregunta abandonada no queda en pantalla; si se respondio,
 * se escribe la linea "✔ pregunta respuesta" igual que siempre.
 */
async function runStepPrompt<T>(
  run: (context: { clearPromptOnDone: boolean; signal: AbortSignal }) => Promise<T>,
  answeredLine: (answer: T) => { readonly answer: string; readonly message: string },
  signal?: AbortSignal,
): Promise<{ readonly aborted: true } | { readonly answer: Back | T }> {
  const controller = new AbortController();
  const onKeypress = (_text: string, key?: { readonly name?: string }) => {
    if (key?.name === 'escape') {
      controller.abort(ESCAPE_REASON);
    }
  };
  const onAbort = () => controller.abort(signal?.reason);

  signal?.addEventListener('abort', onAbort);
  // @inquirer ya emite keypress sobre stdin; llamarlo de nuevo no hace nada.
  emitKeypressEvents(process.stdin);
  process.stdin.on('keypress', onKeypress);

  try {
    const answer = await run({ clearPromptOnDone: true, signal: controller.signal });
    const line = answeredLine(answer);

    writeAnsweredLine(line.message, line.answer);

    return { answer };
  } catch (error) {
    if (!(error instanceof Error && error.name === 'AbortPromptError')) {
      throw error;
    }

    return controller.signal.reason === ESCAPE_REASON ? { answer: BACK } : { aborted: true };
  } finally {
    process.stdin.off('keypress', onKeypress);
    signal?.removeEventListener('abort', onAbort);
  }
}

function stepConfig<T>(
  message: string,
  choices: ReadonlyArray<Choice<T> | Separator>,
  defaultValue: T | undefined,
  pageSize: number,
) {
  return {
    choices: [...choices, BACK_SPACER, BACK_CHOICE],
    default: defaultValue,
    loop: false,
    message,
    pageSize,
    theme: STEP_THEME,
  };
}

function choiceName<T>(choices: ReadonlyArray<Choice<T> | Separator>, answer: Back | T): string {
  if (answer === BACK) {
    return BACK_CHOICE.name;
  }

  const chosen = choices.find((item): item is Choice<T> => !Separator.isSeparator(item) && item.value === answer);

  return chosen?.short ?? chosen?.name ?? '';
}

async function selectStep<T>(
  message: string,
  choices: ReadonlyArray<Choice<T> | Separator>,
  defaultValue: T | undefined,
  pageSize: number,
  signal?: AbortSignal,
) {
  return runStepPrompt(
    (context) => select<Back | T>(stepConfig(message, choices, defaultValue, pageSize), context),
    (answer) => ({ answer: choiceName(choices, answer), message }),
    signal,
  );
}

/**
 * Como chooseOne, con una opcion "← Volver" al final para el motor de pasos (Esc hace lo mismo).
 * Acepta separadores entre opciones.
 */
export async function chooseStep<T>(
  message: string,
  choices: ReadonlyArray<Choice<T> | Separator>,
  defaultValue?: T,
  pageSize = 12,
): Promise<Back | T> {
  const result = await selectStep(message, choices, defaultValue, pageSize);

  // Sin signal externo, solo Esc aborta, y eso ya vuelve como BACK.
  return 'answer' in result ? result.answer : BACK;
}

/** Borra la linea de la ultima respuesta ("✔ pregunta respuesta"), para redibujar la misma lista en su lugar. */
export function eraseLastAnswer(): void {
  if (process.stdout.isTTY) {
    process.stdout.write('\u001B[1A\u001B[2K\r');
  }
}

export type LoadingResult<T, L> = { readonly answer: Back | T } | { readonly loaded: L };

/**
 * Muestra la lista mientras `loading` esta en curso (por ejemplo, con "Cargando…" en lugar de un boton).
 * Si termina la carga, la lista desaparece sin dejar rastro y devuelve lo cargado; si antes se elige
 * una opcion (o Esc), devuelve esa respuesta.
 */
export async function chooseStepWhileLoading<T, L>(
  message: string,
  choices: ReadonlyArray<Choice<T> | Separator>,
  defaultValue: T | undefined,
  pageSize: number,
  loading: Promise<L>,
): Promise<LoadingResult<T, L>> {
  const loaded = new AbortController();
  const stop = () => loaded.abort();

  loading.then(stop, stop);

  const result = await selectStep(message, choices, defaultValue, pageSize, loaded.signal);

  return 'answer' in result ? result : { loaded: await loading };
}

/** Como askText, pero Esc (o escribir "<") vuelve al paso anterior. */
export async function askTextStep(
  message: string,
  options: { readonly defaultValue?: string; readonly validate?: (value: string) => string | true } = {},
): Promise<Back | string> {
  const result = await runStepPrompt(
    (context) =>
      input(
        {
          default: options.defaultValue,
          message: `${message} ${colorize('([esc] para volver)', 'muted')}`,
          theme: TEXT_THEME,
          validate: (value) => (value.trim() === BACK_TEXT ? true : (options.validate?.(value) ?? true)),
        },
        context,
      ),
    (answer) => ({ answer: answer.trim(), message }),
  );

  if (!('answer' in result) || result.answer === BACK) {
    return BACK;
  }

  const answer = result.answer.trim();

  return answer === BACK_TEXT ? BACK : answer;
}

/**
 * Seleccion multiple: espacio marca, Enter confirma (sin marcar nada tambien vale). Tiene un "← Volver" al
 * final para el motor de pasos: si se marca (o con Esc), vuelve al paso anterior.
 */
export async function chooseManyStep<T>(
  message: string,
  choices: ReadonlyArray<Choice<T>>,
  selected: readonly T[] = [],
): Promise<Back | T[]> {
  const result = await runStepPrompt(
    (context) =>
      checkbox<Back | T>(
        {
          choices: [
            ...choices.map((choice) => ({ ...choice, checked: selected.includes(choice.value) })),
            BACK_SPACER,
            BACK_CHOICE,
          ],
          loop: false,
          message,
          pageSize: 12,
          theme: STEP_THEME,
        },
        context,
      ),
    (answer) => ({
      answer: choices
        .filter((choice) => answer.includes(choice.value))
        .map((choice) => choice.name)
        .join(', '),
      message,
    }),
  );

  if (!('answer' in result) || result.answer === BACK || result.answer.includes(BACK)) {
    return BACK;
  }

  return result.answer as T[];
}
