import { formatArcaDateAsArgentineDate } from '../../lib/dates/arca-date';
import { maskPath } from '../../lib/paths/mask-path';
import { colorize, keyValuePanel, resolveKeyValueLabelWidth, statusPanel, toneText, UI_THEME } from '../../ui';
import { RECENT_VOUCHERS_LIMIT } from '../vouchers/voucher-history';

import type { ArcliConfig, ConfigPublicKey } from './config.schemas';
import { CONFIG_LABELS, CONFIG_SECTIONS } from './config.sections';
import type { ConfigDoctorReport } from './config-doctor';

interface PublicConfigSnapshot {
  readonly alicuota?: ArcliConfig['alicuotaPorDefecto'];
  readonly aliasCbu?: string;
  readonly comprobantesPorLista?: number;
  readonly cbu?: string;
  readonly cert: {
    readonly produccion?: string;
    readonly testing?: string;
  };
  readonly concepto?: ArcliConfig['conceptoPorDefecto'];
  readonly cotizacion?: number;
  readonly cuit?: string;
  readonly emisor: ArcliConfig['emisor'];
  readonly emitir: boolean;
  readonly entorno: 'produccion' | 'testing';
  readonly ivaReceptor?: ArcliConfig['ivaReceptorPorDefecto'];
  readonly json: boolean;
  readonly key: {
    readonly produccion?: string;
    readonly testing?: string;
  };
  readonly moneda?: string;
  readonly pdf: NonNullable<ArcliConfig['pdf']>;
  readonly pdfCarpeta: string;
  readonly pdfNavegador?: string;
  readonly puntoVenta?: number;
  readonly bruto: boolean;
  readonly ticketPath: string;
  readonly verificarFce?: boolean;
  readonly consultarPadron: boolean;
}

export interface ConfigPathSnapshot {
  readonly pdfFolder: string;
  readonly ticketPath: string;
}

function toPublicSnapshot(config: ArcliConfig, paths: ConfigPathSnapshot): PublicConfigSnapshot {
  return {
    alicuota: config.alicuotaPorDefecto,
    aliasCbu: config.aliasCbu,
    comprobantesPorLista: config.comprobantesPorLista,
    cbu: config.cbu,
    cert: {
      produccion: config.cert.produccion ? maskPath(config.cert.produccion) : undefined,
      testing: config.cert.testing ? maskPath(config.cert.testing) : undefined,
    },
    concepto: config.conceptoPorDefecto,
    cotizacion: config.cotizacionPorDefecto,
    cuit: config.cuit,
    emisor: { ...config.emisor, logo: config.emisor.logo ? maskPath(config.emisor.logo) : undefined },
    emitir: config.output.emitirPorDefecto,
    entorno: config.entornoPorDefecto,
    ivaReceptor: config.ivaReceptorPorDefecto,
    json: config.output.jsonPorDefecto,
    key: {
      produccion: config.key.produccion ? maskPath(config.key.produccion) : undefined,
      testing: config.key.testing ? maskPath(config.key.testing) : undefined,
    },
    moneda: config.monedaPorDefecto,
    pdf: config.pdf ?? 'preguntar',
    pdfCarpeta: maskPath(paths.pdfFolder),
    pdfNavegador: config.pdfNavegador ? maskPath(config.pdfNavegador) : undefined,
    puntoVenta: config.puntoVentaPorDefecto,
    bruto: config.output.brutoPorDefecto,
    ticketPath: maskPath(paths.ticketPath),
    verificarFce: config.verificarFce,
    consultarPadron: config.consultarPadron ?? true,
  };
}

export function formatConfig(config: ArcliConfig, paths: ConfigPathSnapshot): string {
  return JSON.stringify(toPublicSnapshot(config, paths), null, 2);
}

export function formatConfigPath(configPath: string): string {
  return configPath;
}

const NOT_SET = 'no configurado';

type PublicConfigValue = (config: PublicConfigSnapshot) => number | string;

const notSet = (value: number | string | undefined): number | string => value ?? NOT_SET;
const yesNo = (value: boolean | undefined): string => (value ? 'si' : 'no');

