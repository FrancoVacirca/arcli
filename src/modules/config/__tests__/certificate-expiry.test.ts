import { afterAll, describe, expect, it } from 'vitest';

import { CERTIFICATE_GUIDE_URL } from '../../../lib/links';
import {
  createSelfSignedCertificate,
  removeSelfSignedCertificates,
} from '../../../lib/security/__tests__/self-signed-certificate';
import { computeCertificateExpiry } from '../../../lib/security/certificate';
import {
  CERTIFICATE_EXPIRY_WARNING_DAYS,
  CertificateExpiredError,
  describeCertificateExpiry,
  inspectCertificateExpiry,
  inspectConfiguredCertificates,
} from '../certificate-expiry';

afterAll(removeSelfSignedCertificates);

// 20/11/2026 23:59:59 en Argentina.
const EXPIRES_AT = new Date('2026-11-21T02:59:59Z');

function noticeAt(now: string, environment: 'produccion' | 'testing' = 'produccion') {
  return describeCertificateExpiry(computeCertificateExpiry(EXPIRES_AT, new Date(now)), environment);
}

describe('describeCertificateExpiry', () => {
  it('stays silent when the certificate expires beyond the threshold', () => {
    expect(CERTIFICATE_EXPIRY_WARNING_DAYS).toBe(30);
    expect(noticeAt('2026-10-20T12:00:00-03:00')).toBeUndefined();
  });

  it('warns from the threshold on, with the date, the days left and the guide', () => {
    expect(noticeAt('2026-10-21T12:00:00-03:00')?.daysRemaining).toBe(30);
    expect(noticeAt('2026-11-10T12:00:00-03:00')).toEqual({
      daysRemaining: 10,
      environment: 'produccion',
      expired: false,
      expiresOn: '20/11/2026',
      message: `El certificado de produccion vence el 20/11/2026 (en 10 días). Renovalo: ${CERTIFICATE_GUIDE_URL}`,
      summary: 'El certificado de produccion vence el 20/11/2026 (en 10 días).',
    });
  });

  it('uses singular and "hoy" for the last days', () => {
    expect(noticeAt('2026-11-19T12:00:00-03:00', 'testing')?.message).toBe(
      `El certificado de testing vence el 20/11/2026 (en 1 día). Renovalo: ${CERTIFICATE_GUIDE_URL}`,
    );
    expect(noticeAt('2026-11-20T12:00:00-03:00')?.message).toContain('vence el 20/11/2026 (hoy).');
  });

  it('describes an expired certificate', () => {
    expect(noticeAt('2026-11-25T12:00:00-03:00')).toMatchObject({
      expired: true,
      message: `El certificado de produccion venció el 20/11/2026. Renovalo: ${CERTIFICATE_GUIDE_URL}`,
    });
  });
});

describe('inspectCertificateExpiry', () => {
  it('does not invent a notice when the certificate cannot be read', () => {
    expect(inspectCertificateExpiry('-----BEGIN CERTIFICATE-----\nnope\n-----END CERTIFICATE-----', 'testing')).toBe(
      undefined,
    );
  });
});

describe('inspectConfiguredCertificates', () => {
  it('warns about the certificate of the other environment too, the active one first', () => {
    const testing = createSelfSignedCertificate(10);
    const production = createSelfSignedCertificate(5);

    const notices = inspectConfiguredCertificates(
      { produccion: production.certPath, testing: testing.certPath },
      { activeEnvironment: 'testing' },
    );

    expect(notices.map((notice) => notice.environment)).toEqual(['testing', 'produccion']);
    expect(notices.every((notice) => !notice.expired)).toBe(true);
  }, 10_000);

  it('warns about the other environment even when the active certificate is fine', () => {
    const testing = createSelfSignedCertificate(365);
    const production = createSelfSignedCertificate(10);

    const notices = inspectConfiguredCertificates(
      { produccion: production.certPath, testing: testing.certPath },
      { activeEnvironment: 'testing' },
    );

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ environment: 'produccion', expired: false });
    expect(notices[0]?.summary).toMatch(/^El certificado de produccion vence el/);
  }, 10_000);

  it('uses the active certificate already read instead of reading its file again', () => {
    const production = createSelfSignedCertificate(10);

    const notices = inspectConfiguredCertificates(
      { produccion: '/no/existe/cert.pem' },
      { activeEnvironment: 'produccion', activePem: production.pem },
    );

    expect(notices).toHaveLength(1);
    expect(notices[0]?.environment).toBe('produccion');
  }, 10_000);

  it('skips certificates that are not configured or cannot be read', () => {
    expect(inspectConfiguredCertificates({}, { activeEnvironment: 'testing' })).toEqual([]);
    expect(
      inspectConfiguredCertificates({ produccion: '/no/existe/cert.pem' }, { activeEnvironment: 'testing' }),
    ).toEqual([]);
  });
});

describe('CertificateExpiredError', () => {
  it('carries its own code, the guide and the environment to fix', () => {
    const notice = noticeAt('2026-11-25T12:00:00-03:00');

    if (!notice) {
      throw new Error('expected a notice');
    }

    const error = new CertificateExpiredError(notice);

    expect(error.code).toBe('CERTIFICATE_EXPIRED');
    expect(error.message).toBe('El certificado de produccion venció el 20/11/2026: ARCA no lo acepta.');
    expect(error.details).toEqual({ entorno: 'produccion', vencimiento: '20/11/2026' });
    expect(error.suggestion).toContain('cert.produccion');
    expect(error.suggestion).toContain(CERTIFICATE_GUIDE_URL);
    expect(error.notice).toBe(notice);
  });
});
