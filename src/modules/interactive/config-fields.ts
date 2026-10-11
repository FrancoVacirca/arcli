import { formatArcaDateAsArgentineDate } from '../../lib/dates/arca-date';
import { formatArgentineAmountInput } from '../../lib/numbers/argentine-amount';
import { maskPath } from '../../lib/paths/mask-path';
import {
  type ArcliConfig,
  arcliDefaultConceptSchema,
  arcliDefaultIvaConditionSchema,
  arcliEnvironmentSchema,
  arcliPdfModeSchema,
  type ConfigPublicKey,
} from '../config/config.schemas';
import { CONFIG_LABELS } from '../config/config.sections';
import { MAX_RECENT_VOUCHERS, RECENT_VOUCHERS_LIMIT } from '../vouchers/voucher-history';

/** Un dato de la config que se puede cambiar desde el modo interactivo. */
export interface ConfigField {
  /** Valores posibles para elegir de una lista; sin esto se escribe. */
  readonly choices?: readonly string[];
  readonly hint?: string;
  readonly key: ConfigPublicKey;
  /** El mismo nombre que en `arcli config` (ver CONFIG_LABELS). */
  readonly label: string;
  /** Las rutas se muestran enmascaradas, igual que en `arcli config`. */
  readonly path?: boolean;
  readonly read: (config: ArcliConfig) => string | undefined;
}

const date = (value: string | undefined) => (value ? formatArcaDateAsArgentineDate(value) : undefined);

/**
 * Datos editables desde el asistente. El orden y las secciones salen de CONFIG_SECTIONS; emitir, json y bruto
 * no estan porque solo cambian el CLI con flags, no el asistente.
 */
const FIELD_DEFINITIONS: ReadonlyArray<Omit<ConfigField, 'label'>> = [
  { key: 'cuit', read: (c) => c.cuit, hint: '11 digitos' },
  {
    choices: arcliEnvironmentSchema.options,
    key: 'entorno',
    read: (c) => c.entornoPorDefecto,
  },
  {
    key: 'cert.testing',
    path: true,
    read: (c) => c.cert.testing,
  },
  {
    key: 'key.testing',
    path: true,
    read: (c) => c.key.testing,
  },
  {
    key: 'cert.produccion',
    path: true,
    read: (c) => c.cert.produccion,
  },
  {
    key: 'key.produccion',
    path: true,
    read: (c) => c.key.produccion,
  },
  {
    hint: 'numero',
    key: 'puntoVenta',
    read: (c) => c.puntoVentaPorDefecto?.toString(),
  },
  {
    choices: arcliDefaultConceptSchema.options,
    key: 'concepto',
    read: (c) => c.conceptoPorDefecto,
  },
  {
    choices: arcliDefaultIvaConditionSchema.options,
    key: 'ivaReceptor',
    read: (c) => c.ivaReceptorPorDefecto,
  },
  {
    choices: ['general', 'reducida', 'incrementada', 'cero', '5', '2.5'],
    key: 'alicuota',
    read: (c) => c.alicuotaPorDefecto,
  },
  {
    hint: `1 a ${MAX_RECENT_VOUCHERS}, por defecto ${RECENT_VOUCHERS_LIMIT}`,
    key: 'comprobantesPorLista',
    read: (c) => c.comprobantesPorLista?.toString(),
  },
  { hint: '22 digitos', key: 'cbu', read: (c) => c.cbu },
  { key: 'aliasCbu', read: (c) => c.aliasCbu },
  {
    choices: ['si', 'no'],
    key: 'verificarFce',
    read: (c) => (c.verificarFce === undefined ? undefined : c.verificarFce ? 'si' : 'no'),
  },
  {
    choices: arcliPdfModeSchema.options,
    key: 'pdf',
    read: (c) => c.pdf,
  },
  { key: 'pdfCarpeta', path: true, read: (c) => c.pdfCarpeta },
  { key: 'pdfNavegador', path: true, read: (c) => c.pdfNavegador },
  { key: 'emisor.razonSocial', read: (c) => c.emisor.razonSocial },
  { key: 'emisor.domicilio', read: (c) => c.emisor.domicilio },
  {
    hint: 'D/MM/YYYY',
    key: 'emisor.inicioActividades',
    read: (c) => date(c.emisor.inicioActividades),
  },
  { key: 'emisor.iibb', read: (c) => c.emisor.iibb },
  {
    choices: arcliDefaultIvaConditionSchema.options,
    key: 'emisor.condicionIva',
    read: (c) => c.emisor.condicionIva,
  },
  { key: 'emisor.logo', path: true, read: (c) => c.emisor.logo },
  {
    hint: 'codigo de moneda, por ejemplo PES o USD',
    key: 'moneda',
    read: (c) => c.monedaPorDefecto,
  },
  {
    hint: 'solo para moneda extranjera',
    key: 'cotizacion',
    read: (c) =>
      c.cotizacionPorDefecto === undefined ? undefined : formatArgentineAmountInput(c.cotizacionPorDefecto),
  },
  { key: 'ticketPath', path: true, read: (c) => c.ticketPath },
];

export const CONFIG_FIELDS: readonly ConfigField[] = FIELD_DEFINITIONS.map((field) => ({
  ...field,
  label: CONFIG_LABELS[field.key],
}));

export function getConfigField(key: ConfigPublicKey): ConfigField {
  const field = CONFIG_FIELDS.find((candidate) => candidate.key === key);

  if (!field) {
    throw new Error(`Campo de config desconocido: ${key}`);
  }

  return field;
}

/** Valor para mostrar al lado del nombre. */
export function describeConfigValue(field: ConfigField, config: ArcliConfig): string {
  const value = field.read(config);

  if (!value) {
    return 'sin configurar';
  }

  return field.path ? maskPath(value) : value;
}

/** Lo minimo para emitir: sin esto el modo interactivo no puede crear la sesion con ARCA. */
export const REQUIRED_SETUP_KEYS: readonly ConfigPublicKey[] = ['cuit', 'cert.testing', 'key.testing', 'puntoVenta'];

export function listMissingSetupKeys(config: ArcliConfig): ConfigPublicKey[] {
  return REQUIRED_SETUP_KEYS.filter((key) => !getConfigField(key).read(config));
}