/** Como se muestra cada dato en `arcli config`. */
const CONFIG_TEXT_VALUES: Record<ConfigPublicKey, PublicConfigValue> = {
  alicuota: (c) => (c.alicuota ? `${c.alicuota}%` : '21% (por defecto)'),
  aliasCbu: (c) => notSet(c.aliasCbu),
  bruto: (c) => yesNo(c.bruto),
  cbu: (c) => notSet(c.cbu),
  'cert.produccion': (c) => notSet(c.cert.produccion),
  'cert.testing': (c) => notSet(c.cert.testing),
  comprobantesPorLista: (c) => c.comprobantesPorLista ?? `${RECENT_VOUCHERS_LIMIT} (por defecto)`,
  concepto: (c) => notSet(c.concepto),
  cotizacion: (c) => c.cotizacion ?? 1,
  cuit: (c) => notSet(c.cuit),
  'emisor.condicionIva': (c) => c.emisor.condicionIva ?? 'segun la letra',
  'emisor.domicilio': (c) => notSet(c.emisor.domicilio),
  'emisor.iibb': (c) => notSet(c.emisor.iibb),
  'emisor.inicioActividades': (c) =>
    c.emisor.inicioActividades ? formatArcaDateAsArgentineDate(c.emisor.inicioActividades) : NOT_SET,
  'emisor.logo': (c) => notSet(c.emisor.logo),
  'emisor.razonSocial': (c) => notSet(c.emisor.razonSocial),
  emitir: (c) => yesNo(c.emitir),
  entorno: (c) => c.entorno,
  ivaReceptor: (c) => notSet(c.ivaReceptor),
  json: (c) => yesNo(c.json),
  'key.produccion': (c) => notSet(c.key.produccion),
  'key.testing': (c) => notSet(c.key.testing),
  moneda: (c) => c.moneda ?? 'PES',
  pdf: (c) => c.pdf,
  pdfCarpeta: (c) => c.pdfCarpeta,
  pdfNavegador: (c) => c.pdfNavegador ?? 'automatico',
  puntoVenta: (c) => notSet(c.puntoVenta),
  ticketPath: (c) => c.ticketPath,
  verificarFce: (c) => yesNo(c.verificarFce),
  consultarPadron: (c) => yesNo(c.consultarPadron ?? true),
};

/**
 * La configuracion por secciones, en el mismo orden que "Modificar configuracion" del modo interactivo.
 * El peso esta en los valores: titulos en celeste, etiquetas y datos sin cargar atenuados.
 */
export function formatConfigAsText(config: ArcliConfig, paths: ConfigPathSnapshot): string {
  const safeConfig = toPublicSnapshot(config, paths);
  const sections = CONFIG_SECTIONS.map((section) => ({
    label: section.label,
    rows: section.keys.map((key) => [CONFIG_LABELS[key], String(CONFIG_TEXT_VALUES[key](safeConfig))] as const),
  }));
  // Un solo ancho de etiqueta para todas las secciones, asi los valores quedan en la misma columna.
  const labelWidth = resolveKeyValueLabelWidth(
    'standard',
    sections.flatMap((section) => section.rows),
    [35, 65],
  );
  const gap = ' '.repeat(UI_THEME.table.gap);
  const lines = sections.flatMap((section, index) => [
    ...(index > 0 ? [''] : []),
    colorize(section.label, 'info'),
    // Los datos van corridos bajo el titulo, asi la seccion se lee aun sin color (NO_COLOR, pipes).
    ...section.rows.map(
      ([label, value]) =>
        `  ${colorize(label.padEnd(labelWidth), 'muted')}${gap}${value === NOT_SET ? colorize(value, 'muted') : value}`,
    ),
  ]);

  return keyValuePanel('Configuracion', lines, undefined, 'standard', undefined, 'sheet');
}

export function formatConfigDoctor(report: ConfigDoctorReport): string {
  return JSON.stringify(
    {
      chequeos: report.checks.map((check) => ({
        categoria: check.category,
        detalle: check.detail,
        etiqueta: check.label,
      })),
      ok: report.ok,
    },
    null,
    2,
  );
}

export function formatConfigDoctorAsText(report: ConfigDoctorReport): string {
  const lines = report.checks.map((check) => {
    const icon =
      check.category === 'ok'
        ? toneText('✓', 'success')
        : check.category === 'warning'
          ? toneText('!', 'warning')
          : toneText('x', 'danger');

    return `${icon} ${check.label}: ${check.detail}`;
  });
  const tone = report.ok ? 'success' : report.checks.some((check) => check.category === 'error') ? 'danger' : 'warning';
  const footer = report.ok
    ? 'Configuracion lista para usar ARCLI'
    : report.checks.some((check) => check.category === 'error')
      ? 'Hay puntos criticos por corregir antes de emitir'
      : 'Revise las recomendaciones antes de emitir en serio';

  return statusPanel('Revision de configuracion', lines, footer, 'wide', tone, 'checklist');
}
