import { X509Certificate } from 'node:crypto';

import { diffArcaDatesInDays, formatDateAsArcaDate } from '../dates/arca-date';

export interface CertificateExpiry {
  /** Dias calendario en Argentina hasta el vencimiento: 0 si vence hoy, negativo si ya vencio. */
  readonly daysRemaining: number;
  readonly expiresAt: Date;
  readonly isExpired: boolean;
}

/** Vencido desde el instante exacto de `notAfter`; los dias se cuentan en fechas argentinas, no en horas. */
export function computeCertificateExpiry(expiresAt: Date, now: Date = new Date()): CertificateExpiry {
  return {
    daysRemaining: diffArcaDatesInDays(formatDateAsArcaDate(now), formatDateAsArcaDate(expiresAt)),
    expiresAt,
    isExpired: expiresAt.getTime() <= now.getTime(),
  };
}

/** Lee la fecha de vencimiento del PEM. Es local, sin red; tira si el contenido no es un certificado X.509. */
export function readCertificateExpiry(pemContent: string, now: Date = new Date()): CertificateExpiry {
  const certificate = new X509Certificate(pemContent);

  return computeCertificateExpiry(new Date(certificate.validTo), now);
}

export function isCertificateExpiringSoon(expiry: CertificateExpiry, thresholdDays: number): boolean {
  return !expiry.isExpired && expiry.daysRemaining <= thresholdDays;
}
