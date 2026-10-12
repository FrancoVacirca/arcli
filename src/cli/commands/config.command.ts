import { Command } from 'commander';

import { ConfigService } from '../../modules/config/config.service';
import { buildConfigDoctorReport, type ConfigDoctorRuntimeCheck } from '../../modules/config/config-doctor';
import { ArcaContextResolver } from '../../services/arca/arca-context.resolver';
import {
  formatConfig,
  formatConfigAsText,
  formatConfigDoctor,
  formatConfigDoctorAsText,
  formatConfigPath,
  writeTerminalJson,
  writeTerminalOutput,
} from '../../ui';
import { configureSpanishHelp, createConfigHelp } from '../help';
import { startSpinner } from '../spinner';

function createConfigService(): ConfigService {
  const service = new ConfigService();
  service.ensureInitialized();

  return service;
}

function printConfigResult(textValue: string, jsonValue: string, useJson = false): void {
  if (useJson) {
    writeTerminalJson(jsonValue);
    return;
  }

  writeTerminalOutput(textValue);
}

export function buildRuntimeCheck(options: { produccion?: boolean; testing?: boolean }): ConfigDoctorRuntimeCheck {
  try {
    return {
      validation: new ArcaContextResolver({
        options: {
          produccion: options.produccion,
          testing: options.testing,
        },
      }).validate(),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo completar la revision activa.',
    };
  }
}

export function registerConfigCommand(program: Command): void {
  const configCommand = program
    .command('config')
    .description('guardar defaults, credenciales y revisar si el CLI esta listo para emitir');

  configureSpanishHelp(configCommand);

  configCommand.option('--json', 'imprimir salida JSON').action((options: { json?: boolean }) => {
    const service = createConfigService();

    try {
      const config = service.getConfig();
      const paths = service.resolvePaths(config);
      printConfigResult(formatConfigAsText(config, paths), formatConfig(config, paths), options.json);
    } finally {
      service.close();
    }
  });

  configCommand.addHelpText('after', createConfigHelp());

  const revisarCommand = configCommand
    .command('revisar')
    .description('revisar configuracion, defaults, credenciales y validacion activa')
    .option('--json', 'imprimir salida JSON')
    .option('--testing', 'revisar para testing')
    .option('--produccion', 'revisar para produccion')
    .action((options: { json?: boolean; produccion?: boolean; testing?: boolean }) => {
      const service = createConfigService();
      const spinner = options.json ? null : startSpinner('Generando revision...');

      try {
        const report = buildConfigDoctorReport(service.getConfig(), buildRuntimeCheck(options));
        spinner?.stop();
        printConfigResult(formatConfigDoctorAsText(report), formatConfigDoctor(report), options.json);
      } catch (error) {
        spinner?.stop();
        throw error;
      } finally {
        service.close();
      }
    });
  configureSpanishHelp(revisarCommand);

  const rutaCommand = configCommand
    .command('ruta')
    .description('mostrar la ruta del archivo de configuracion')
    .action(() => {
      const service = createConfigService();

      try {
        writeTerminalOutput(formatConfigPath(service.getPath()));
      } finally {
        service.close();
      }
    });
  configureSpanishHelp(rutaCommand);

  const establecerCommand = configCommand
    .command('establecer')
    .description('guardar un valor de configuracion')
    .option('--json', 'imprimir salida JSON')
    .argument('<clave>', 'clave publica de configuracion')
    .argument('<valor>', 'valor a guardar')
    .action((key: string, value: string, options: { json?: boolean }) => {
      // Sin ensureInitialized: si la config quedo invalida, establecer o eliminar la clave es la forma de arreglarla.
      const service = new ConfigService();

      try {
        const config = service.setValue(key, value);
        const paths = service.resolvePaths(config);
        printConfigResult(formatConfigAsText(config, paths), formatConfig(config, paths), options.json);
      } finally {
        service.close();
      }
    });
  configureSpanishHelp(establecerCommand);

  const eliminarCommand = configCommand
    .command('eliminar')
    .description('eliminar un valor de configuracion')
    .option('--json', 'imprimir salida JSON')
    .argument('<clave>', 'clave publica de configuracion')
    .action((key: string, options: { json?: boolean }) => {
      // Sin ensureInitialized: si la config quedo invalida, establecer o eliminar la clave es la forma de arreglarla.
      const service = new ConfigService();

      try {
        const config = service.unsetValue(key);
        const paths = service.resolvePaths(config);
        printConfigResult(formatConfigAsText(config, paths), formatConfig(config, paths), options.json);
      } finally {
        service.close();
      }
    });
  configureSpanishHelp(eliminarCommand);
}
