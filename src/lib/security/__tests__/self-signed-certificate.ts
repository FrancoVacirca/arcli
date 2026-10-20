import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporaryDirectories: string[] = [];

export interface SelfSignedCertificate {
  readonly certPath: string;
  readonly keyPath: string;
  readonly pem: string;
}

/** Certificado de prueba con openssl que vence en `days` dias desde ahora. Nunca usa certificados reales. */
export function createSelfSignedCertificate(days: number): SelfSignedCertificate {
  const directory = mkdtempSync(join(tmpdir(), 'arcli-certificate-test-'));

  temporaryDirectories.push(directory);

  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');

  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      String(days),
      '-nodes',
      '-subj',
      '/CN=arcli-test',
    ],
    { stdio: 'ignore' },
  );

  return { certPath, keyPath, pem: readFileSync(certPath, 'utf8') };
}

export function removeSelfSignedCertificates(): void {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
}
