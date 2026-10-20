import { Command } from 'commander';

import type { ArcliConfig, ArcliEnvironment } from '../../modules/config/config.schemas';
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

const ENVIRONMENTS: readonly ArcliEnvironment[] = ['testing', 'produccion'];

/** Valida el entorno por defecto y cualquier otro que tenga cert o key cargados: `revisar` cubre los dos. */
export function buildRuntimeChecks(config: ArcliConfig): ConfigDoctorRuntimeCheck[] {
  return ENVIRONMENTS.filter(
    (environment) =>
      environment === config.entornoPorDefecto || Boolean(config.cert[environment] || config.key[environment]),
  ).map((environment) => {
    try {
      new ArcaContextResolver({ options: { [environment]: true } }).validate();

      return { environment };
    } catch (error) {
      return {
        environment,
        error: error instanceof Error ? error.message : 'No se pudo completar la validacion.',
      };
    }
  });
}

/**
 * `--json` o, sin el flag, `json=true` de la config, como el resto de los comandos. La opcion la parsea el
 * programa: hay que leerla con `optsWithGlobals`.
 */
function wantsJson(command: Command, config: ArcliConfig): boolean {
  return command.optsWithGlobals<{ json?: boolean }>().json ?? config.output.jsonPorDefecto;
}

export function registerConfigCommand(program: Command): void {
  const configCommand = program
    .command('config')
    .description('guardar defaults, credenciales y revisar si el CLI esta listo para emitir');

  configureSpanishHelp(configCommand);

  configCommand.option('--json', 'imprimir salida JSON').action((_options: unknown, command: Command) => {
    const service = createConfigService();

    try {
      const config = service.getConfig();
      const paths = service.resolvePaths(config);
      printConfigResult(formatConfigAsText(config, paths), formatConfig(config, paths), wantsJson(command, config));
    } finally {
      service.close();
    }
  });

  configCommand.addHelpText('after', createConfigHelp());

  const revisarCommand = configCommand
    .command('revisar')
    .description('revisar configuracion, defaults, credenciales y validacion de cada entorno')
    .option('--json', 'imprimir salida JSON')
    .action((_options: unknown, command: Command) => {
      const service = createConfigService();
      let spinner: ReturnType<typeof startSpinner> = null;

      try {
        const config = service.getConfig();
        const useJson = wantsJson(command, config);
        spinner = useJson ? null : startSpinner('Generando revision...');
        const report = buildConfigDoctorReport(config, buildRuntimeChecks(config));
        spinner?.stop();
        printConfigResult(formatConfigDoctorAsText(report), formatConfigDoctor(report), useJson);
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
    .action((key: string, value: string, _options: unknown, command: Command) => {
      // Sin ensureInitialized: si la config quedo invalida, establecer o eliminar la clave es la forma de arreglarla.
      const service = new ConfigService();

      try {
        const config = service.setValue(key, value);
        const paths = service.resolvePaths(config);
        printConfigResult(formatConfigAsText(config, paths), formatConfig(config, paths), wantsJson(command, config));
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
    .action((key: string, _options: unknown, command: Command) => {
      // Sin ensureInitialized: si la config quedo invalida, establecer o eliminar la clave es la forma de arreglarla.
      const service = new ConfigService();

      try {
        const config = service.unsetValue(key);
        const paths = service.resolvePaths(config);
        printConfigResult(formatConfigAsText(config, paths), formatConfig(config, paths), wantsJson(command, config));
      } finally {
        service.close();
      }
    });
  configureSpanishHelp(eliminarCommand);
}
