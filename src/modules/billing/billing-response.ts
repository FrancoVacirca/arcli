import type { CreateVoucherResultDto } from '@arcasdk/core/lib/application/dto/electronic-billing';

import { POINT_OF_SALE_GUIDE_URL } from '../../lib/links';

import type { BillingResponseSummary } from './billing.types.internal';

/**
 * WSFEv1 10005: "El punto de venta informado debe estar dado de alta y ser del tipo RECE".
 * Es el rechazo de un punto de venta de "Factura en línea" (Comprobantes en linea).
 */
const POINT_OF_SALE_NOT_RECE_CODE = 10005;

export function createDryRunResponse(): BillingResponseSummary {
  return {
    cae: null,
    caeVencimiento: null,
    errors: [],
    events: [],
    observaciones: [],
    observacion: null,
    raw: null,
    resultado: null,
    suggestions: [],
    status: 'observado',
  };
}

export function mapBillingResponse(response: CreateVoucherResultDto): BillingResponseSummary {
  const detail = response.response?.FeDetResp?.FECAEDetResponse?.[0];
  const events = response.response?.Events?.Evt ?? [];
  const errors = response.response?.Errors?.Err ?? [];
  const observaciones =
    detail?.Observaciones?.Obs?.map((item) => item.Msg).filter((msg): msg is string => Boolean(msg)) ?? [];
  const resultado = detail?.Resultado ?? null;
  const suggestions = buildResponseSuggestions({
    errors,
    observaciones,
    resultado,
  });

  return {
    // El SDK devuelve "" en un rechazo; el JSON publico promete null.
    cae: response.cae || null,
    caeVencimiento: response.caeFchVto || null,
    errors,
    events,
    observaciones,
    observacion: observaciones.join(' | ') || null,
    raw: response,
    resultado,
    suggestions,
    status: resolveBillingStatus({
      errors,
      observaciones,
      resultado,
    }),
  };
}

function buildResponseSuggestions(options: {
  readonly errors: Array<{ readonly Code?: number; readonly Msg?: string } | unknown>;
  readonly observaciones: string[];
  readonly resultado: string | null;
}): string[] {
  const messages = [
    ...options.observaciones,
    ...options.errors
      .map((error) =>
        typeof error === 'object' && error && 'Msg' in error ? String((error as { Msg?: string }).Msg ?? '') : '',
      )
      .filter(Boolean),
  ].join(' | ');
  const codes = options.errors
    .map((error) =>
      typeof error === 'object' && error && 'Code' in error ? Number((error as { Code?: number }).Code) : NaN,
    )
    .filter((code) => Number.isInteger(code));
  const suggestions = new Set<string>();

  if (/transacci[oó]n activa/i.test(messages) || /error interno de base de datos/i.test(messages)) {
    suggestions.add('ARCA devolvió un error transitorio. Esperá unos segundos y volvé a intentar la emisión.');
  }

  if (/cuit receptora.*no existe/i.test(messages)) {
    suggestions.add('Revisá el CUIT del receptor o emití con un receptor válido del padrón para testing.');
  }

  if (/objeto IVA es obligatorio/i.test(messages)) {
    suggestions.add('Revisá IVA receptor y el calculo de IVA del comprobante antes de reintentar.');
  }

  if (codes.includes(POINT_OF_SALE_NOT_RECE_CODE) || /punto de venta.*tipo RECE/i.test(messages)) {
    suggestions.add(
      `El punto de venta no está habilitado para web service (los de "Factura en línea" no sirven). Revisá los habilitados con arcli parametros puntos-venta o creá uno para web service: ${POINT_OF_SALE_GUIDE_URL}`,
    );
  }

  if (options.resultado === 'R' && suggestions.size === 0) {
    suggestions.add('Revisá observaciones y errores de ARCA antes de volver a emitir.');
  }

  return [...suggestions];
}

function resolveBillingStatus(options: {
  readonly errors: unknown[];
  readonly observaciones: string[];
  readonly resultado: string | null;
}): BillingResponseSummary['status'] {
  if (options.resultado === 'R' || options.errors.length > 0) {
    return 'rechazado';
  }

  if (options.resultado === 'A' && options.observaciones.length === 0) {
    return 'aprobado';
  }

  return 'observado';
}
