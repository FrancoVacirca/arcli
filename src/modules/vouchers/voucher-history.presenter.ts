import { formatArcaDateAsArgentineDate } from '../../lib/dates/arca-date';
import { keyValuePanel, noticePanel, renderKeyValueRows, resolveKeyValueLabelWidth } from '../../ui';
import { formatConceptLabel, formatCurrencyLabel, formatMoneyLabel } from '../billing/billing.labels';
import type { VoucherKindDefinition } from '../billing/billing.types';

import type { IssuedVoucher } from './voucher-history';

export interface VoucherListReport {
  readonly environment: 'produccion' | 'testing';
  readonly pointOfSale: number;
  readonly voucherKind: VoucherKindDefinition;
  readonly vouchers: readonly IssuedVoucher[];
}

export interface VoucherDetailReport {
  readonly environment: 'produccion' | 'testing';
  readonly pointOfSale: number;
  readonly voucher: IssuedVoucher;
  readonly voucherKind: VoucherKindDefinition;
}

const DOCUMENT_LABELS: Record<number, string> = {
  80: 'CUIT',
  86: 'CUIL',
  96: 'DNI',
};

export function formatVoucherNumber(pointOfSale: number, number: number): string {
  return `${String(pointOfSale).padStart(5, '0')}-${String(number).padStart(8, '0')}`;
}

export function formatReceiver(voucher: IssuedVoucher): string {
  if (voucher.documentTypeCode === 99) {
    return 'Consumidor final';
  }

  const label = DOCUMENT_LABELS[voucher.documentTypeCode] ?? `Doc ${voucher.documentTypeCode}`;

  return `${label} ${voucher.documentNumber}`;
}

/** Titulo del listado de ultimos comprobantes, tambien usado por el selector del modo interactivo. */
export function formatVoucherListTitle(report: Omit<VoucherListReport, 'vouchers'>): string {
  return `Últimas ${report.voucherKind.displayName} · PV ${report.pointOfSale} · ${report.environment}`;
}

/** Una fila del listado: numero, fecha, receptor, total y CAE, en columnas alineadas. */
export function formatVoucherListRow(pointOfSale: number, voucher: IssuedVoucher): string {
  return [
    formatVoucherNumber(pointOfSale, voucher.number),
    formatArcaDateAsArgentineDate(voucher.date),
    formatReceiver(voucher).padEnd(20),
    formatMoneyLabel(voucher.total).padStart(16),
    voucher.cae ? `CAE ${voucher.cae}` : '',
  ]
    .join('  ')
    .trimEnd();
}

/**
 * Reparte `extra` espacios entre los separadores, a los dos lados del simbolo: ` · ` pasa a `  ·  `, y asi.
 * Los primeros se llevan el sobrante de la division.
 */
function widenSeparators(separator: string, count: number, extra: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const spaces = Math.floor(extra / count) + (index < extra % count ? 1 : 0);
    const left = Math.floor(spaces / 2);

    return `${' '.repeat(left)}${separator}${' '.repeat(spaces - left)}`;
  });
}

/**
 * Filas para elegir un comprobante: cada columna mide lo justo para el dato mas largo de la lista y las separa
 * `separator`. Con `width`, los separadores se agrandan para que las filas ocupen ese ancho, si entran.
 */
export function formatVoucherPickerRows(
  pointOfSale: number,
  vouchers: readonly IssuedVoucher[],
  separator: string,
  width?: number,
): string[] {
  const columns = vouchers.map((voucher) => ({
    cae: voucher.cae ? `CAE ${voucher.cae}` : '',
    date: formatArcaDateAsArgentineDate(voucher.date),
    number: formatVoucherNumber(pointOfSale, voucher.number),
    receiver: formatReceiver(voucher),
    total: formatMoneyLabel(voucher.total),
  }));
  const receiverWidth = Math.max(0, ...columns.map((column) => column.receiver.length));
  const totalWidth = Math.max(0, ...columns.map((column) => column.total.length));
  const cells = columns.map((column) =>
    [
      column.number,
      column.date,
      column.receiver.padEnd(receiverWidth),
      column.total.padStart(totalWidth),
      column.cae,
    ].filter(Boolean),
  );
  const natural = Math.max(0, ...cells.map((row) => row.join(separator).length));
  const gaps = Math.max(0, ...cells.map((row) => row.length - 1));
  const extra = width === undefined || gaps === 0 ? 0 : Math.max(0, width - natural);
  const separators = widenSeparators(separator, gaps, extra);

  return cells.map((row) =>
    row.map((cell, index) => (index === 0 ? cell : `${separators[index - 1]}${cell}`)).join(''),
  );
}

