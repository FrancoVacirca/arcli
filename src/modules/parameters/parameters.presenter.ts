import { formatArcaDateAsArgentineDate } from '../../lib/dates/arca-date';
import { POINT_OF_SALE_GUIDE_URL } from '../../lib/links';
import { keyValuePanel, noticePanel, renderKeyValueRows, resolveKeyValueLabelWidth } from '../../ui';

import {
  PARAMETER_TABLE_NAMES,
  PARAMETER_TABLES,
  type ParameterEntry,
  type ParameterTable,
  type Quotation,
} from './parameters';
import type { PointOfSaleCheck, StatusReport } from './status';

type Environment = 'produccion' | 'testing';

export function formatParameterTablesAsText(): string {
  const rows = PARAMETER_TABLE_NAMES.map((name) => [name, PARAMETER_TABLES[name]] as const);
  const allRows = [...rows, ['cotización <moneda>', 'Cotización oficial de ARCA, por ejemplo USD'] as const];

  return keyValuePanel(
    'Tablas de ARCA',
    renderKeyValueRows(allRows, { labelWidth: resolveKeyValueLabelWidth('standard', allRows, [30, 70]) }),
    'Uso: arcli parametros <tabla>',
    'standard',
    undefined,
    'sheet',
  );
}

export function formatParameterTablesAsJson(): string {
  return JSON.stringify(
    {
      tablas: [
        ...PARAMETER_TABLE_NAMES.map((name) => ({ descripcion: PARAMETER_TABLES[name], tabla: name })),
        { descripcion: 'Cotización oficial de ARCA', tabla: 'cotizacion' },
      ],
    },
    null,
    2,
  );
}

export function formatParameterEntriesAsText(
  table: ParameterTable,
  entries: readonly ParameterEntry[],
  environment: Environment,
): string {
  if (entries.length === 0) {
    const reason =
      table === 'puntos-venta' && environment === 'testing'
        ? 'En testing ARCA no informa puntos de venta: cualquier número sirve para probar.'
        : `ARCA no devolvió valores para ${PARAMETER_TABLES[table].toLowerCase()}.`;

    return noticePanel(reason, 'muted');
  }

  const idWidth = Math.max(...entries.map((entry) => entry.id.length));
  const rows = entries.map((entry) =>
    [entry.id.padStart(idWidth), entry.description, entry.detail ? `(${entry.detail})` : ''].filter(Boolean).join('  '),
  );

  return keyValuePanel(`${PARAMETER_TABLES[table]} · ${environment}`, rows, undefined, 'wide', undefined, 'listing');
}

export function formatParameterEntriesAsJson(
  table: ParameterTable,
  entries: readonly ParameterEntry[],
  environment: Environment,
): string {
  return JSON.stringify(
    {
      entorno: environment,
      tabla: table,
      valores: entries.map((entry) => ({
        descripcion: entry.description,
        detalle: entry.detail ?? null,
        id: entry.id,
        vigenteHasta: entry.validTo ?? null,
      })),
    },
    null,
    2,
  );
}

export function formatQuotationAsText(quotation: Quotation, environment: Environment): string {
  const rows = [
    ['Moneda', quotation.currency],
    ['Cotización', new Intl.NumberFormat('es-AR', { maximumFractionDigits: 6 }).format(quotation.rate)],
    ['Fecha', quotation.date ? formatArcaDateAsArgentineDate(quotation.date) : 'N/D'],
  ] as const;

  return keyValuePanel(
    `Cotización oficial · ${environment}`,
    renderKeyValueRows(rows, { labelWidth: resolveKeyValueLabelWidth('standard', rows, [30, 70]) }),
    undefined,
    'standard',
    undefined,
    'sheet',
  );
}

export function formatQuotationAsJson(quotation: Quotation, environment: Environment): string {
  return JSON.stringify(
    { cotizacion: quotation.rate, entorno: environment, fecha: quotation.date ?? null, moneda: quotation.currency },
    null,
    2,
  );
}

function describePointOfSale(check: PointOfSaleCheck, number: number | undefined): string {
  switch (check.kind) {
    case 'habilitado':
      return `${number} habilitado (${check.point.emissionType})`;
    case 'bloqueado':
      return `${number} bloqueado en ARCA`;
    case 'de-baja':
      return `${number} dado de baja`;
    case 'no-encontrado':
      return `${number} no está habilitado para web service en este CUIT`;
    case 'sin-datos':
      return `${number} (en testing ARCA no informa puntos de venta)`;
    case 'sin-configurar':
      return 'no configurado';
  }
}

export function formatStatusAsText(report: StatusReport): string {
  const rows = [
    ['Entorno', report.environment],
    ['Servidor de aplicación', report.servers.app],
    ['Base de datos', report.servers.db],
    ['Autenticacion', report.servers.auth],
    ['Tiempo de respuesta', `${report.latencyMs} ms`],
    ['Punto de venta', describePointOfSale(report.pointOfSale, report.pointOfSaleNumber)],
  ] as const;
  const footer = report.ready
    ? 'ARCA responde: se puede emitir'
    : report.pointOfSale.kind === 'sin-configurar'
      ? 'Configurá el punto de venta: arcli config establecer puntoVenta <numero>'
      : report.pointOfSale.kind === 'habilitado' || report.pointOfSale.kind === 'sin-datos'
        ? 'ARCA tiene problemas: esperá unos minutos y reintentá'
        : report.pointOfSale.kind === 'no-encontrado'
          ? `Revisá el punto de venta: arcli parametros puntos-venta. Los de "Factura en línea" no sirven; para crear uno para web service: ${POINT_OF_SALE_GUIDE_URL}`
          : 'Revisá el punto de venta: arcli parametros puntos-venta';

  return keyValuePanel(
    'Estado de ARCA',
    renderKeyValueRows(rows, { labelWidth: resolveKeyValueLabelWidth('standard', rows, [30, 70]) }),
    footer,
    'standard',
    report.ready ? 'success' : 'warning',
    'sheet',
  );
}

export function formatStatusAsJson(report: StatusReport): string {
  const point = 'point' in report.pointOfSale ? report.pointOfSale.point : undefined;

  return JSON.stringify(
    {
      entorno: report.environment,
      latenciaMs: report.latencyMs,
      listo: report.ready,
      puntoVenta: {
        estado: report.pointOfSale.kind,
        numero: report.pointOfSaleNumber ?? null,
        tipoEmision: point?.emissionType ?? null,
      },
      servidores: {
        aplicacion: report.servers.app,
        autenticacion: report.servers.auth,
        baseDeDatos: report.servers.db,
      },
    },
    null,
    2,
  );
}
