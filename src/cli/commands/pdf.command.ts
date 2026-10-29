import { Command } from 'commander';
import { join } from 'node:path';

import { ConfigService } from '../../modules/config/config.service';
import { PdfPlugin } from '../../services/pdf/pdf-plugin';
import {
  formatPdfPluginStatusAsJson,
  formatPdfPluginStatusAsText,
  noticePanel,
  writeTerminalJson,
  writeTerminalOutput,
} from '../../ui';
import { registerJsonOption, resolveOutputJson } from '../global-options';
import { configureSpanishHelp } from '../help';
import { startSpinner } from '../spinner';

interface PdfContext {
  readonly json: boolean;
  readonly plugin: PdfPlugin;
}

function createContext(command: Command): PdfContext {
  const service = new ConfigService();

  try {
    const config = service.getConfig();

    return {
      json: resolveOutputJson(command, config),
      plugin: new PdfPlugin({ configuredBrowser: config.pdfNavegador, path: join(service.getPluginsPath(), 'pdf') }),
    };
  } finally {
    service.close();
  }
}

function printStatus({ json, plugin }: PdfContext, title?: string): void {
  const status = plugin.getStatus();

  if (json) {
    writeTerminalJson(formatPdfPluginStatusAsJson(status));

    return;
  }

  writeTerminalOutput(formatPdfPluginStatusAsText(status, title));
}

export function registerPdfCommand(program: Command): void {
  const pdfCommand = registerJsonOption(
    program.command('pdf').description('instalar o revisar el plugin que genera los PDFs de los comprobantes'),
  ).action((_options: unknown, command: Command) => printStatus(createContext(command)));

  configureSpanishHelp(pdfCommand);

  const estadoCommand = registerJsonOption(
    pdfCommand.command('estado').description('mostrar si el plugin está instalado, su versión y el navegador que usa'),
  ).action((_options: unknown, command: Command) => printStatus(createContext(command)));
  configureSpanishHelp(estadoCommand);

  // Pedir el comando ya es la confirmacion: no se vuelve a preguntar, asi tambien sirve en scripts.
  const instalarCommand = registerJsonOption(
    pdfCommand
      .command('instalar')
      .description('descargar el plugin de PDF (~160 MB, o ~360 MB si no hay Chrome instalado)'),
  ).action(async (_options: unknown, command: Command) => {
    const context = createContext(command);
    const { json, plugin } = context;
    const spinner = json ? null : startSpinner('Instalando el plugin de PDF...');

    try {
      await plugin.install((message) => {
        if (spinner) {
          spinner.text = message;
        }
      });
    } finally {
      spinner?.stop();
    }

    printStatus(context, 'Plugin de PDF instalado');
  });
  configureSpanishHelp(instalarCommand);

  const desinstalarCommand = registerJsonOption(
    pdfCommand.command('desinstalar').description('borrar el plugin de PDF y el navegador que haya descargado'),
  ).action((_options: unknown, command: Command) => {
    const { json, plugin } = createContext(command);

    plugin.uninstall();

    if (json) {
      writeTerminalJson(JSON.stringify({ desinstalado: true, ruta: plugin.getStatus().path }, null, 2));

      return;
    }

    writeTerminalOutput(noticePanel('Plugin de PDF desinstalado.', 'success'));
  });
  configureSpanishHelp(desinstalarCommand);
}
