import { AppError } from '../../lib/errors/app-error';

export type PdfErrorCode =
  'PDF_GENERATION_ERROR' | 'PDF_ISSUER_INCOMPLETE' | 'PDF_PLUGIN_INSTALL_ERROR' | 'PDF_PLUGIN_MISSING';

export class PdfError extends AppError {
  public constructor(
    code: PdfErrorCode,
    message: string,
    options: { readonly details?: Record<string, unknown>; readonly suggestion?: string } = {},
  ) {
    super(message, { code, details: options.details, suggestion: options.suggestion });
    this.name = 'PdfError';
  }
}

export const PDF_INSTALL_SUGGESTION = 'Instalelo con `arcli pdf instalar`.';
