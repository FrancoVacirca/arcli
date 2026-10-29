import { maskPath } from '../../lib/paths/mask-path';
import type { PdfOutcome } from '../../modules/pdf/pdf.types';
import { errorPanel } from '../components/errorPanel';
import { keyValuePanel } from '../components/keyValuePanel';
import { noticePanel } from '../components/noticePanel';
import { renderKeyValueRows, resolveKeyValueLabelWidth } from '../primitives/renderKeyValue';

/** Texto que sigue al comprobante emitido: la ruta del PDF o por que no se genero. */
export function formatPdfOutcomeAsText(outcome: PdfOutcome, label?: string): string {
  const prefix = label ? `${label}: ` : '';

  if ('path' in outcome) {
    return noticePanel(`${prefix}PDF guardado en ${outcome.path}`, 'success');
  }

  const hint = ['El comprobante ya esta emitido: solo falto el PDF.', outcome.error.suggestion]
    .filter(Boolean)
    .join('\n');

  return errorPanel(`${prefix}PDF no generado`, outcome.error.message, [], hint);
}

export interface PdfPluginStatusView {
  readonly browser?: string;
  readonly browserSource?: 'config' | 'descargado' | 'entorno' | 'sistema';
  readonly installed: boolean;
  readonly installedVersion?: string;
  readonly path: string;
  readonly version: string;
}

const BROWSER_SOURCE_LABELS: Record<NonNullable<PdfPluginStatusView['browserSource']>, string> = {
  config: 'pdfNavegador (config)',
  descargado: 'descargado por arcli',
  entorno: 'PUPPETEER_EXECUTABLE_PATH',
  sistema: 'instalado en el sistema',
};

export function formatPdfPluginStatusAsJson(status: PdfPluginStatusView): string {
  return JSON.stringify(
    {
      instalado: status.installed,
      navegador: status.browser ?? null,
      origenNavegador: status.browserSource ?? null,
      ruta: status.path,
      version: status.version,
      versionInstalada: status.installedVersion ?? null,
    },
    null,
    2,
  );
}

export function formatPdfPluginStatusAsText(status: PdfPluginStatusView, title = 'Plugin de PDF'): string {
  const rows: Array<readonly [string, string]> = [
    ['Estado', status.installed ? 'instalado' : 'no instalado'],
    ['Versión', status.installedVersion ?? `no instalada (arcli usa la ${status.version})`],
    [
      'Navegador',
      status.browser ? `${status.browser} (${BROWSER_SOURCE_LABELS[status.browserSource ?? 'sistema']})` : 'ninguno',
    ],
    ['Carpeta', maskPath(status.path)],
  ];
  const footer = status.installed ? 'Listo para generar PDFs' : 'Instalelo con `arcli pdf instalar`';

  return keyValuePanel(
    title,
    renderKeyValueRows(rows, { labelWidth: resolveKeyValueLabelWidth('standard', rows, [25, 75]) }),
    footer,
    'standard',
    status.installed ? 'success' : 'warning',
    'sheet',
  );
}
