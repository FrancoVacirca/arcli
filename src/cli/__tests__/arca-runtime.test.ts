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

function notice(expired: boolean): CertificateExpiryNotice {
  const summary = expired
    ? 'El certificado de produccion venció el 20/11/2026.'
    : 'El certificado de produccion vence el 20/11/2026 (en 10 días).';

  return {
    daysRemaining: expired ? -1 : 10,
    environment: 'produccion',
    expired,
    expiresOn: '20/11/2026',
    message: `${summary} Renovalo: ${CERTIFICATE_GUIDE_URL}`,
    summary,
  };
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
    resolvedRuntime.current = { certificateExpiry: notice(false), outputJson: false };

    expect(resolveArcaRuntime({})).toBe(resolvedRuntime.current);
    expect(stdout).toBe('');
    expect(stripAnsi(stderr)).toContain('El certificado de produccion vence el 20/11/2026 (en 10 días).');
    expect(stripAnsi(stderr)).toContain(`Renovalo: ${CERTIFICATE_GUIDE_URL}`);
  });

  it('keeps stdout clean with --json and still warns on stderr', () => {
    writeCertificateNotice({ certificateExpiry: notice(false), outputJson: true });

    expect(stdout).toBe('');
    expect(stripAnsi(stderr)).toContain('vence el 20/11/2026');
  });

  it('warns about an expired certificate in text mode', () => {
    writeCertificateNotice({ certificateExpiry: notice(true), outputJson: false });

    expect(stripAnsi(stderr)).toContain('El certificado de produccion venció el 20/11/2026.');
  });

  it('leaves an expired certificate to the JSON error with --json', () => {
    writeCertificateNotice({ certificateExpiry: notice(true), outputJson: true });

    expect(stdout).toBe('');
    expect(stderr).toBe('');
  });

  it('prints nothing when the certificate is fine', () => {
    writeCertificateNotice({ outputJson: false });

    expect(stdout + stderr).toBe('');
  });
});

describe('certificateWarnings', () => {
  it('adds the notice to the JSON "avisos" only with --json', () => {
    expect(certificateWarnings({ certificateExpiry: notice(false), outputJson: true })).toEqual([
      notice(false).message,
    ]);
    expect(certificateWarnings({ certificateExpiry: notice(false), outputJson: false })).toEqual([]);
    expect(certificateWarnings({ outputJson: true })).toEqual([]);
  });
});
