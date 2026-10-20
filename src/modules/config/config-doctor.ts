import { CERTIFICATE_GUIDE_URL } from '../../lib/links';
import { isCertificateExpiringSoon, readCertificateExpiry } from '../../lib/security/certificate';
import { readPemFile } from '../../lib/security/pem';
import { listMissingIssuerKeys } from '../pdf/pdf-issuer';

import { CERTIFICATE_EXPIRY_WARNING_DAYS, formatCertificateExpiryDate } from './certificate-expiry';
import type { ArcliConfig, ArcliEnvironment } from './config.schemas';

export interface ConfigDoctorReport {
  readonly checks: ReadonlyArray<{
    readonly category: 'error' | 'ok' | 'warning';
    readonly detail: string;
    readonly label: string;
  }>;
  readonly ok: boolean;
}

/** Lo que valida `ArcaContextResolver` para un entorno: CUIT, certificado y clave legibles. */
export interface ConfigDoctorRuntimeCheck {
  readonly environment: ArcliEnvironment;
  /** Sin error, el entorno esta listo. */
  readonly error?: string;
}

function buildCertificateExpiryCheck(
  label: string,
  certPath: string | undefined,
): ConfigDoctorReport['checks'][number] | null {
  if (!certPath) {
    return null;
  }

  try {
    const pemContent = readPemFile(certPath, 'certificado');
    const expiry = readCertificateExpiry(pemContent);
    const formattedDate = formatCertificateExpiryDate(expiry.expiresAt);

    if (expiry.isExpired) {
      return { category: 'error', detail: `El certificado vencio el ${formattedDate}.`, label };
    }

    if (isCertificateExpiringSoon(expiry, CERTIFICATE_EXPIRY_WARNING_DAYS)) {
      return {
        category: 'warning',
        detail: `El certificado vence en ${expiry.daysRemaining} dias (${formattedDate}). Renuevelo pronto.`,
        label,
      };
    }

    return { category: 'ok', detail: `El certificado vence el ${formattedDate}.`, label };
  } catch (error) {
    return {
      category: 'warning',
      detail: `No se pudo verificar el vencimiento del certificado: ${error instanceof Error ? error.message : String(error)}`,
      label,
    };
  }
}

export function buildConfigDoctorReport(
  config: ArcliConfig,
  runtimeChecks: readonly ConfigDoctorRuntimeCheck[] = [],
): ConfigDoctorReport {
  const checks: Array<ConfigDoctorReport['checks'][number]> = [];

  const conditionalChecks: ReadonlyArray<{
    readonly label: string;
    readonly ok: unknown;
    readonly okDetail: string;
    readonly warningDetail: string;
  }> = [
    {
      label: 'CUIT',
      ok: config.cuit,
      okDetail: 'CUIT listo para emitir comprobantes.',
      warningDetail: 'Configure su CUIT con "arcli config establecer cuit <valor>".',
    },
    {
      label: 'Punto de venta',
      ok: config.puntoVentaPorDefecto,
      okDetail: `Punto de venta por defecto: ${config.puntoVentaPorDefecto}.`,
      warningDetail: 'Configure un punto de venta por defecto con "arcli config establecer puntoVenta <valor>".',
    },
    {
      label: 'Concepto',
      ok: config.conceptoPorDefecto,
      okDetail: `Concepto por defecto: ${config.conceptoPorDefecto}.`,
      warningDetail: 'Puede fijar un concepto por defecto con "arcli config establecer concepto servicios".',
    },
    {
      label: 'IVA receptor',
      ok: config.ivaReceptorPorDefecto,
      okDetail: `IVA receptor por defecto: ${config.ivaReceptorPorDefecto}.`,
      warningDetail:
        'Puede fijar un IVA receptor por defecto con "arcli config establecer ivaReceptor consumidor-final".',
    },
    {
      label: 'Credenciales testing',
      ok: config.cert.testing && config.key.testing,
      okDetail: 'Certificado y clave de testing configurados.',
      warningDetail: `Faltan credenciales de testing. Configure "cert.testing" y "key.testing" con "arcli config establecer". Si todavia no tiene certificado: ${CERTIFICATE_GUIDE_URL}`,
    },
    {
      label: 'Credenciales produccion',
      ok: config.cert.produccion && config.key.produccion,
      okDetail: 'Certificado y clave de produccion configurados.',
      warningDetail:
        'Todavia no hay credenciales de produccion configuradas. Puede cargarlas con "cert.produccion" y "key.produccion".',
    },
  ];

  for (const check of conditionalChecks) {
    checks.push(
      check.ok
        ? { category: 'ok', detail: check.okDetail, label: check.label }
        : { category: 'warning', detail: check.warningDetail, label: check.label },
    );
  }

  for (const [label, certPath] of [
    ['Vencimiento cert. testing', config.cert.testing],
    ['Vencimiento cert. produccion', config.cert.produccion],
  ] as const) {
    const certificateCheck = buildCertificateExpiryCheck(label, certPath);

    if (certificateCheck) {
      checks.push(certificateCheck);
    }
  }

  checks.push({
    category: 'ok',
    detail: `Entorno por defecto: ${config.entornoPorDefecto}.`,
    label: 'Entorno',
  });

  checks.push({
    category: 'ok',
    detail: `Emitir por defecto: ${config.output.emitirPorDefecto ? 'si' : 'no'}.`,
    label: 'Emision',
  });

  checks.push({
    category: 'ok',
    detail: `Salida JSON por defecto: ${config.output.jsonPorDefecto ? 'si' : 'no'}.`,
    label: 'JSON',
  });

  checks.push({
    category: 'ok',
    detail: `Respuesta bruta por defecto: ${config.output.brutoPorDefecto ? 'si' : 'no'}.`,
    label: 'Bruto',
  });

  // Solo se avisa si el PDF se genera siempre: con "preguntar" (por defecto) los datos se piden al generarlo.
  const missingIssuerKeys = listMissingIssuerKeys(config);

  if (missingIssuerKeys.length === 0) {
    checks.push({ category: 'ok', detail: 'Datos del emisor completos para el PDF.', label: 'PDF' });
  } else if (config.pdf === 'siempre') {
    checks.push({
      category: 'warning',
      detail: `Con pdf=siempre faltan datos del emisor: ${missingIssuerKeys.join(', ')}. Configurelos con "arcli config establecer".`,
      label: 'PDF',
    });
  }

  for (const runtimeCheck of runtimeChecks) {
    const label = `Validacion ${runtimeCheck.environment}`;

    checks.push(
      runtimeCheck.error
        ? { category: 'error', detail: runtimeCheck.error, label }
        : { category: 'ok', detail: `Configuracion valida para ${runtimeCheck.environment}.`, label },
    );
  }

  return {
    checks,
    ok: checks.every((check) => check.category === 'ok'),
  };
}