export function formatVoucherListAsText(report: VoucherListReport): string {
  const { pointOfSale, voucherKind, vouchers } = report;

  if (vouchers.length === 0) {
    return noticePanel(`No hay ${voucherKind.displayName} emitidas en el punto de venta ${pointOfSale}.`, 'muted');
  }

  return keyValuePanel(
    formatVoucherListTitle(report),
    vouchers.map((voucher) => formatVoucherListRow(pointOfSale, voucher)),
    undefined,
    'wide',
    undefined,
    'listing',
  );
}

function serializeVoucher(voucher: IssuedVoucher): Record<string, unknown> {
  return {
    cae: voucher.cae ?? null,
    caeVencimiento: voucher.caeExpiration ?? null,
    concepto: voucher.concept ?? null,
    cotizacion: voucher.exchangeRate ?? null,
    fecha: voucher.date,
    importes: {
      exento: voucher.exemptAmount ?? 0,
      iva: voucher.ivaAmount,
      neto: voucher.netAmount,
      noGravado: voucher.untaxedAmount ?? 0,
      total: voucher.total,
      tributos: voucher.taxesAmount ?? 0,
    },
    moneda: voucher.currency ?? null,
    numero: voucher.number,
    numeroDocumento: voucher.documentNumber,
    resultado: voucher.result ?? null,
    tipoDocumento: voucher.documentTypeCode,
  };
}

function serializeVoucherKind(voucherKind: VoucherKindDefinition): Record<string, unknown> {
  return { atajo: voucherKind.shortcut, comprobante: voucherKind.displayName, tipoArca: voucherKind.arcaType };
}

export function formatVoucherListAsJson(report: VoucherListReport): string {
  return JSON.stringify(
    {
      ...serializeVoucherKind(report.voucherKind),
      comprobantes: report.vouchers.map(serializeVoucher),
      entorno: report.environment,
      puntoVenta: report.pointOfSale,
    },
    null,
    2,
  );
}

export function formatVoucherDetailAsJson(report: VoucherDetailReport): string {
  return JSON.stringify(
    {
      ...serializeVoucherKind(report.voucherKind),
      ...serializeVoucher(report.voucher),
      entorno: report.environment,
      puntoVenta: report.pointOfSale,
    },
    null,
    2,
  );
}

export function formatVoucherDetailAsText(report: VoucherDetailReport): string {
  const { pointOfSale, voucher, voucherKind } = report;
  const rows: Array<readonly [string, string]> = [
    ['Número', formatVoucherNumber(pointOfSale, voucher.number)],
    ['Fecha', formatArcaDateAsArgentineDate(voucher.date)],
    ['Receptor', formatReceiver(voucher)],
    ['Concepto', formatConceptLabel(voucher.concept)],
    ['Moneda', formatCurrencyLabel(voucher.currency)],
  ];

  if (voucher.currency && voucher.currency !== 'PES') {
    rows.push(['Cotización', String(voucher.exchangeRate ?? 1)]);
  }

  rows.push(
    ['Importe neto', formatMoneyLabel(voucher.netAmount)],
    ['Importe IVA', formatMoneyLabel(voucher.ivaAmount)],
  );

  if (voucher.exemptAmount) rows.push(['Importe exento', formatMoneyLabel(voucher.exemptAmount)]);
  if (voucher.untaxedAmount) rows.push(['Importe no gravado', formatMoneyLabel(voucher.untaxedAmount)]);
  if (voucher.taxesAmount) rows.push(['Importe tributos', formatMoneyLabel(voucher.taxesAmount)]);

  rows.push(['Importe total', formatMoneyLabel(voucher.total)], ['CAE', voucher.cae ?? 'N/D']);

  if (voucher.caeExpiration) {
    rows.push(['Vencimiento CAE', formatArcaDateAsArgentineDate(voucher.caeExpiration)]);
  }

  return keyValuePanel(
    voucherKind.displayName,
    renderKeyValueRows(rows, { labelWidth: resolveKeyValueLabelWidth('ticket', rows) }),
    voucher.result === 'A' ? 'APROBADO' : voucher.result === 'R' ? 'RECHAZADO' : undefined,
    'ticket',
    voucher.result === 'R' ? 'danger' : 'success',
    'ticket',
  );
}
