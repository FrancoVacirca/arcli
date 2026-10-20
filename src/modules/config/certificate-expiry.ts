import { formatArcaDateAsArgentineDate, formatDateAsArcaDate } from '../../lib/dates/arca-date';
import { AppError } from '../../lib/errors/app-error';
import { CERTIFICATE_GUIDE_URL } from '../../lib/links';
import {
  type CertificateExpiry,
  isCertificateExpiringSoon,
  readCertificateExpiry,
} from '../../lib/security/certificate';

import type { ArcliEnvironment } from './config.schemas';

/** A menos de estos dias de vencer, el certificado se avisa en cada comando y en `config revisar`. */
export const CERTIFICATE_EXPIRY_WARNING_DAYS = 30;

/** Aviso de un certificado por vencer o vencido. Sin aviso, el certificado esta lejos de vencer (o no se pudo leer). */
export interface CertificateExpiryNotice {
  readonly daysRemaining: number;
  readonly environment: ArcliEnvironment;
  readonly expired: boolean;
  /** dd/mm/aaaa, en hora argentina. */
  readonly expiresOn: string;
  /** Una linea, con el link a la guia: va tal cual en `avisos` del JSON. */
  readonly message: string;
  /** El aviso sin el link, para el banner (que muestra el link en su propia linea). */
  readonly summary: string;
}

/** Fecha de vencimiento como dd/mm/aaaa del dia en Argentina. */
export function formatCertificateExpiryDate(expiresAt: Date): string {
  return formatArcaDateAsArgentineDate(formatDateAsArcaDate(expiresAt));
}

function formatDaysRemaining(days: number): string {
  if (days <= 0) {
    return 'hoy';
  }

  return days === 1 ? 'en 1 día' : `en ${days} días`;
}

export function describeCertificateExpiry(
  expiry: CertificateExpiry,
  environment: ArcliEnvironment,
): CertificateExpiryNotice | undefined {
  if (!expiry.isExpired && !isCertificateExpiringSoon(expiry, CERTIFICATE_EXPIRY_WARNING_DAYS)) {
    return undefined;
  }

  const expiresOn = formatCertificateExpiryDate(expiry.expiresAt);
  const status = expiry.isExpired
    ? `venció el ${expiresOn}`
    : `vence el ${expiresOn} (${formatDaysRemaining(expiry.daysRemaining)})`;

  const summary = `El certificado de ${environment} ${status}.`;

  return {
    daysRemaining: expiry.daysRemaining,
    environment,
    expired: expiry.isExpired,
    expiresOn,
    message: `${summary} Renovalo: ${CERTIFICATE_GUIDE_URL}`,
    summary,
  };
}

/**
 * Aviso del certificado ya leido (PEM). Si no se puede leer la fecha, no hay aviso: el error de un certificado
 * invalido lo informa el flujo de siempre (WSAA o `config revisar`).
 */
export function inspectCertificateExpiry(
  pemContent: string,
  environment: ArcliEnvironment,
  now: Date = new Date(),
): CertificateExpiryNotice | undefined {
  try {
    return describeCertificateExpiry(readCertificateExpiry(pemContent, now), environment);
  } catch {
    return undefined;
  }
}

/** Con el certificado vencido WSAA rechaza el login: se corta antes, sin ir a ARCA. */
export class CertificateExpiredError extends AppError {
  public readonly notice: CertificateExpiryNotice;

  public constructor(notice: CertificateExpiryNotice) {
    super(`El certificado de ${notice.environment} venció el ${notice.expiresOn}: ARCA no lo acepta.`, {
      code: 'CERTIFICATE_EXPIRED',
      details: { entorno: notice.environment, vencimiento: notice.expiresOn },
      suggestion: `Generá uno nuevo siguiendo la guía y cargalo con "arcli config establecer cert.${notice.environment} <ruta>": ${CERTIFICATE_GUIDE_URL}`,
    });
    this.name = 'CertificateExpiredError';
    this.notice = notice;
  }
}
