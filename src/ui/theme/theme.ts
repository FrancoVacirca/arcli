import type { Spacing as BoxenSpacing } from 'boxen';

/**
 * Tipo de borde segun lo que se muestra:
 * - common: paneles de contenido (configuracion, observaciones, sugerencias, avisos FCE)
 * - ticket: comprobante, como common pero con la linea de corte punteada antes del estado; va centrado
 * - error: errores del CLI o de ARCA (redondeado con franja gruesa a la izquierda)
 * - attention: observaciones y avisos (como error, con la franja a trazos)
 * - tip: sugerencias (como error, con la franja fina punteada)
 * - sheet: fichas de consulta, como configuracion o regimen FCE (titulo a la izquierda)
 * - checklist: revision de configuracion (doble lateral, veredicto en el pie)
 * - listing: listados en tabla, como los ultimos comprobantes (solo reglas arriba y abajo)
 * - note: avisos simples de una linea (solo esquinas)
 * - warning: banner del entorno de testing
 * - info: aviso de nueva version
 * - data: JSON y respuestas crudas
 * - command: comandos para copiar (solo barra a la izquierda, sin borde derecho)
 * - debug: storybook
 */
export type UiBorderType =
  | 'attention'
  | 'checklist'
  | 'command'
  | 'common'
  | 'data'
  | 'debug'
  | 'error'
  | 'info'
  | 'listing'
  | 'note'
  | 'sheet'
  | 'ticket'
  | 'tip'
  | 'warning';

export interface UiBoxBorder {
  readonly bottom: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly left: string;
  readonly right: string;
  readonly top: string;
  readonly topLeft: string;
  readonly topRight: string;
}

export interface UiBorderStyle {
  readonly box: UiBoxBorder;
  /** Linea divisoria unida al borde: [izquierda, relleno, derecha]. Sin junction, el divisor va por adentro. */
  readonly junction?: readonly [left: string, fill: string, right: string];
  /** Alineacion del titulo sobre el borde; por defecto, centrado. */
  readonly titleAlignment?: 'center' | 'left';
}
export type UiColorToken =
  | 'danger'
  | 'debug'
  | 'highlight'
  | 'info'
  | 'muted'
  | 'neutral'
  | 'production'
  | 'subtle'
  | 'success'
  | 'testing'
  | 'warning';
export type UiWidthPreset = 'compact' | 'standard' | 'ticket' | 'wide';
export interface UiWidthRange {
  readonly max: number;
  readonly min: number;
}

export interface UiTheme {
  readonly badgeBrackets: readonly [left: string, right: string];
  /** Bordes Unicode por tipo; `command` no dibuja caja, solo la barra de `commandBar`. */
  readonly borderStyles: Readonly<Record<Exclude<UiBorderType, 'command'>, UiBorderStyle>>;
  /** Respaldo para terminales sin caracteres de caja (ARCLI_ASCII=1). */
  readonly asciiBorderStyle: UiBorderStyle;
  readonly commandBar: { readonly ascii: string; readonly unicode: string };
  readonly colors: Readonly<Record<UiColorToken, string>>;
  readonly headingLineMinWidth: number;
  readonly spacing: {
    readonly gaps: {
      readonly section: number;
      readonly block: number;
    };
    readonly panelPadding: BoxenSpacing;
  };
  readonly table: {
    readonly gap: number;
    readonly labelWidth: number;
  };
  readonly widths: Readonly<Record<UiWidthPreset, UiWidthRange>>;
}

const CONTENT_WIDTH: UiWidthRange = { max: 92, min: 92 };

