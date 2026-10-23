import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CERTIFICATE_GUIDE_URL } from '../../lib/links';
import type { CertificateExpiryNotice } from '../../modules/config/certificate-expiry';
import type { ResolvedArcaRuntime } from '../../services/arca/arca-context.resolver';
import { stripAnsi } from '../../ui';
import { certificateWarnings, resolveArcaRuntime, writeCertificateNotice } from '../arca-runtime';

const resolvedRuntime = vi.hoisted(() => ({ current: {} as Partial<ResolvedArcaRuntime> }));

vi.mock('../../services/arca/arca-context.resolver', () => ({
  ArcaContextResolver: class {
    public resolve() {
      return resolvedRuntime.current;
    }
  },
}));

function notice(expired: boolean, environment: 'produccion' | 'testing' = 'produccion'): CertificateExpiryNotice {
  const summary = expired
    ? `El certificado de ${environment} venció el 20/11/2026.`
    : `El certificado de ${environment} vence el 20/11/2026 (en 10 días).`;

  return {
    daysRemaining: expired ? -1 : 10,
    environment,
    expired,
    expiresOn: '20/11/2026',
    message: `${summary} Renovalo: ${CERTIFICATE_GUIDE_URL}`,
    summary,
  };
}

/** El runtime con el aviso del entorno activo (si lo hay) y los de todos los certificados configurados. */
function withNotices(
  outputJson: boolean,
  notices: CertificateExpiryNotice[],
  active?: CertificateExpiryNotice,
): Pick<ResolvedArcaRuntime, 'certificateExpiry' | 'certificateNotices' | 'outputJson'> {
  return { certificateExpiry: active, certificateNotices: notices, outputJson };
}

describe('certificate notice in commands', () => {
  let stdout = '';
  let stderr = '';

  beforeEach(() => {
    stdout = '';
    stderr = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the banner to stderr when resolving the ARCA runtime', () => {
    resolvedRuntime.current = withNotices(false, [notice(false)], notice(false));

    expect(resolveArcaRuntime({})).toBe(resolvedRuntime.current);
    expect(stdout).toBe('');
    expect(stripAnsi(stderr)).toContain('El certificado de produccion vence el 20/11/2026 (en 10 días).');
    expect(stripAnsi(stderr)).toContain(`Renovalo: ${CERTIFICATE_GUIDE_URL}`);
  });

  it('leaves a single blank line before the command output, which brings its own', () => {
    writeCertificateNotice(withNotices(false, [notice(false)]));

    expect(stderr.startsWith('\n')).toBe(true);
    expect(stderr.endsWith('\n')).toBe(true);
    expect(stderr.endsWith('\n\n')).toBe(false);
  });

  it('warns about the certificate of the other environment, independently of the active one', () => {
    writeCertificateNotice(withNotices(false, [notice(false, 'produccion')]));

    expect(stripAnsi(stderr)).toContain('El certificado de produccion vence el 20/11/2026 (en 10 días).');
  });

  it('lists both certificates in the same banner', () => {
    writeCertificateNotice(withNotices(false, [notice(false, 'testing'), notice(false, 'produccion')]));

    const plain = stripAnsi(stderr);

    expect(plain).toContain('El certificado de testing vence el 20/11/2026 (en 10 días).');
    expect(plain).toContain('El certificado de produccion vence el 20/11/2026 (en 10 días).');
    expect(plain.match(/Renovalo:/g)).toHaveLength(1);
    expect(plain.match(/┌/g)).toHaveLength(1);
  });

  it('keeps stdout clean with --json and still warns on stderr', () => {
    writeCertificateNotice(withNotices(true, [notice(false)], notice(false)));

    expect(stdout).toBe('');
    expect(stripAnsi(stderr)).toContain('vence el 20/11/2026');
  });

  it('warns about an expired certificate in text mode', () => {
    writeCertificateNotice(withNotices(false, [notice(true)], notice(true)));

    expect(stripAnsi(stderr)).toContain('El certificado de produccion venció el 20/11/2026.');
  });

  it('warns about an expired certificate of the other environment, without blocking', () => {
    writeCertificateNotice(withNotices(true, [notice(true, 'produccion')]));

    expect(stdout).toBe('');
    expect(stripAnsi(stderr)).toContain('El certificado de produccion venció el 20/11/2026.');
  });

  it('leaves an expired active certificate to the JSON error with --json', () => {
    writeCertificateNotice(withNotices(true, [notice(true), notice(false, 'testing')], notice(true)));

    expect(stdout).toBe('');
    expect(stderr).toBe('');
  });

  it('prints nothing when the certificates are fine', () => {
    writeCertificateNotice(withNotices(false, []));

    expect(stdout + stderr).toBe('');
  });
});

describe('certificateWarnings', () => {
  it('adds every notice to the JSON "avisos" only with --json', () => {
    const notices = [notice(false, 'testing'), notice(false, 'produccion')];

    expect(certificateWarnings(withNotices(true, notices))).toEqual(notices.map((item) => item.message));
    expect(certificateWarnings(withNotices(false, notices))).toEqual([]);
    expect(certificateWarnings(withNotices(true, []))).toEqual([]);
  });
});
