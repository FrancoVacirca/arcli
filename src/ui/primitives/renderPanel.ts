import boxen, { type Options as BoxenOptions, type Spacing as BoxenSpacing } from 'boxen';

import { UI_THEME, type UiBorderStyle, type UiBorderType, type UiWidthPreset } from '../theme/theme';

import { renderDivider } from './renderDivider';
import { renderFooter } from './renderFooter';
import { renderSubtitle } from './renderSubtitle';
import { fitToTerminal, resolveTerminalColumns } from './terminalWidth';
import {
  bold,
  centerLineBlock,
  centerLines,
  colorize,
  flattenVisibleLines,
  maxVisibleWidth,
  stripAnsi,
  type UiTextColor,
  wrapIndentedPlainText,
} from './text';

type PanelAlignment = 'block-center' | 'center' | 'left';

export interface RenderPanelProps {
  readonly borderColor?: BoxenOptions['borderColor'];
  readonly borderType?: UiBorderType;
  readonly content: string | readonly string[];
  readonly contentAlign?: PanelAlignment;
  readonly footer?: string;
  readonly footerColor?: UiTextColor;
  readonly footerDivider?: boolean;
  readonly maxWidth?: UiWidthPreset | number;
  readonly padding?: Partial<BoxenSpacing>;
  /** Solo `command`: deja las lineas en blanco (con su barra) en lugar de sacarlas. */
  readonly preserveBlankLines?: boolean;
  readonly subtitle?: string;
  readonly subtitleColor?: UiTextColor;
  readonly title?: string;
  readonly titleAlignment?: BoxenOptions['titleAlignment'];
  readonly titleColor?: UiTextColor;
  readonly width?: UiWidthPreset | number;
}

function resolvePadding(padding?: Partial<BoxenSpacing>): BoxenSpacing {
  const base = UI_THEME.spacing.panelPadding;

  return {
    bottom: padding?.bottom ?? base.bottom ?? 0,
    left: padding?.left ?? base.left ?? 0,
    right: padding?.right ?? base.right ?? 0,
    top: padding?.top ?? base.top ?? 0,
  };
}

function resolveWidth(width: RenderPanelProps['width']): number {
  if (typeof width === 'number') {
    return width;
  }

  return UI_THEME.widths[width ?? 'standard'].min;
}

function resolveMaxWidth(width: RenderPanelProps['maxWidth']): number | null {
  if (width === undefined) {
    return null;
  }

  if (typeof width === 'number') {
    return width;
  }

  return UI_THEME.widths[width].max;
}

function alignLines(lines: readonly string[], width: number, align: PanelAlignment): string[] {
  if (align === 'left') {
    return flattenVisibleLines(lines);
  }

  if (align === 'block-center') {
    return centerLineBlock(lines, width);
  }

  return centerLines(lines, width);
}

// Ancho minimo del panel aunque la terminal sea mas angosta: por debajo de esto el contenido no entra.
const MIN_PANEL_WIDTH = 24;

// Marca de la linea divisoria: despues de dibujar la caja se reemplaza por una linea unida al borde
// (por ejemplo `╟┄┄┄╢`). El caracter NUL no ocupa ancho, asi que no altera el calculo de boxen.
const DIVIDER_MARKER = '\u0000';

/** ARCLI_ASCII=1 cambia todos los bordes por ASCII puro, para terminales sin caracteres de caja. */
export function usesAsciiBorders(): boolean {
  const value = process.env.ARCLI_ASCII?.trim().toLowerCase();

  return value === '1' || value === 'true' || value === 'si';
}

function resolveBorderStyle(borderType: Exclude<UiBorderType, 'command'>): UiBorderStyle {
  return usesAsciiBorders() ? UI_THEME.asciiBorderStyle : UI_THEME.borderStyles[borderType];
}

function joinDividers(box: string, junction: NonNullable<UiBorderStyle['junction']>): string {
  const [left, fill, right] = junction;

  return box
    .split('\n')
    .map((line) => {
      if (!line.includes(DIVIDER_MARKER)) {
        return line;
      }

      const width = stripAnsi(line).replace(DIVIDER_MARKER, '').length;

      return `${left}${fill.repeat(Math.max(0, width - 2))}${right}`;
    })
    .join('\n');
}

/**
 * Estilo `command`: una barra a la izquierda y nada a la derecha, para que al copiar el comando
 * no venga pegado un borde. Las lineas no se parten: la terminal las ajusta y se copian enteras.
 */
function renderCommandBlock(props: RenderPanelProps): string {
  const bar = colorize(usesAsciiBorders() ? UI_THEME.commandBar.ascii : UI_THEME.commandBar.unicode, 'info');
  const lines = typeof props.content === 'string' ? props.content.split('\n') : [...props.content];
  const titleLines = props.title ? [formatTitle(props.title, props.titleColor) ?? ''] : [];

  const contentLines = props.preserveBlankLines ? lines : lines.filter((line) => stripAnsi(line).trim().length > 0);

  return [...titleLines, ...contentLines].map((line) => `${bar}${line}`.trimEnd()).join('\n');
}

