import { ZodError } from 'zod';

import { BILLING_JSON_KEY_BY_INTERNAL_KEY } from '../../modules/billing/billing.json-input';
import { errorPanel } from '../components/errorPanel';
import { renderJson } from '../primitives/renderJson';
import { bold } from '../primitives/text';

const ZOD_PATH_LABELS: Record<string, string> = {
  associatedPeriod: 'período asociado',
  associatedVoucher: 'comprobante asociado',
  billingDate: 'fecha del comprobante',
  cancellation: 'anulacion',
  cbu: 'CBU',
  cbuAlias: 'alias del CBU',
  concept: 'concepto',
  currencyCode: 'moneda',
  documentNumber: 'número de documento',
  documentType: 'tipo de documento',
  dueDay: 'día de vencimiento',
  exchangeRate: 'cotizacion',
  exemptAmount: 'importe exento',
  ivaRate: 'alícuota de IVA',
  ivaCondition: 'IVA receptor',
  paymentDueDate: 'vencimiento de pago',
  pointOfSale: 'punto de venta',
  sameCurrency: 'misma moneda',
  serviceEndDate: 'servicio hasta',
  serviceStartDate: 'servicio desde',
  totalAmount: 'monto',
  transferMode: 'modalidad de transferencia',
  untaxedAmount: 'importe no gravado',
};

function formatZodIssuePath(path: PropertyKey[]): string {
  if (path.length === 0) {
    return 'Entrada';
  }

  return path.map((segment) => String(segment)).join('.');
}

function humanizeZodIssue(issue: ZodError['issues'][number]): string {
  const pathKey = formatZodIssuePath(issue.path);
  const label = ZOD_PATH_LABELS[pathKey] ?? pathKey;

  if (issue.code === 'invalid_type' && issue.input === undefined) {
    return `Falta ${label}.`;
  }

  if (issue.code === 'too_small' && typeof issue.minimum === 'number') {
    if (pathKey === 'totalAmount') {
      return 'El monto debe ser mayor a 0.';
    }

    return `${label[0]?.toUpperCase() ?? ''}${label.slice(1)} debe ser mayor a ${issue.minimum}.`;
  }

  if (issue.code === 'invalid_value') {
    const allowedValues = issue.values.map((value) => String(value)).join(', ');

    return `${label[0]?.toUpperCase() ?? ''}${label.slice(1)} tiene un valor no soportado. Valores válidos: ${allowedValues}.`;
  }

  if (issue.code === 'invalid_type') {
    return `${label[0]?.toUpperCase() ?? ''}${label.slice(1)} tiene un formato inválido.`;
  }

  return issue.message;
}

function formatPublicIssuePath(path: PropertyKey[]): string[] {
  const pathKey = formatZodIssuePath(path);

  // La clave del JSON sale del esquema de `--cargar`, la misma que se documenta.
  const publicKey = BILLING_JSON_KEY_BY_INTERNAL_KEY[pathKey];

  return publicKey ? [publicKey] : path.map((segment) => String(segment));
}

/** Resumen de una linea, para listar errores por item (por ejemplo, en un lote). */
export function summarizeZodError(error: ZodError): string {
  return error.issues.map((issue) => humanizeZodIssue(issue)).join(' ');
}

export function formatZodError(error: ZodError, useJson: boolean): string {
  if (useJson) {
    return renderJson({
      codigo: 'INPUT_VALIDATION_ERROR',
      detalles: error.issues.map((issue) => ({
        mensaje: humanizeZodIssue(issue),
        ruta: formatPublicIssuePath(issue.path),
      })),
      error: 'Hay parámetros inválidos o incompletos en la entrada.',
      sugerencia: null,
    });
  }

  const detailLines = error.issues.map((issue) => {
    const pathKey = formatZodIssuePath(issue.path);
    const label = ZOD_PATH_LABELS[pathKey] ?? pathKey;

    return `${bold(`${label}:`)} ${humanizeZodIssue(issue)}`;
  });

  return errorPanel(
    'Error de entrada',
    'Hay parámetros inválidos o incompletos en la entrada.',
    detailLines,
    'Revisá los parámetros del comando con `ayuda` e intentá nuevamente.',
  );
}
