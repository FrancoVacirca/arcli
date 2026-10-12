import { isNewerVersion } from './update-check.service';

const CHANGELOG_URL = (version: string) => `https://raw.githubusercontent.com/LcsGrz/arcli/v${version}/CHANGELOG.md`;
export const CHANGELOG_PAGE_URL = 'https://github.com/LcsGrz/arcli/blob/main/CHANGELOG.md';
const FETCH_TIMEOUT_MS = 3000;
// Lo que entra en un renglon del panel junto a la etiqueta ("nuevo", "arreglo"), en una terminal de 92 columnas.
const MAX_LEAD_LENGTH = 70;

/** Secciones de Keep a Changelog que usa el CHANGELOG; `otro` para cualquier otra. */
export type ChangelogChangeKind = 'agregado' | 'cambiado' | 'corregido' | 'eliminado' | 'otro' | 'seguridad';

export interface ChangelogChange {
  readonly kind: ChangelogChangeKind;
  /** Un punto dentro de otro (por ejemplo, las partes de "Modo interactivo:"). */
  readonly nested: boolean;
  /** El titulo en negrita del cambio, o el comienzo del texto si no tiene. */
  readonly text: string;
  /** Categoria corta del titulo ("Modo interactivo", "Docs"); el detalle queda en `text`. */
  readonly topic?: string;
}

export interface ChangelogEntry {
  readonly changes: readonly ChangelogChange[];
  readonly date?: string;
  /** Primera oracion de la introduccion de la version, si tiene. */
  readonly summary?: string;
  readonly version: string;
}

const CHANGE_KINDS: Record<string, ChangelogChangeKind> = {
  agregado: 'agregado',
  cambiado: 'cambiado',
  corregido: 'corregido',
  eliminado: 'eliminado',
  seguridad: 'seguridad',
};

const VERSION_HEADING = /^## \[(\d+\.\d+\.\d+)\](?:\s*-\s*(\S+))?/;

/** Saca el markdown de una linea: negritas, codigo y links (queda el texto del link). */
function plainText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|`/g, '')
    .trim();
}

function shorten(value: string, maxLength = MAX_LEAD_LENGTH): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

function firstSentence(value: string): string {
  return value.split(/(?<=\.)\s/)[0] ?? value;
}

/**
 * El titulo en negrita del cambio. Si es solo una categoria corta ("Modo interactivo:", "Docs:"), queda como
 * `topic` y el texto es el comienzo de la descripcion, porque la categoria sola no dice nada.
 */
function changeLead(bullet: string): Pick<ChangelogChange, 'text' | 'topic'> {
  const bold = /^\*\*(.+?)\*\*(.*)$/.exec(bullet);

  if (!bold) {
    return { text: shorten(plainText(firstSentence(bullet))) };
  }

  const [, title, rest] = bold;
  const isCategory = title.endsWith(':') && title.split(/\s+/).length <= 2 && rest.trim() !== '';

  if (isCategory) {
    const topic = plainText(title.slice(0, -1));

    // La categoria y el texto van en el mismo renglon: "Docs: el glosario...".
    return { text: shorten(plainText(firstSentence(rest.trim())), MAX_LEAD_LENGTH - topic.length - 2), topic };
  }

  return { text: shorten(plainText(title.replace(/:$/, ''))) };
}

/** Las versiones posteriores a `currentVersion`, hasta `latestVersion` inclusive, de la mas nueva a la mas vieja. */
export function extractChangelog(markdown: string, currentVersion: string, latestVersion: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: { changes: ChangelogChange[]; date?: string; summary?: string; version: string } | undefined;
  let kind: ChangelogChangeKind | undefined;

  for (const line of markdown.split('\n')) {
    const heading = VERSION_HEADING.exec(line);

    if (heading) {
      const version = heading[1];
      const inRange = isNewerVersion(version, currentVersion) && !isNewerVersion(version, latestVersion);

      current = inRange ? { changes: [], date: heading[2], version } : undefined;
      kind = undefined;

      if (current) {
        entries.push(current);
      }

      continue;
    }

    if (line.startsWith('## ')) {
      current = undefined;
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('### ')) {
      kind = CHANGE_KINDS[line.slice(4).trim().toLowerCase()] ?? 'otro';
      continue;
    }

    const bullet = /^(\s*)- (.+)$/.exec(line);

    if (bullet) {
      current.changes.push({ kind: kind ?? 'otro', nested: bullet[1].length > 0, ...changeLead(bullet[2]) });
    } else if (!kind && line.trim() && !current.summary) {
      current.summary = plainText(firstSentence(line));
    }
  }

  return entries;
}

/** El CHANGELOG.md publicado con esa version; `undefined` si no se pudo bajar. */
export async function fetchChangelog(version: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(CHANGELOG_URL(version), { signal: controller.signal });

    return response.ok ? await response.text() : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
