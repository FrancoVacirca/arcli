import type { IIva } from '@arcasdk/core/lib/domain/types/voucher.types';

import {
  keyValuePanel,
  renderKeyValueRows,
  renderTable,
  resolveKeyValueLabelWidth,
  statusPanel,
  testingBanner,
  toneText,
} from '../../ui';
import { formatVoucherNumber } from '../vouchers/voucher-history.presenter';

import { resolveIvaRateLabel } from './billing.amounts';
import {
  formatConceptLabel,
  formatCurrencyLabel,
  formatDateLabel,
  formatDecimalLabel,
  formatDocumentTypeLabel,
  formatIvaConditionLabel,
  formatMoneyLabel,
  formatNumericLabel,
  formatTaxIdLabel,
} from './billing.labels';
import type { BillingExecutionResult } from './billing.types.internal';
import { getVoucherKindByArcaType } from './voucher-kind-map';

export function formatEnvironmentBanner(environment: BillingExecutionResult['environment'] | undefined): string[] {
  if (environment !== 'testing') {
    return [];
  }

  return [testingBanner()];
}

export function formatStatusBadge(result: BillingExecutionResult): {
  readonly label: string;
  readonly tone: 'danger' | 'success' | 'warning';
} {
  switch (result.response.status) {
    case 'aprobado':
      return { label: 'APROBADO', tone: 'success' };
    case 'rechazado':
      return { label: 'RECHAZADO', tone: 'danger' };
    default:
      return { label: 'OBSERVADO', tone: 'warning' };
  }
}

export function formatVoucherSummary(result: BillingExecutionResult): Record<string, unknown> {
  return {
    cae: result.response.cae,
    caeVencimiento: result.response.caeVencimiento,
    comprobante: result.voucherKind.displayName,
    errores: result.response.errors,
    estado: result.response.status,
    eventos: result.response.events,
    observaciones: result.response.observaciones,
    observacion: result.response.observacion,
    solicitud: result.payload,
    previsualizacion: result.dryRun,
    resultado: result.response.resultado,
    tipoArca: result.voucherKind.arcaType,
  };
}

const FCE_OPTIONAL_LABELS: Record<string, string> = {
  '22': 'Anulacion',
  '27': 'Transferencia',
  '2101': 'CBU',
  '2102': 'Alias CBU',
};

/** Una alicuota: su tasa. Varias: el desglose de neto e IVA de cada una. */
function formatIvaRows(iva: readonly IIva[]): Array<readonly [string, string]> {
  if (iva.length === 0) {
    return [];
  }

  const label = (aliquotId: number) => resolveIvaRateLabel(aliquotId) ?? String(aliquotId);

  if (iva.length === 1 && iva[0]) {
    return [['Alicuota IVA', label(iva[0].Id)]];
  }

  return iva.map(
    (item) =>
      [`IVA ${label(item.Id)}`, `${formatMoneyLabel(item.Importe)} sobre ${formatMoneyLabel(item.BaseImp)}`] as const,
  );
}