export const UI_THEME: UiTheme = {
  badgeBrackets: ['[', ']'],
  asciiBorderStyle: {
    box: {
      bottom: '-',
      bottomLeft: '+',
      bottomRight: '+',
      left: '|',
      right: '|',
      top: '-',
      topLeft: '+',
      topRight: '+',
    },
    junction: ['+', '-', '+'],
  },
  borderStyles: {
    attention: {
      box: {
        bottom: '─',
        bottomLeft: '╰',
        bottomRight: '╯',
        left: '╏',
        right: '│',
        top: '─',
        topLeft: '╭',
        topRight: '╮',
      },
    },
    checklist: {
      box: {
        bottom: '─',
        bottomLeft: '╙',
        bottomRight: '╜',
        left: '║',
        right: '║',
        top: '─',
        topLeft: '╓',
        topRight: '╖',
      },
      junction: ['╟', '─', '╢'],
    },
    common: {
      box: {
        bottom: '═',
        bottomLeft: '╘',
        bottomRight: '╛',
        left: '│',
        right: '│',
        top: '═',
        topLeft: '╒',
        topRight: '╕',
      },
    },
    data: {
      box: {
        bottom: '┈',
        bottomLeft: '└',
        bottomRight: '┘',
        left: '┊',
        right: '┊',
        top: '┈',
        topLeft: '┌',
        topRight: '┐',
      },
      junction: ['├', '┈', '┤'],
    },
    debug: {
      box: {
        bottom: '─',
        bottomLeft: '└',
        bottomRight: '┘',
        left: '│',
        right: '│',
        top: '─',
        topLeft: '┌',
        topRight: '┐',
      },
    },
    error: {
      box: {
        bottom: '─',
        bottomLeft: '╰',
        bottomRight: '╯',
        left: '┃',
        right: '│',
        top: '─',
        topLeft: '╭',
        topRight: '╮',
      },
    },
    info: {
      box: {
        bottom: '─',
        bottomLeft: '╰',
        bottomRight: '╯',
        left: '│',
        right: '│',
        top: '─',
        topLeft: '╭',
        topRight: '╮',
      },
      junction: ['├', '─', '┤'],
    },
    listing: {
      box: {
        bottom: '═',
        bottomLeft: '═',
        bottomRight: '═',
        left: ' ',
        right: ' ',
        top: '═',
        topLeft: '═',
        topRight: '═',
      },
      titleAlignment: 'left',
    },
    note: {
      box: {
        bottom: ' ',
        bottomLeft: '└',
        bottomRight: '┘',
        left: ' ',
        right: ' ',
        top: ' ',
        topLeft: '┌',
        topRight: '┐',
      },
    },
    sheet: {
      box: {
        bottom: '─',
        bottomLeft: '└',
        bottomRight: '┘',
        left: '│',
        right: '│',
        top: '─',
        topLeft: '┌',
        topRight: '┐',
      },
      junction: ['├', '─', '┤'],
      titleAlignment: 'left',
    },
    ticket: {
      box: {
        bottom: '═',
        bottomLeft: '╘',
        bottomRight: '╛',
        left: '│',
        right: '│',
        top: '═',
        topLeft: '╒',
        topRight: '╕',
      },
      junction: ['├', '┄', '┤'],
    },
    tip: {
      box: {
        bottom: '─',
        bottomLeft: '╰',
        bottomRight: '╯',
        left: '┆',
        right: '│',
        top: '─',
        topLeft: '╭',
        topRight: '╮',
      },
    },
    warning: {
      box: {
        bottom: '╌',
        bottomLeft: '└',
        bottomRight: '┘',
        left: '╎',
        right: '╎',
        top: '╌',
        topLeft: '┌',
        topRight: '┐',
      },
      junction: ['├', '╌', '┤'],
    },
  },
  commandBar: { ascii: '| ', unicode: '▎ ' },
  colors: {
    danger: '\u001B[31m',
    debug: '\u001B[95m',
    // Naranja amarillento (paleta de 256 colores): para invitar a una accion, como actualizar arcli.
    highlight: '\u001B[38;5;214m',
    info: '\u001B[36m',
    muted: '\u001B[2m',
    // Color por defecto de la terminal: claro en fondos oscuros y oscuro en fondos claros.
    // Un blanco fijo (\u001B[37m) casi no se leia en terminales con fondo claro.
    neutral: '\u001B[39m',
    // Entornos en la barra del modo interactivo (paleta de 256 colores): celeste para produccion.
    production: '\u001B[38;5;117m',
    // Gris (bright black): para titulos de datos crudos, que tienen que verse pero sin competir.
    subtle: '\u001B[90m',
    success: '\u001B[32m',
    // Naranja para testing; mas rojizo que `highlight`, para no confundirlo con el boton de actualizar.
    testing: '\u001B[38;5;208m',
    warning: '\u001B[33m',
  },
  headingLineMinWidth: 18,
  spacing: {
    gaps: {
      block: 1,
      section: 2,
    },
    panelPadding: {
      top: 1,
      right: 2,
      bottom: 1,
      left: 2,
    },
  },
  table: {
    gap: 2,
    labelWidth: 30,
  },
  // Un solo ancho para todas las cajas, igual al de la barra de estado y al que centra el logo, asi todo ocupa
  // el mismo espacio. En una terminal mas angosta se achica (ver renderPanel y fitToTerminal).
  widths: {
    compact: CONTENT_WIDTH,
    standard: CONTENT_WIDTH,
    // Los comprobantes son mas angostos, como un ticket, y van centrados en CONTENT_WIDTH.
    ticket: { max: 80, min: 68 },
    wide: CONTENT_WIDTH,
  },
};
