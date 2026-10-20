import { ZodError } from 'zod';

import { AppError } from '../../lib/errors/app-error';
import { errorPanel } from '../components/errorPanel';
import { renderJson } from '../primitives/renderJson';
import { bold } from '../primitives/text';

import { formatZodError } from './errors.zod-presenter';

function formatErrorTitle(code: string): string {
  switch (code) {
    case 'CONFIGURATION_ERROR':
      return 'Error de configuracion';
    case 'CERTIFICATE_EXPIRED':
      return 'Certificado vencido';
    case 'INPUT_VALIDATION_ERROR':
      return 'Error de entrada';
    case 'BATCH_VALIDATION_ERROR':
      return 'Lote invalido';
    case 'BATCH_EMISSION_ERROR':
      return 'Lote interrumpido';
    case 'EMISSION_UNCERTAIN':
      return 'Emision sin confirmar';
    case 'PDF_GENERATION_ERROR':
    case 'PDF_ISSUER_INCOMPLETE':
    case 'PDF_PLUGIN_MISSING':
      return 'PDF no generado';
    case 'PDF_PLUGIN_INSTALL_ERROR':
      return 'Plugin de PDF no instalado';
    default:
      return 'Error';
  }
}

function formatErrorHint(error: AppError): string | null {
  if (error.suggestion) {
    return error.suggestion;
  }

  switch (error.code) {
    case 'CONFIGURATION_ERROR':
      return 'Revise la configuracion con `arcli config` o corra `arcli config revisar`.';
    case 'INPUT_VALIDATION_ERROR':
      return 'Revise los parametros del comando con `ayuda` e intente nuevamente.';
    case 'BATCH_VALIDATION_ERROR':
      return 'Corrija esos comprobantes en el archivo y vuelva a correr el lote completo.';
    case 'BATCH_EMISSION_ERROR':
      return 'Los comprobantes de arriba ya se emitieron: no los vuelva a cargar. Antes de reintentar el que fallo, verifique con `arcli ultimos` si se emitio; despues reintente los que quedaron sin procesar.';
    default:
      return null;
  }
}

function detectTransientError(message: string): {
  readonly sugerencia: string;
  readonly title: string;
} | null {
  if (message.includes('coe.alreadyAuthenticated')) {
    return {
      sugerencia:
        'WSAA informo que ya existe un TA valido para este servicio. Espere unos segundos y vuelva a intentar sin cambiar el payload.',
      title: 'Error transitorio WSAA',
    };
  }

  if (message.includes('Transacción Activa')) {
    return {
      sugerencia:
        'ARCA devolvio una transaccion activa. Espere unos segundos y reintente la emision antes de modificar datos del comprobante.',
      title: 'Error transitorio ARCA',
    };
  }

  return null;
}

function formatErrorDetails(details: Record<string, unknown> | undefined): string[] {
  if (!details) {
    return [];
  }

  // Arrays y objetos (por ejemplo, la lista de items de un lote) solo van en el JSON:
  // en texto se verian como "[object Object]" y ya estan en el mensaje.
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '' && typeof value !== 'object')
    .map(([key, value]) => {
      const label = key === 'path' ? 'Ruta' : key;

      return `${bold(`${label}:`)} ${String(value)}`;
    });
}

function formatErrorDetailsAsJson(details: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!details) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => [key === 'path' ? 'ruta' : key, value]),
  );
}

export function formatCliError(error: unknown, useJson: boolean): string {
  if (error instanceof ZodError) {
    return formatZodError(error, useJson);
  }

  if (error instanceof AppError) {
    if (useJson) {
      return renderJson({
        codigo: error.code,
        detalles: formatErrorDetailsAsJson(error.details),
        error: error.message,
        ...(error.suggestion ? { sugerencia: error.suggestion } : {}),
      });
    }

    const details = formatErrorDetails(error.details);
    const hint = formatErrorHint(error);
    return errorPanel(formatErrorTitle(error.code), error.message, details, hint ?? undefined);
  }

  const message = error instanceof Error ? error.message : 'Ocurrio un error inesperado.';
  const transientError = detectTransientError(message);

  if (useJson) {
    return renderJson({
      codigo: transientError ? 'TRANSIENT_ERROR' : 'UNEXPECTED_ERROR',
      detalles: null,
      error: message,
      sugerencia: transientError?.sugerencia ?? null,
    });
  }

  return errorPanel(
    transientError?.title ?? 'Error inesperado',
    message,
    [],
    transientError?.sugerencia ?? 'Si el problema persiste, revise la configuracion o reintente con mas contexto.',
  );
}
