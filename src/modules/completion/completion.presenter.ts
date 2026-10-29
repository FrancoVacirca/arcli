import { noticePanel } from '../../ui';

import type { CompletionInstallResult, CompletionInstallState } from './installer';

/** `/Users/vos/.zshrc` → `~/.zshrc`, como lo escribe la gente. */
function displayPath(path: string, home: string): string {
  return home && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

function reloadHint(state: CompletionInstallState, home: string): string {
  return state.shell === 'fish'
    ? 'Abrí una terminal nueva.'
    : `Abrí una terminal nueva o corré: source ${displayPath(state.path, home)}`;
}

export function formatCompletionStateAsText(state: CompletionInstallState, home: string): string {
  const where = displayPath(state.path, home);

  return state.installed
    ? noticePanel(`Autocompletado instalado para ${state.shell} (${where}).`, 'success')
    : noticePanel(`Autocompletado no instalado para ${state.shell}. Instalalo con: arcli completado instalar`, 'muted');
}

export function formatCompletionResultAsText(result: CompletionInstallResult, home: string): string {
  const where = displayPath(result.path, home);

  if (!result.changed) {
    return noticePanel(
      result.installed
        ? `El autocompletado ya estaba instalado para ${result.shell} (${where}).`
        : `El autocompletado no estaba instalado para ${result.shell}.`,
      'muted',
    );
  }

  return result.installed
    ? noticePanel(`Autocompletado instalado para ${result.shell} en ${where}.\n${reloadHint(result, home)}`, 'success')
    : noticePanel(`Autocompletado desinstalado de ${where}.\nEn esta terminal sigue activo hasta cerrarla.`, 'success');
}

export function formatCompletionStateAsJson(state: CompletionInstallState | CompletionInstallResult): string {
  return JSON.stringify(
    {
      ...('changed' in state ? { cambio: state.changed } : {}),
      instalado: state.installed,
      ruta: state.path,
      shell: state.shell,
    },
    null,
    2,
  );
}
