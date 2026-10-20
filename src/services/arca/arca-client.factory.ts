import { Arca } from '@arcasdk/core';

import { CertificateExpiredError } from '../../modules/config/certificate-expiry';

import type { ResolvedArcaRuntime } from './arca-context.resolver';

export class ArcaClientFactory {
  /** Todo cliente de ARCA sale de aca: con el certificado vencido se corta antes de pedir el ticket a WSAA. */
  public create(runtime: Pick<ResolvedArcaRuntime, 'certificateExpiry' | 'context'>): Arca {
    if (runtime.certificateExpiry?.expired) {
      throw new CertificateExpiredError(runtime.certificateExpiry);
    }

    return new Arca(runtime.context);
  }
}
