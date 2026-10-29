import type { Command } from 'commander';

import { InputValidationError } from '../../lib/errors/app-error';
import type { StorybookScene } from '../../ui';
import { renderStorybookShowcase, writeTerminalOutput } from '../../ui';
import { configureSpanishHelp, createStorybookHelp } from '../help';

const STORYBOOK_SCENES: StorybookScene[] = [
  'bordes',
  'colores',
  'componentes',
  'comprobantes',
  'configuracion',
  'errores',
  'json',
];

export function registerStorybookCommand(program: Command): void {
  const command = program
    // Herramienta de desarrollo: funciona, pero no se lista en la ayuda.
    .command('storybook', { hidden: true })
    .description('ver escenas visuales del CLI con datos de ejemplo')
    .argument('[escena]', 'bordes, comprobantes, colores, componentes, configuración, errores o json')
    .action((scene?: string) => {
      if (scene && !STORYBOOK_SCENES.includes(scene as StorybookScene)) {
        throw new InputValidationError(
          `La escena "${scene}" no es válida. Usá bordes, comprobantes, colores, componentes, configuración, errores o json.`,
        );
      }

      writeTerminalOutput(renderStorybookShowcase(scene as StorybookScene | undefined));
    })
    .addHelpText('after', createStorybookHelp());

  configureSpanishHelp(command);
}