function formatFriendlyPayloadRows(result: BillingExecutionResult): Array<readonly [string, string]> {
  const payload = result.payload;
  const rows: Array<readonly [string, string]> = [
    ['Concepto', formatConceptLabel(payload.Concepto)],
    ['Punto de venta', formatNumericLabel(payload.PtoVta)],
    ['Fecha del comprobante', formatDateLabel(payload.CbteFch)],
    ['Tipo de documento', formatDocumentTypeLabel(payload.DocTipo)],
    [
      'Numero de documento',
      typeof payload.DocNro === 'number'
        ? payload.DocNro === 0
          ? 'Sin especificar'
          : payload.DocTipo === 80 || payload.DocTipo === 86
            ? formatTaxIdLabel(payload.DocNro)
            : formatNumericLabel(payload.DocNro)
        : 'No informado',
    ],
    ...(result.receiver?.name ? [['Receptor', result.receiver.name] as const] : []),
    [
      'IVA receptor',
      `${formatIvaConditionLabel(payload.CondicionIVAReceptorId)}${result.receiver?.ivaConditionFromPadron ? ' (padron)' : ''}`,
    ],
    ['Moneda', formatCurrencyLabel(payload.MonId)],
    ['Cotizacion', formatDecimalLabel(payload.MonCotiz)],
    ['Importe neto', formatMoneyLabel(payload.ImpNeto)],
    ['Importe IVA', formatMoneyLabel(payload.ImpIVA)],
    ...formatIvaRows(payload.Iva ?? []),
    ['Importe tributos', formatMoneyLabel(payload.ImpTrib)],
    ['Importe exento', formatMoneyLabel(payload.ImpOpEx)],
    ['Importe no gravado', formatMoneyLabel(payload.ImpTotConc)],
    ['Importe total', formatMoneyLabel(payload.ImpTotal)],
  ];

  if (payload.FchServDesde) {
    rows.push(['Servicio desde', formatDateLabel(payload.FchServDesde)]);
  }

  if (payload.FchServHasta) {
    rows.push(['Servicio hasta', formatDateLabel(payload.FchServHasta)]);
  }

  if (payload.FchVtoPago) {
    rows.push(['Vencimiento de pago', formatDateLabel(payload.FchVtoPago)]);
  }

  const associatedVoucher = payload.CbtesAsoc?.[0];

  if (associatedVoucher) {
    const associatedKind = getVoucherKindByArcaType(associatedVoucher.Tipo);

    rows.push(['Comprobante asociado', associatedKind ? associatedKind.displayName : String(associatedVoucher.Tipo)]);
    rows.push(['Punto de venta asociado', formatNumericLabel(associatedVoucher.PtoVta)]);
    rows.push(['Numero asociado', formatNumericLabel(associatedVoucher.Nro)]);
    rows.push(['CUIT asociado', formatTaxIdLabel(associatedVoucher.Cuit)]);

    if (associatedVoucher.CbteFch) {
      rows.push(['Fecha asociado', formatDateLabel(associatedVoucher.CbteFch)]);
    }
  }

  if (payload.PeriodoAsoc) {
    rows.push([
      'Periodo asociado',
      `${formatDateLabel(payload.PeriodoAsoc.FchDesde)} al ${formatDateLabel(payload.PeriodoAsoc.FchHasta)}`,
    ]);
  }

  for (const optional of payload.Opcionales ?? []) {
    const label = FCE_OPTIONAL_LABELS[optional.Id];

    if (label) {
      rows.push([label, optional.Id === '22' ? (optional.Valor === 'S' ? 'Si' : 'No') : optional.Valor]);
    }
  }

  return rows;
}

export function formatPayloadTable(result: BillingExecutionResult): string {
  const rows = formatFriendlyPayloadRows(result);

  return renderTable(rows, { labelWidth: resolveKeyValueLabelWidth('ticket', rows) }).trimEnd();
}

export function formatPayloadPreview(result: BillingExecutionResult): string {
  const payloadTable = formatPayloadTable(result);
  const footer = result.dryRun ? toneText('SIN EMITIR', 'warning') : undefined;

  return keyValuePanel(result.voucherKind.displayName, [payloadTable], footer, 'ticket', undefined, 'ticket');
}

export function formatResultPanel(
  result: BillingExecutionResult,
  status: { readonly label: string; readonly tone: 'danger' | 'success' | 'warning' },
): string {
  const summaryRows: Array<readonly [string, string | number]> = [
    ['CAE', result.response.cae ?? 'N/D'],
    ['Vencimiento CAE', formatDateLabel(result.response.caeVencimiento ?? undefined)],
    result.voucherNumber === undefined
      ? ['Punto de venta', result.payload.PtoVta]
      : ['Número', formatVoucherNumber(result.payload.PtoVta, result.voucherNumber)],
    ['Importe total', formatMoneyLabel(result.payload.ImpTotal)],
  ];
  const countRows: Array<readonly [string, string | number]> = [
    ['Observaciones', result.response.observaciones.length],
    ['Eventos', result.response.events.length],
    ['Errores', result.response.errors.length],
  ];
  const labelWidth = resolveKeyValueLabelWidth('ticket', [...summaryRows, ...countRows]);
  const rows = [
    ...renderKeyValueRows(summaryRows, { labelWidth }),
    '',
    ...renderKeyValueRows(countRows, { labelWidth }),
  ];
  const footer = toneText(status.label, status.tone);

  return statusPanel(result.voucherKind.displayName, rows, footer, 'ticket', status.tone, 'ticket');
}
