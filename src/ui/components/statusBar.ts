import { usesAsciiBorders } from '../primitives/renderPanel';
import { fitToTerminal } from '../primitives/terminalWidth';
import { colorize, stripAnsi, type UiTextColor } from '../primitives/text';
import { UI_THEME } from '../theme/theme';

/** Ancho de la barra de estado: el preset `wide`, o menos si la terminal es mas angosta. */
export function statusBarWidth(): number {
  return fitToTerminal(UI_THEME.widths.wide.min);
}

/** Un dato de la barra. */
export interface StatusBarSegment {
  readonly color?: UiTextColor;
  readonly text: string;
}

/** Como se separan los datos de un lado: con ` · ` o con un tramo de la misma linea de la barra (` ━ `). */
export type StatusBarSeparator = 'dot' | 'rule';

export interface StatusBarOptions {
  readonly leftSeparator?: StatusBarSeparator;
  readonly rightSeparator?: StatusBarSeparator;
}

function renderSegments(segments: readonly StatusBarSegment[], separator: StatusBarSeparator, fill: string): string {
  return segments
    .map(({ color, text }) => (color ? colorize(text, color) : text))
    .join(colorize(` ${separator === 'rule' ? fill : '·'} `, 'muted'));
}

/**
 * Barra de una linea con el contexto de la sesion, como la barra de estado de un editor:
 * `━━ izquierda · ... ━━━━━━━━━━━━ derecha ━ ... ━━`. No es una caja: no compite con los paneles de contenido.
 */
export function statusBar(
  left: readonly StatusBarSegment[],
  right: readonly StatusBarSegment[] = [],
  options: StatusBarOptions = {},
): string {
  const fill = usesAsciiBorders() ? '=' : '━';
  const width = statusBarWidth();
  const leftText = ` ${renderSegments(left, options.leftSeparator ?? 'dot', fill)} `;
  const rightText = right.length > 0 ? ` ${renderSegments(right, options.rightSeparator ?? 'dot', fill)} ` : '';
  const used = 2 + stripAnsi(leftText).length + stripAnsi(rightText).length + 2;
  const middle = Math.max(2, width - used);

  return [
    colorize(fill.repeat(2), 'muted'),
    leftText,
    colorize(fill.repeat(middle), 'muted'),
    rightText,
    colorize(fill.repeat(2), 'muted'),
  ].join('');
}
