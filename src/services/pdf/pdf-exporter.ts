import { mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { AppError } from '../../lib/errors/app-error';
import { writeNewFile } from '../../lib/files/write-new-file';
import type { BillingExecutionResult } from '../../modules/billing/billing.types.internal';
import type { ArcliConfig } from '../../modules/config/config.schemas';
import { PdfError } from '../../modules/pdf/pdf.errors';
import type { InvoicePdfOptions, PdfOutcome, PdfVoucherExtras } from '../../modules/pdf/pdf.types';
import { mapBillingResultToPdfData } from '../../modules/pdf/pdf-data.mapper';
import { buildPdfFileName } from '../../modules/pdf/pdf-file-name';
import { resolvePdfIssuer } from '../../modules/pdf/pdf-issuer';

import { escapeHtmlStrings } from './escape-html';
import type { PdfRenderer } from './pdf-plugin';

export const TESTING_FOOTER = 'COMPROBANTE DE PRUEBA - SIN VALIDEZ FISCAL';

export function toPdfFailure(error: unknown): Extract<PdfOutcome, { error: unknown }> {
  if (error instanceof PdfError) {
    return { error: { code: error.code, message: error.message, suggestion: error.suggestion } };
  }

  if (error instanceof AppError) {
    return { error: { code: error.code, message: error.message } };
  }

  return {
    error: { code: 'PDF_GENERATION_ERROR', message: error instanceof Error ? error.message : String(error) },
  };
}

function readLogoAsDataUrl(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }

  const mime = extname(path).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';

  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

/**
 * Una subcarpeta por CUIT emisor, para que dos emisores con el mismo punto de venta y numero no se pisen. Los de
 * testing van ademas a `testing/` y con un pie que avisa que no valen, para no mezclarlos con los reales.
 */
export function resolvePdfTargetFolder(
  folder: string,
  environment: BillingExecutionResult['environment'],
  cuit: string,
): string {
  return environment === 'testing' ? join(folder, 'testing', cuit) : join(folder, cuit);
}

export interface ExportPdfInput {
  readonly config: Pick<ArcliConfig, 'cuit' | 'emisor'>;
  readonly extras?: PdfVoucherExtras;
  readonly folder: string;
  readonly renderer: PdfRenderer;
  readonly result: BillingExecutionResult;
}

/** Genera y guarda el PDF de un comprobante emitido, sin pisar uno existente. Devuelve la ruta del archivo. */
export async function exportBillingPdf(input: ExportPdfInput): Promise<string> {
  const { result } = input;
  const issuer = resolvePdfIssuer(input.config, result.voucherKind.letter);
  const data = mapBillingResultToPdfData(result, issuer, input.extras);
  const options: InvoicePdfOptions = {
    footerText: result.environment === 'testing' ? TESTING_FOOTER : undefined,
    logo: readLogoAsDataUrl(input.config.emisor.logo),
  };
  const bytes = await input.renderer.render(escapeHtmlStrings(data), options);
  const folder = resolvePdfTargetFolder(input.folder, result.environment, issuer.cuit);

  mkdirSync(folder, { recursive: true });

  return writeNewFile(join(folder, buildPdfFileName(result.voucherKind, data.puntoVenta, data.cbteDesde)), bytes);
}
