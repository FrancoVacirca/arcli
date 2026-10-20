import type { Command } from 'commander';

import type { ArcliConfig } from '../modules/config/config.schemas';
import { ConfigService } from '../modules/config/config.service';

import type { GlobalCliOptions } from './types';

/**
 * Las opciones globales las parsea el programa (commander no usa opciones posicionales), asi que estan en
 * cualquier comando. Cada comando declara solo las que usa: asi salen en su ayuda y, si se pasa otra, el aviso de
 * `ignored-global-options` avisa que no aplica.
 */
export function registerEnvironmentOptions(command: Command): Command {
  return command
    .option('--testing', 'usar entorno de testing en esta ejecucion')
    .option('--produccion', 'usar entorno de produccion en esta ejecucion');
}

export function registerJsonOption(command: Command): Command {
  return command.option('--json', 'imprimir salida JSON');
}

/** Solo facturacion muestra la respuesta bruta de ARCA. */
export function registerRawOption(command: Command): Command {
  return command.option('--bruto', 'mostrar la respuesta bruta de ARCA cuando exista');
}

/** Las cuatro: el programa (para que cualquier comando las acepte) y los comandos de facturacion. */
export function registerGlobalOptions(command: Command): Command {
  return registerRawOption(registerJsonOption(registerEnvironmentOptions(command)));
}

/** Entorno y salida: comandos que consultan ARCA pero no tienen respuesta bruta que mostrar. */
export function registerQueryOptions(command: Command): Command {
  return registerJsonOption(registerEnvironmentOptions(command));
}

export function getGlobalOptions(command: Command): GlobalCliOptions {
  return command.optsWithGlobals<GlobalCliOptions>();
}

type OutputConfig = Pick<ArcliConfig, 'output'>;

/** `json` de la config. Si la config no se puede leer, texto: el error de la config ya sale por su lado. */
export function readJsonDefault(): boolean {
  try {
    const service = new ConfigService();

    try {
      return service.getConfig().output.jsonPorDefecto;
    } finally {
      service.close();
    }
  } catch {
    return false;
  }
}

/**
 * La unica forma de decidir si un comando imprime JSON: `--json` o, sin el flag, `json=true` de la config. Sin
 * config a mano (comandos que no la necesitan), se lee al llamar.
 */
export function resolveOutputJson(command: Command, config?: OutputConfig): boolean {
  const flag = getGlobalOptions(command).json;

  if (typeof flag === 'boolean') {
    return flag;
  }

  return config ? config.output.jsonPorDefecto : readJsonDefault();
}
