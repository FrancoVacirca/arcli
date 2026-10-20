import { CERTIFICATE_GUIDE_URL } from '../lib/links';
import { ArcaContextResolver, type ResolvedArcaRuntime } from '../services/arca/arca-context.resolver';
import { certificateBanner, writeTerminalError } from '../ui';

import type { GlobalCliOptions } from './types';

type CertificateRuntime = Pick<ResolvedArcaRuntime, 'certificateExpiry' | 'outputJson'>;

/**
 * Aviso del certificado por vencer o vencido, al principio del comando. Va a stderr: con `--json` stdout queda
 * solo para el JSON. Vencido y con `--json` no se escribe: el error JSON de `CERTIFICATE_EXPIRED` (tambien en
 * stderr) ya lo dice, y un texto antes lo romperia.
 */
export function writeCertificateNotice(runtime: CertificateRuntime): void {
  const notice = runtime.certificateExpiry;

  if (!notice || (notice.expired && runtime.outputJson)) {
    return;
  }

  writeTerminalError(
    certificateBanner({ expired: notice.expired, guideUrl: CERTIFICATE_GUIDE_URL, summary: notice.summary }),
  );
}

/** Lo que se suma a `avisos` en el JSON de facturacion. En texto el aviso ya salio arriba: no se repite. */
export function certificateWarnings(runtime: CertificateRuntime): string[] {
  return runtime.outputJson && runtime.certificateExpiry ? [runtime.certificateExpiry.message] : [];
}

/** Config, credenciales y aviso del certificado: el paso comun de los comandos que van a ARCA. */
export function resolveArcaRuntime(options: GlobalCliOptions): ResolvedArcaRuntime {
  const runtime = new ArcaContextResolver({ options }).resolve();

  writeCertificateNotice(runtime);

  return runtime;
}