function formatTitle(title: string | undefined, color: UiTextColor | undefined): string | undefined {
  if (!title) {
    return undefined;
  }

  const normalizedTitle = bold(title.toUpperCase());

  // boxen 9 respeta el estilo que ya trae el titulo, asi que alcanza con colorearlo con el tema.
  return color ? colorize(normalizedTitle, color) : normalizedTitle;
}

export function renderPanel(props: RenderPanelProps): string {
  const borderType = props.borderType ?? 'common';

  if (borderType === 'command') {
    return renderCommandBlock(props);
  }

  const borderStyle = resolveBorderStyle(borderType);
  const padding = resolvePadding(props.padding);
  const paddingLeft = padding.left ?? 0;
  const paddingRight = padding.right ?? 0;
  const terminalColumns = resolveTerminalColumns();
  // En una terminal angosta el panel se achica para no cortarse: si es mas ancho que la ventana,
  // cada linea se parte y el borde queda roto.
  const terminalLimit = terminalColumns === null ? null : Math.max(MIN_PANEL_WIDTH, terminalColumns);
  const presetMinimumWidth = resolveWidth(props.width);
  const minimumWidth = terminalLimit === null ? presetMinimumWidth : Math.min(presetMinimumWidth, terminalLimit);
  const configuredMaxWidth =
    props.maxWidth === undefined
      ? typeof props.width === 'number'
        ? null
        : UI_THEME.widths[props.width ?? 'standard'].max
      : resolveMaxWidth(props.maxWidth);
  const presetMaximumWidth =
    configuredMaxWidth === null ? Number.POSITIVE_INFINITY : Math.max(minimumWidth, configuredMaxWidth);
  const maximumWidth = terminalLimit === null ? presetMaximumWidth : Math.min(presetMaximumWidth, terminalLimit);
  const contentLines = typeof props.content === 'string' ? props.content.split('\n') : [...props.content];
  const visibleLines = [...contentLines];
  const calculatedWidth = maxVisibleWidth(visibleLines) + paddingLeft + paddingRight + 2;
  const panelWidth = Math.min(maximumWidth, Math.max(minimumWidth, calculatedWidth));
  const innerWidth = Math.max(0, panelWidth - paddingLeft - paddingRight - 2);
  // Con junction la linea se une al borde; si no, va por adentro como un divisor `═`.
  const footerDividerLine = props.footerDivider
    ? borderStyle.junction
      ? DIVIDER_MARKER
      : renderDivider({ character: '═', width: innerWidth })
    : null;
  const footerLine = props.footer
    ? renderFooter({
        text: props.footer,
        textColor: props.footerColor,
        width: innerWidth,
      })
    : null;

  const wrappedContentLines = contentLines.flatMap((line) => wrapIndentedPlainText(line, innerWidth));
  const lines: string[] = [];
  const hasBodyContent = contentLines.length > 0;
  const hasFooter = footerLine !== null;
  const hasFooterDivider = footerDividerLine !== null;

  if (props.subtitle) {
    lines.push(
      ...renderSubtitle({
        text: props.subtitle,
        textColor: props.subtitleColor,
        width: innerWidth,
      }),
    );

    if (hasBodyContent || hasFooter || hasFooterDivider) {
      lines.push('');
    }
  }

  if (hasBodyContent) {
    lines.push(...alignLines(wrappedContentLines, innerWidth, props.contentAlign ?? 'left'));
  }

  if (footerDividerLine) {
    lines.push('', footerDividerLine);
  }

  if (footerLine) {
    lines.push('', footerLine);
  }

  const box = boxen(lines.join('\n'), {
    borderColor: props.borderColor,
    borderStyle: borderStyle.box,
    padding,
    title: formatTitle(props.title, props.titleColor),
    titleAlignment: props.titleAlignment ?? borderStyle.titleAlignment ?? 'center',
    width: panelWidth,
  });

  const panel = footerDividerLine && borderStyle.junction ? joinDividers(box, borderStyle.junction) : box;

  return borderType === 'ticket' ? centerInContentWidth(panel, panelWidth) : panel;
}

/** Centra el panel en el ancho comun de las cajas y la barra de estado (o el de la terminal, si es menor). */
function centerInContentWidth(panel: string, panelWidth: number): string {
  const indent = ' '.repeat(Math.max(0, Math.floor((fitToTerminal(UI_THEME.widths.wide.min) - panelWidth) / 2)));

  return indent
    ? panel
        .split('\n')
        .map((line) => `${indent}${line}`)
        .join('\n')
    : panel;
}
