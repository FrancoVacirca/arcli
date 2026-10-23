import { CERTIFICATE_GUIDE_URL } from '../lib/links';
import type { CertificateExpiryNotice } from '../modules/config/certificate-expiry';
import { ArcaContextResolver, type ResolvedArcaRuntime } from '../services/arca/arca-context.resolver';
import { certificateBanner, writeTerminalNotice } from '../ui';

import type { GlobalCliOptions } from './types';

type CertificateRuntime = Pick<ResolvedArcaRuntime, 'certificateExpiry' | 'certificateNotices' | 'outputJson'>;

/**
 * Un solo recuadro con todos los certificados por vencer o vencidos, una linea por entorno y el link una vez. En
 * rojo si alguno vencio. Lo usan los comandos y el modo interactivo.
 */
export function renderCertificateNotices(notices: readonly CertificateExpiryNotice[]): string | undefined {
  if (notices.length === 0) {
    return undefined;
  }

  return certificateBanner({
    expired: notices.some((notice) => notice.expired),
    guideUrl: CERTIFICATE_GUIDE_URL,
    summary: notices.map((notice) => notice.summary).join('\n'),
  });
}

/**
 * Aviso de los certificados por vencer o vencidos, de cualquier entorno, al principio del comando. Va a stderr:
 * con `--json` stdout queda solo para el JSON. Si vencio el del entorno activo y hay `--json`, no se escribe: el
 * error JSON de `CERTIFICATE_EXPIRED` (tambien en stderr) ya lo dice, y un texto antes lo romperia.
 */
export function writeCertificateNotice(runtime: CertificateRuntime): void {
  if (runtime.certificateExpiry?.expired && runtime.outputJson) {
    return;
  }

  const banner = renderCertificateNotices(runtime.certificateNotices);

  if (banner) {
    writeTerminalNotice(banner);
  }
}

/** Lo que se suma a `avisos` en el JSON de facturacion. En texto el aviso ya salio arriba: no se repite. */
export function certificateWarnings(runtime: CertificateRuntime): string[] {
  return runtime.outputJson ? runtime.certificateNotices.map((notice) => notice.message) : [];
}

/** Config, credenciales y aviso del certificado: el paso comun de los comandos que van a ARCA. */
export function resolveArcaRuntime(options: GlobalCliOptions): ResolvedArcaRuntime {
  const runtime = new ArcaContextResolver({ options }).resolve();

  writeCertificateNotice(runtime);

  return runtime;
}
