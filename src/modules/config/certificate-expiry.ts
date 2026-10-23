import { readFileSync } from 'node:fs';

import { formatArcaDateAsArgentineDate, formatDateAsArcaDate } from '../../lib/dates/arca-date';
import { AppError } from '../../lib/errors/app-error';
import { CERTIFICATE_GUIDE_URL } from '../../lib/links';
import {
  type CertificateExpiry,
  isCertificateExpiringSoon,
  readCertificateExpiry,
} from '../../lib/security/certificate';

import { type ArcliEnvironment, arcliEnvironmentSchema } from './config.schemas';

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

export interface ConfiguredCertificatesOptions {
  readonly activeEnvironment: ArcliEnvironment;
  /** El PEM del entorno activo, si ya se leyo para el contexto: no se vuelve a leer el archivo. */
  readonly activePem?: string;
  readonly now?: Date;
}

/**
 * Avisos de todos los certificados configurados (testing y produccion), sin importar con cual se trabaja: quien
 * factura en testing tambien tiene que enterarse de que vence el de produccion. El del entorno activo va primero.
 * Un certificado sin configurar o que no se puede leer no avisa.
 */
export function inspectConfiguredCertificates(
  certPaths: Partial<Record<ArcliEnvironment, string>>,
  options: ConfiguredCertificatesOptions,
): CertificateExpiryNotice[] {
  const environments = arcliEnvironmentSchema.options.filter(
    (environment) => environment !== options.activeEnvironment,
  );
  const notices: CertificateExpiryNotice[] = [];

  for (const environment of [options.activeEnvironment, ...environments]) {
    const pem = environment === options.activeEnvironment ? options.activePem : undefined;
    const content = pem ?? readCertificateQuietly(certPaths[environment]);
    const notice = content === undefined ? undefined : inspectCertificateExpiry(content, environment, options.now);

    if (notice) {
      notices.push(notice);
    }
  }

  return notices;
}

function readCertificateQuietly(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }

  try {
    return readFileSync(filePath, 'utf8');
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
