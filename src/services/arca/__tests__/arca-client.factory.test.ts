import { Arca } from '@arcasdk/core';
import { describe, expect, it, vi } from 'vitest';

import { CertificateExpiredError, type CertificateExpiryNotice } from '../../../modules/config/certificate-expiry';
import { ArcaClientFactory } from '../arca-client.factory';
import type { ResolvedArcaRuntime } from '../arca-context.resolver';

vi.mock('@arcasdk/core', () => ({ Arca: vi.fn() }));

const context = { cert: 'cert', cuit: 20123456789, key: 'key', production: true } as ResolvedArcaRuntime['context'];

function notice(expired: boolean): CertificateExpiryNotice {
  return {
    daysRemaining: expired ? -1 : 10,
    environment: 'produccion',
    expired,
    expiresOn: '20/11/2026',
    message: 'aviso',
    summary: 'aviso',
  };
}

describe('ArcaClientFactory', () => {
  it('stops before WSAA when the certificate is expired, without creating the ARCA client', () => {
    expect(() => new ArcaClientFactory().create({ certificateExpiry: notice(true), context })).toThrow(
      CertificateExpiredError,
    );
    expect(Arca).not.toHaveBeenCalled();
  });

  it('creates the client when the certificate is only about to expire', () => {
    new ArcaClientFactory().create({ certificateExpiry: notice(false), context });

    expect(Arca).toHaveBeenCalledWith(context);
  });
});
