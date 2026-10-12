import { UI_THEME } from '../theme/theme';

import { fitToTerminal } from './terminalWidth';
import { colorize } from './text';

export const ARCLI_ASCII_BANNER = [
  '       d8888 8888888b.   .d8888b.  888      8888888 ',
  '      d88888 888   Y88b d88P  Y88b 888        888   ',
  '     d88P888 888    888 888    888 888        888   ',
  '    d88P 888 888   d88P 888        888        888   ',
  '   d88P  888 8888888P"  888        888        888   ',
  '  d88P   888 888 T88b   888    888 888        888   ',
  ' d8888888888 888  T88b  Y88b  d88P 888        888   ',
  'd88P     888 888   T88b  "Y8888P"  88888888 8888888 ',
].join('\n');

// Columna donde termina "AR" (con el espacio entre letras) y arranca "CLI",
// segun las columnas en blanco de ARCLI_ASCII_BANNER (letras separadas por
// una columna vacia en las 8 filas: 12, 23, 34, 43).
const ARCLI_BANNER_AR_CLI_SPLIT_COLUMN = 23;

// Ultima columna con trazo de ARCLI_ASCII_BANNER (el final de la "I"): la firma termina justo debajo.
const BANNER_LAST_COLUMN = 50;
const CREDIT = 'LcsGrz';

/** Debajo del logo, en gris y alineado al final de la "I": `v1.8.0 | LcsGrz`, o solo la firma sin version. */
function renderLogoFooter(version: string | undefined): string {
  const footer = version ? `v${version} | ${CREDIT}` : CREDIT;

  return colorize(footer.padStart(BANNER_LAST_COLUMN + 1), 'muted');
}

function renderLogoWidth(): number {
  return ARCLI_ASCII_BANNER.split('\n')[0]?.length ?? 0;
}

/** Sangria para centrar el logo en el ancho de las cajas y de la barra de estado. */
function logoIndent(): string {
  const visibleWidth = BANNER_LAST_COLUMN + 1;

  return ' '.repeat(Math.max(0, Math.floor((fitToTerminal(UI_THEME.widths.wide.min) - visibleWidth) / 2)));
}

/** El logo de ARCLI, centrado; con `version`, la muestra debajo, junto a la firma. */
export function renderLogo(version?: string): string {
  const columns = process.stdout.columns;

  // En una terminal mas angosta que el dibujo, cada linea se partiria: se muestra solo el nombre.
  if (columns && columns < renderLogoWidth()) {
    const suffix = version ? ` ${colorize(`v${version}`, 'muted')}` : '';

    return `\n${colorize('AR', 'info')}${colorize('CLI', 'neutral')}${suffix}\n`;
  }

  const logo = ARCLI_ASCII_BANNER.split('\n').map((line) => {
    const ar = line.slice(0, ARCLI_BANNER_AR_CLI_SPLIT_COLUMN);
    const cli = line.slice(ARCLI_BANNER_AR_CLI_SPLIT_COLUMN);

    return `${colorize(ar, 'info')}${colorize(cli, 'neutral')}`;
  });

  const indent = logoIndent();

  return `\n\n${[...logo, renderLogoFooter(version)].map((line) => `${indent}${line}`).join('\n')}\n\n`;
}
