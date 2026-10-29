import { bold, colorize, noticePanel, renderPanel, type UiTextColor } from '../../ui';

import { CHANGELOG_PAGE_URL, type ChangelogChange, type ChangelogChangeKind, type ChangelogEntry } from './changelog';
import type { UpdateCheckResult } from './update-check.service';

export const UPDATE_COMMAND = 'npm install -g arcli@latest';

/** Versiones del changelog que se muestran, y cambios por version; el resto queda en el link. */
const MAX_CHANGELOG_ENTRIES = 3;
const MAX_CHANGES_PER_ENTRY = 6;

export function renderUpdateNoticePanel(result: UpdateCheckResult): string {
  return noticePanel(
    `Nueva versión disponible: ${result.latestVersion} (actual: ${result.currentVersion})\n` +
      `Actualiza con: ${UPDATE_COMMAND}`,
    'info',
    'info',
  );
}

const KIND_LABELS: Record<ChangelogChangeKind, readonly [label: string, color: UiTextColor]> = {
  agregado: ['nuevo', 'success'],
  cambiado: ['cambio', 'info'],
  corregido: ['arreglo', 'warning'],
  eliminado: ['quitado', 'danger'],
  otro: ['otro', 'muted'],
  seguridad: ['seguridad', 'danger'],
};
const KIND_LABEL_WIDTH = Math.max(...Object.values(KIND_LABELS).map(([label]) => label.length));
const CHANGE_INDENT = ' '.repeat(2 + KIND_LABEL_WIDTH + 2);

/** `2026-10-09` → `09/10/2026`; otro formato queda igual. */
function formatChangelogDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

function formatChange(change: ChangelogChange): string {
  const text = change.topic ? `${bold(`${change.topic}:`)} ${change.text}` : change.text;

  if (change.nested) {
    return `${CHANGE_INDENT}· ${text}`;
  }

  const [label, color] = KIND_LABELS[change.kind];

  return `  ${colorize(label.padEnd(KIND_LABEL_WIDTH), color)}  ${text}`;
}

function formatChanges(changes: readonly ChangelogChange[]): string[] {
  const lines = changes.slice(0, MAX_CHANGES_PER_ENTRY).map(formatChange);
  const hidden = changes.length - MAX_CHANGES_PER_ENTRY;

  return hidden > 0 ? [...lines, colorize(`${CHANGE_INDENT}y ${hidden} cambio(s) más`, 'muted')] : lines;
}

function formatChangelog(entries: readonly ChangelogEntry[] | undefined): string[] {
  if (!entries || entries.length === 0) {
    return [colorize(`No se pudieron cargar las novedades. Miralas en ${CHANGELOG_PAGE_URL}`, 'muted')];
  }

  const lines = entries
    .slice(0, MAX_CHANGELOG_ENTRIES)
    .flatMap((entry) => [
      '',
      `${bold(entry.version)}${entry.date ? ` · ${colorize(formatChangelogDate(entry.date), 'muted')}` : ''}`,
      ...(entry.summary ? [entry.summary] : []),
      ...(entry.changes.length > 0 ? [''] : []),
      ...formatChanges(entry.changes),
    ]);
  const hidden = entries.length - MAX_CHANGELOG_ENTRIES;

  if (hidden > 0) {
    lines.push('', colorize(`Y ${hidden} versión(es) más en ${CHANGELOG_PAGE_URL}`, 'muted'));
  }

  return lines;
}

/** Pantalla de "Actualizar": versiones, novedades y como actualizar. */
export function renderUpdateDetails(result: UpdateCheckResult, entries: readonly ChangelogEntry[] | undefined): string {
  const versions = renderPanel({
    borderType: 'sheet',
    content: [
      `Tu versión      ${result.currentVersion}`,
      `Nueva versión   ${colorize(bold(result.latestVersion), 'highlight')}`,
      '',
      bold('NOVEDADES'),
      ...formatChangelog(entries),
    ],
    title: 'Actualización disponible',
    width: 'wide',
  });
  const howTo = renderPanel({
    borderType: 'command',
    content: [
      'Para actualizar, arcli se cierra y deja este comando copiado. Pegalo en la terminal y apreta Enter:',
      '',
      bold(colorize(UPDATE_COMMAND, 'info')),
    ],
    preserveBlankLines: true,
    width: 'wide',
  });

  return `${versions}\n\n${howTo}`;
}
