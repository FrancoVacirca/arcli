import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { COMPLETION_SHELLS, type CompletionShell } from './shell-scripts';

/** Lo que hace falta del entorno para saber donde instalar; en los tests se pasa a mano. */
export interface CompletionEnvironment {
  readonly home: string;
  readonly platform: NodeJS.Platform;
  /** `$SHELL`, por ejemplo `/bin/zsh`. */
  readonly shell?: string;
  readonly xdgConfigHome?: string;
  readonly zdotdir?: string;
}

export interface CompletionInstallState {
  readonly installed: boolean;
  readonly path: string;
  readonly shell: CompletionShell;
}

export interface CompletionInstallResult extends CompletionInstallState {
  /** `false` si ya estaba como se pidio (instalado o desinstalado). */
  readonly changed: boolean;
}

/** Marca lo que agrega arcli, para reconocerlo y sacarlo despues sin tocar nada mas. */
const MARKER = '# arcli: autocompletado con Tab (se saca con "arcli completado desinstalar")';

export function currentCompletionEnvironment(): CompletionEnvironment {
  return {
    home: process.env.HOME ?? '',
    platform: process.platform,
    shell: process.env.SHELL,
    xdgConfigHome: process.env.XDG_CONFIG_HOME,
    zdotdir: process.env.ZDOTDIR,
  };
}

/** El shell de `$SHELL`, si es uno que arcli sabe completar. */
export function detectShell(shellPath: string | undefined): CompletionShell | undefined {
  const name = shellPath ? basename(shellPath) : '';

  return COMPLETION_SHELLS.find((shell) => shell === name);
}

/** Donde va el autocompletado: la linea en el rc de bash o zsh, o un archivo propio en fish. */
export function resolveCompletionPath(shell: CompletionShell, environment: CompletionEnvironment): string {
  if (shell === 'fish') {
    return join(environment.xdgConfigHome ?? join(environment.home, '.config'), 'fish', 'completions', 'arcli.fish');
  }

  if (shell === 'zsh') {
    return join(environment.zdotdir ?? environment.home, '.zshrc');
  }

  if (environment.platform !== 'darwin') {
    return join(environment.home, '.bashrc');
  }

  // La Terminal de macOS abre bash como login shell: lee el primero que exista de estos. Crear .bash_profile
  // cuando solo hay .profile haria que bash deje de leer .profile.
  const loginFiles = ['.bash_profile', '.bash_login', '.profile'].map((name) => join(environment.home, name));

  return loginFiles.find((path) => existsSync(path)) ?? loginFiles[0];
}

function activationLine(shell: CompletionShell): string {
  return shell === 'fish'
    ? 'arcli completado fish | source'
    : `command -v arcli >/dev/null 2>&1 && eval "$(arcli completado ${shell})"`;
}

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/** Lo agrego arcli o se agrego a mano: cualquier linea que active `arcli completado <shell>`. */
function isActivationLine(line: string, shell: CompletionShell): boolean {
  return line === MARKER || line.includes(`arcli completado ${shell}`);
}

export function getCompletionState(shell: CompletionShell, environment: CompletionEnvironment): CompletionInstallState {
  const path = resolveCompletionPath(shell, environment);
  const installed = readText(path)
    .split('\n')
    .some((line) => line !== MARKER && isActivationLine(line, shell) && !line.trimStart().startsWith('#'));

  return { installed, path, shell };
}

export function installCompletion(shell: CompletionShell, environment: CompletionEnvironment): CompletionInstallResult {
  const state = getCompletionState(shell, environment);

  if (state.installed) {
    return { ...state, changed: false };
  }

  const block = `${MARKER}\n${activationLine(shell)}\n`;

  mkdirSync(dirname(state.path), { recursive: true });

  if (shell === 'fish') {
    writeFileSync(state.path, block);
  } else {
    const current = readText(state.path);
    const separator = current === '' ? '' : current.endsWith('\n') ? '\n' : '\n\n';

    writeFileSync(state.path, `${current}${separator}${block}`);
  }

  return { ...state, changed: true, installed: true };
}

export function uninstallCompletion(
  shell: CompletionShell,
  environment: CompletionEnvironment,
): CompletionInstallResult {
  const state = getCompletionState(shell, environment);
  const current = readText(state.path);

  if (!current.includes(MARKER) && !state.installed) {
    return { ...state, changed: false };
  }

  if (shell === 'fish') {
    rmSync(state.path, { force: true });

    return { ...state, changed: true, installed: false };
  }

  const lines = current.split('\n');
  const kept = lines.filter((line, index) => {
    if (isActivationLine(line, shell)) {
      return false;
    }

    // La linea en blanco que se agrego antes del bloque tambien se va.
    return !(line === '' && lines[index + 1] === MARKER);
  });

  writeFileSync(state.path, kept.join('\n'));

  return { ...state, changed: true, installed: false };
}
