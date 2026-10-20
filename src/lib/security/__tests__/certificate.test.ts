import { afterAll, describe, expect, it } from 'vitest';

import {
  type CertificateExpiry,
  computeCertificateExpiry,
  isCertificateExpiringSoon,
  readCertificateExpiry,
} from '../certificate';

import { createSelfSignedCertificate, removeSelfSignedCertificates } from './self-signed-certificate';

afterAll(removeSelfSignedCertificates);

function createExpiry(partial: Partial<CertificateExpiry>): CertificateExpiry {
  return {
    daysRemaining: partial.daysRemaining ?? 0,
    expiresAt: partial.expiresAt ?? new Date(),
    isExpired: partial.isExpired ?? false,
  };
}

describe('readCertificateExpiry', () => {
  it('calcula los dias restantes de un certificado vigente y lejano', () => {
    const { pem } = createSelfSignedCertificate(365);
    const expiry = readCertificateExpiry(pem);

    expect(expiry.isExpired).toBe(false);
    expect(expiry.daysRemaining).toBeGreaterThan(300);
  }, 10_000);

  it('calcula los dias restantes de un certificado a punto de vencer', () => {
    const { pem } = createSelfSignedCertificate(10);
    const expiry = readCertificateExpiry(pem);

    expect(expiry.isExpired).toBe(false);
    expect(expiry.daysRemaining).toBeLessThanOrEqual(10);
    expect(expiry.daysRemaining).toBeGreaterThan(0);
  }, 10_000);
});

describe('computeCertificateExpiry', () => {
  // 20/11/2026 23:59:59 en Argentina (UTC-3).
  const expiresAt = new Date('2026-11-21T02:59:59Z');

  it('counts Argentine calendar days until expiry', () => {
    const expiry = computeCertificateExpiry(expiresAt, new Date('2026-11-10T12:00:00-03:00'));

    expect(expiry).toEqual({ daysRemaining: 10, expiresAt, isExpired: false });
  });

  it('uses the Argentine date even when UTC is already the next day', () => {
    // 22:00 del 10/11 en Argentina es 01:00 del 11/11 en UTC.
    expect(computeCertificateExpiry(expiresAt, new Date('2026-11-10T22:00:00-03:00')).daysRemaining).toBe(10);
  });

  it('reports zero days on the expiry day, before the exact instant', () => {
    expect(computeCertificateExpiry(expiresAt, new Date('2026-11-20T09:00:00-03:00'))).toMatchObject({
      daysRemaining: 0,
      isExpired: false,
    });
  });

  it('marks the certificate as expired from the exact expiry instant', () => {
    expect(computeCertificateExpiry(expiresAt, new Date('2026-11-21T02:59:59Z')).isExpired).toBe(true);
    expect(computeCertificateExpiry(expiresAt, new Date('2026-11-25T12:00:00-03:00'))).toMatchObject({
      daysRemaining: -5,
      isExpired: true,
    });
  });
});

describe('isCertificateExpiringSoon', () => {
  it('avisa cuando el certificado vence dentro del umbral', () => {
    expect(isCertificateExpiringSoon(createExpiry({ daysRemaining: 5, isExpired: false }), 30)).toBe(true);
  });

  it('no avisa cuando el certificado vence lejos del umbral', () => {
    expect(isCertificateExpiringSoon(createExpiry({ daysRemaining: 200, isExpired: false }), 30)).toBe(false);
  });

  it('no avisa por un certificado que ya vencio', () => {
    expect(isCertificateExpiringSoon(createExpiry({ daysRemaining: -5, isExpired: true }), 30)).toBe(false);
  });
});
