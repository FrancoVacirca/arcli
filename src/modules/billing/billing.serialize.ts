import type { BillingExecutionResult } from './billing.types.internal';

interface BillingSerializeOptions {
  readonly raw?: boolean;
}

function formatRawResponse(
  result: BillingExecutionResult,
): Record<string, string> | NonNullable<BillingExecutionResult['response']['raw']> {
  if (result.response.raw) {
    return result.response.raw;
  }

  return {
    mensaje: 'Sin emision real. Use --emitir para obtener una respuesta de ARCA.',
  };
}

// Aditivo: la clave `pdf` solo aparece si se intento generar el PDF.
function formatPdfOutcome(result: BillingExecutionResult): Record<string, unknown> {
  if (!result.pdf) {
    return {};
  }

  if ('path' in result.pdf) {
    return { pdf: { ruta: result.pdf.path } };
  }

  const { code, message, suggestion } = result.pdf.error;

  return { pdf: { error: { codigo: code, mensaje: message, sugerencia: suggestion ?? null } } };
}

function formatVoucherSummary(result: BillingExecutionResult): Record<string, unknown> {
  return {
    atajo: result.voucherKind.shortcut,
    avisos: result.warnings ?? [],
    cae: result.response.cae,
    caeVencimiento: result.response.caeVencimiento,
    comprobante: result.voucherKind.displayName,
    errores: result.response.errors,
    estado: result.response.status,
    eventos: result.response.events,
    observaciones: result.response.observaciones,
    observacion: result.response.observacion,
    ...formatPdfOutcome(result),
    solicitud: result.payload,
    previsualizacion: result.dryRun,
    resultado: result.response.resultado,
    sugerencias: result.response.suggestions,
    tipoArca: result.voucherKind.arcaType,
  };
}

/** `--bruto` suma `respuesta` (la respuesta cruda de ARCA) al resumen de siempre; no le quita campos. */
export function serializeBillingResult(
  result: BillingExecutionResult,
  options: BillingSerializeOptions = {},
): Record<string, unknown> {
  const summary = formatVoucherSummary(result);

  if (!options.raw) {
    return summary;
  }

  return { ...summary, respuesta: formatRawResponse(result) };
}

export function serializeBillingBatch(
  results: BillingExecutionResult[],
  options: BillingSerializeOptions = {},
): Array<Record<string, unknown>> {
  return results.map((result, index) => ({
    atajo: result.voucherKind.shortcut,
    indice: index + 1,
    comprobante: result.voucherKind.displayName,
    ...serializeBillingResult(result, options),
  }));
}

export function formatRawBillingResponse(
  result: BillingExecutionResult,
): Record<string, string> | NonNullable<BillingExecutionResult['response']['raw']> {
  return formatRawResponse(result);
}
