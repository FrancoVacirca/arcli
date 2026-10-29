import Conf from 'conf';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { ConfigurationError } from '../../lib/errors/app-error';

import {
  ArcliConfig,
  arcliConfigSchema,
  CONFIG_DEFAULTS,
  ConfigPublicKey,
  configPublicKeySchema,
} from './config.schemas';
import { type CanonicalConfigKey, parseConfigValue } from './config-value-parser';

const CONFIG_KEY_ALIASES: Record<ConfigPublicKey, CanonicalConfigKey> = {
  alicuota: 'alicuotaPorDefecto',
  aliasCbu: 'aliasCbu',
  comprobantesPorLista: 'comprobantesPorLista',
  cbu: 'cbu',
  'cert.produccion': 'cert.produccion',
  'cert.testing': 'cert.testing',
  concepto: 'conceptoPorDefecto',
  cotizacion: 'cotizacionPorDefecto',
  cuit: 'cuit',
  'emisor.condicionIva': 'emisor.condicionIva',
  'emisor.domicilio': 'emisor.domicilio',
  'emisor.iibb': 'emisor.iibb',
  'emisor.inicioActividades': 'emisor.inicioActividades',
  'emisor.logo': 'emisor.logo',
  'emisor.razonSocial': 'emisor.razonSocial',
  entorno: 'entornoPorDefecto',
  emitir: 'output.emitirPorDefecto',
  ivaReceptor: 'ivaReceptorPorDefecto',
  json: 'output.jsonPorDefecto',
  'key.produccion': 'key.produccion',
  'key.testing': 'key.testing',
  moneda: 'monedaPorDefecto',
  bruto: 'output.brutoPorDefecto',
  pdf: 'pdf',
  pdfCarpeta: 'pdfCarpeta',
  pdfNavegador: 'pdfNavegador',
  puntoVenta: 'puntoVentaPorDefecto',
  ticketPath: 'ticketPath',
  verificarFce: 'verificarFce',
  consultarPadron: 'consultarPadron',
};

/** Valida un valor como lo haria `arcli config establecer`, sin guardarlo. Lanza un Error con el motivo. */
export function validateConfigValue(publicKey: ConfigPublicKey, rawValue: string): void {
  parseConfigValue(CONFIG_KEY_ALIASES[publicKey], rawValue);
}

export interface ConfigServiceOptions {
  readonly configName?: string;
  readonly cwd?: string;
  readonly projectName?: string;
}

function storeLocation(options: ConfigServiceOptions) {
  return {
    configName: options.configName ?? 'config',
    cwd: options.cwd,
    projectName: options.projectName ?? 'arcli',
    projectSuffix: '',
  };
}

/**
 * Ruta del config.json sin leerlo: `Conf` la calcula al construirse, pero tambien lee el archivo. Sin defaults y
 * con un deserializador que no parsea, no hay nada que escribir y el archivo queda como esta.
 */
function resolveStorePath(options: ConfigServiceOptions): string {
  return new Conf({ ...storeLocation(options), deserialize: () => ({}) }).path;
}

function invalidConfigFileError(path: string): ConfigurationError {
  return new ConfigurationError(
    'El archivo de configuración tiene JSON inválido y no se puede leer.',
    { path },
    'Corregilo a mano, o renombralo (por ejemplo, a config.json.bak) y volve a cargar los datos con `arcli config establecer` o desde "Configuracion" en `arcli`. ARCLI no lo borra ni lo pisa.',
  );
}

export class ConfigService {
  private readonly store: Conf<ArcliConfig>;

  public constructor(options: ConfigServiceOptions = {}) {
    try {
      this.store = new Conf<ArcliConfig>({
        ...storeLocation(options),
        clearInvalidConfig: false,
        defaults: CONFIG_DEFAULTS,
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw invalidConfigFileError(resolveStorePath(options));
      }

      throw error;
    }
  }

  public close(): void {
    this.store._closeWatcher();
  }

  public getConfig(): ArcliConfig {
    return arcliConfigSchema.parse(this.store.store);
  }

  public getPath(): string {
    return this.store.path;
  }

  public getDefaultTicketPath(): string {
    return join(dirname(this.store.path), 'tickets');
  }

  /** Carpeta donde se instala el plugin de PDF, junto a config.json. */
  public getPluginsPath(): string {
    return join(dirname(this.store.path), 'plugins');
  }

  public resolveTicketPath(config: ArcliConfig): string {
    return config.ticketPath ?? this.getDefaultTicketPath();
  }

  /** Absoluta por defecto, para que los PDFs no queden repartidos segun desde donde se ejecuta arcli. */
  public resolvePdfFolder(config: ArcliConfig): string {
    return config.pdfCarpeta ?? join(homedir(), 'arcli', 'comprobantes');
  }

  public resolvePaths(config: ArcliConfig): { readonly pdfFolder: string; readonly ticketPath: string } {
    return { pdfFolder: this.resolvePdfFolder(config), ticketPath: this.resolveTicketPath(config) };
  }

  public initialize(): ArcliConfig {
    const config = this.getConfig();
    this.store.store = config;

    return config;
  }

  public ensureInitialized(): ArcliConfig {
    return this.initialize();
  }

  public setValue(rawKey: string, rawValue: string): ArcliConfig {
    const key = this.resolveKey(rawKey);
    const canonicalKey = CONFIG_KEY_ALIASES[key];
    const parsedValue = parseConfigValue(canonicalKey, rawValue);

    return this.saveIfValid((draft) => setAtPath(draft, canonicalKey, parsedValue));
  }

  public unsetValue(rawKey: string): ArcliConfig {
    const key = this.resolveKey(rawKey);
    const canonicalKey = CONFIG_KEY_ALIASES[key];

    return this.saveIfValid((draft) => deleteAtPath(draft, canonicalKey));
  }

  /**
   * Aplica el cambio sobre una copia y la guarda solo si queda valida: un valor invalido no puede dejar el CLI
   * inutilizable. Una config que ya estaba rota se puede arreglar cambiando o borrando la clave que falla.
   */
  private saveIfValid(change: (draft: Record<string, unknown>) => void): ArcliConfig {
    const draft = structuredClone(this.store.store) as Record<string, unknown>;

    change(draft);

    const config = arcliConfigSchema.parse(draft);
    this.store.store = config;

    return config;
  }

  private resolveKey(rawKey: string): ConfigPublicKey {
    return configPublicKeySchema.parse(rawKey.trim());
  }
}

function setAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop() as string;
  let node = target;

  for (const key of keys) {
    const next = node[key];
    node = (next && typeof next === 'object' ? next : (node[key] = {})) as Record<string, unknown>;
  }

  node[last] = value;
}

function deleteAtPath(target: Record<string, unknown>, path: string): void {
  const keys = path.split('.');
  const last = keys.pop() as string;
  const parent = keys.reduce<unknown>(
    (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
    target,
  );

  if (parent && typeof parent === 'object') {
    delete (parent as Record<string, unknown>)[last];
  }
}
