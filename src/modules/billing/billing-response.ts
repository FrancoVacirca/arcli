import type { CreateVoucherResultDto } from '@arcasdk/core/lib/application/dto/electronic-billing';

import type { BillingResponseSummary } from './billing.types.internal';

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
  const suggestions = new Set<string>();

  if (/transacci[oó]n activa/i.test(messages) || /error interno de base de datos/i.test(messages)) {
    suggestions.add('ARCA devolvio un error transitorio. Espere unos segundos y vuelva a intentar la emision.');
  }

  if (/cuit receptora.*no existe/i.test(messages)) {
    suggestions.add('Revise el CUIT del receptor o emita con un receptor valido del padron para testing.');
  }

  if (/objeto IVA es obligatorio/i.test(messages)) {
    suggestions.add('Revise IVA receptor y el calculo de IVA del comprobante antes de reintentar.');
  }

  if (options.resultado === 'R' && suggestions.size === 0) {
    suggestions.add('Revise observaciones y errores de ARCA antes de volver a emitir.');
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
