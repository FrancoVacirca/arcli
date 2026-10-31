import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSelfSignedCertificate,
  removeSelfSignedCertificates,
} from '../../lib/security/__tests__/self-signed-certificate';
import type { BillingGateway } from '../../modules/billing/billing.types.internal';
import type { PadronGateway } from '../../modules/padron/padron';
import type { VoucherHistoryGateway } from '../../modules/vouchers/voucher-history';
import {
  type ArcliClientOptions,
  CertificateExpiredError,
  createArcli,
  EmissionUncertainError,
  InputValidationError,
  type InvoiceRequest,
  MemoryTicketStorage,
} from '../index';

const EMITTER_CUIT = 20111111112;
const RECEIVER_CUIT = 30500010912;

const certificate = createSelfSignedCertificate(365);

function createOptions(overrides: Partial<ArcliClientOptions> = {}): ArcliClientOptions {
  return {
    cert: certificate.pem,
    cuit: EMITTER_CUIT,
    key: 'KEY',
    pointOfSale: 3,
    ticketStorage: new MemoryTicketStorage({ cuit: EMITTER_CUIT }),
    ...overrides,
  };
}

/** Una Factura C de productos a un CUIT: lo que factura un monotributista a otro comercio. */
const invoice: InvoiceRequest = {
  concept: 'productos',
  documentNumber: RECEIVER_CUIT,
  documentType: 'cuit',
  ivaCondition: 'responsable-inscripto',
  shortcut: 'fc',
  totalAmount: 125_000.5,
};

function approvedGateway(number = 13): BillingGateway {
  return {
    createVoucher: vi.fn(async () => ({
      cae: '76123456789012',
      caeFchVto: '20261110',
      response: { FeDetResp: { FECAEDetResponse: [{ CbteDesde: number, CbteHasta: number, Resultado: 'A' }] } },
    })) as never,
    getNextVoucherNumber: vi.fn(async () => number),
    getQuotation: vi.fn(async () => 1),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  removeSelfSignedCertificates();
});

describe('createArcli', () => {
  it('rejects an emitter CUIT with a wrong check digit before anything else', () => {
    expect(() => createArcli(createOptions({ cuit: '20-11111111-3' }))).toThrow(InputValidationError);
  });

  it('requires the certificate and key contents', () => {
    expect(() => createArcli(createOptions({ key: '  ' }))).toThrow(InputValidationError);
  });

  it('defaults to testing and only goes to production when asked', () => {
    expect(createArcli(createOptions()).environment).toBe('testing');
    expect(createArcli(createOptions({ production: true })).environment).toBe('produccion');
  });

  it('previews a Factura C without calling ARCA', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T15:00:00-03:00'));

    const billing = approvedGateway();
    const arcli = createArcli(createOptions({ gateways: { billing } }));

    const result = await arcli.previewInvoice(invoice);

    expect(result.dryRun).toBe(true);
    expect(result.voucherKind.arcaType).toBe(11);
    expect(result.payload).toMatchObject({
      CbteFch: '20261031',
      CbteTipo: 11,
      Concepto: 1,
      DocNro: RECEIVER_CUIT,
      DocTipo: 80,
      ImpIVA: 0,
      ImpNeto: 125_000.5,
      ImpTotal: 125_000.5,
      PtoVta: 3,
    });
    expect(billing.getNextVoucherNumber).not.toHaveBeenCalled();
    expect(billing.createVoucher).not.toHaveBeenCalled();
  });

  it('emits with the next number and returns the CAE', async () => {
    const billing = approvedGateway(13);
    const arcli = createArcli(createOptions({ gateways: { billing } }));

    const result = await arcli.emitInvoice(invoice);

    expect(billing.getNextVoucherNumber).toHaveBeenCalledWith(3, 11);
    expect(billing.createVoucher).toHaveBeenCalledWith(expect.objectContaining({ CbteDesde: 13, CbteHasta: 13 }));
    expect(result.dryRun).toBe(false);
    expect(result.voucherNumber).toBe(13);
    expect(result.response).toMatchObject({ cae: '76123456789012', caeVencimiento: '20261110', status: 'aprobado' });
  });

  it('takes the point of sale from the request over the default', async () => {
    const billing = approvedGateway();
    const arcli = createArcli(createOptions({ gateways: { billing } }));

    await arcli.emitInvoice({ ...invoice, pointOfSale: 7 });

    expect(billing.getNextVoucherNumber).toHaveBeenCalledWith(7, 11);
  });

  it('reports an ARCA rejection as a result, not as an error', async () => {
    const billing: BillingGateway = {
      ...approvedGateway(),
      createVoucher: vi.fn(async () => ({
        cae: '',
        caeFchVto: '',
        response: {
          FeDetResp: {
            FECAEDetResponse: [
              {
                Observaciones: { Obs: [{ Code: 10015, Msg: 'El campo DocNro es invalido' }] },
                Resultado: 'R',
              },
            ],
          },
        },
      })) as never,
    };
    const arcli = createArcli(createOptions({ gateways: { billing } }));

    const result = await arcli.emitInvoice(invoice);

    expect(result.response.status).toBe('rechazado');
    expect(result.response.cae).toBeNull();
    expect(result.response.observaciones).toEqual(['El campo DocNro es invalido']);
  });

  it('flags a failed emission call as uncertain', async () => {
    const billing: BillingGateway = {
      ...approvedGateway(),
      createVoucher: vi.fn(async () => {
        throw new Error('socket hang up');
      }),
    };
    const arcli = createArcli(createOptions({ gateways: { billing } }));

    await expect(arcli.emitInvoice(invoice)).rejects.toBeInstanceOf(EmissionUncertainError);
  });

  it('validates the request with the same rules as the CLI', async () => {
    const billing = approvedGateway();
    const arcli = createArcli(createOptions({ gateways: { billing } }));

    await expect(arcli.emitInvoice({ ...invoice, totalAmount: 10.123 })).rejects.toBeInstanceOf(InputValidationError);
    // Un consumidor final no puede recibir una Factura A.
    await expect(
      arcli.emitInvoice({ ...invoice, ivaCondition: 'consumidor-final', shortcut: 'fa' }),
    ).rejects.toBeInstanceOf(InputValidationError);
    expect(billing.createVoucher).not.toHaveBeenCalled();
  });

  it('stops before WSAA when the certificate expired', async () => {
    const arcli = createArcli(
      createOptions({ now: () => new Date(Date.now() + 400 * 24 * 60 * 60 * 1000), ticketStorage: failingStorage() }),
    );

    await expect(arcli.emitInvoice(invoice)).rejects.toBeInstanceOf(CertificateExpiredError);
  });

  it('reads the certificate expiry locally', () => {
    const status = createArcli(createOptions()).certificate();

    expect(status?.isExpired).toBe(false);
    expect(status?.daysRemaining).toBeGreaterThan(300);
    expect(status?.notice).toBeUndefined();
    expect(createArcli(createOptions({ cert: 'not a pem' })).certificate()).toBeNull();
  });

  it('looks vouchers up by shortcut instead of ARCA type numbers', async () => {
    const history: VoucherHistoryGateway = {
      getLastNumber: vi.fn(async () => 12),
      getVoucher: vi.fn(async () => undefined),
    };
    const arcli = createArcli(createOptions({ gateways: { history } }));

    await expect(arcli.lastVoucherNumber('fc')).resolves.toBe(12);
    await expect(arcli.findVoucher('fc', 12, 4)).resolves.toBeUndefined();

    expect(history.getLastNumber).toHaveBeenCalledWith(3, 11);
    expect(history.getVoucher).toHaveBeenCalledWith(12, 4, 11);
    await expect(arcli.lastVoucherNumber('xx' as never)).rejects.toBeInstanceOf(InputValidationError);
  });

  it('asks the padrón for a valid receiver CUIT only', async () => {
    const padron: PadronGateway = { getTaxpayer: vi.fn(async () => null) };
    const arcli = createArcli(createOptions({ gateways: { padron } }));

    await expect(arcli.getTaxpayer('30-50001091-2')).resolves.toBeNull();
    expect(padron.getTaxpayer).toHaveBeenCalledWith(RECEIVER_CUIT);
    await expect(arcli.getTaxpayer('30-50001091-3')).rejects.toBeInstanceOf(InputValidationError);
  });

  it('never writes the CLI config or tickets to disk', async () => {
    const before = new Set(readdirSync(tmpdir()));
    const arcli = createArcli(createOptions({ gateways: { billing: approvedGateway() } }));

    await arcli.emitInvoice(invoice);

    const created = readdirSync(tmpdir()).filter((entry) => !before.has(entry) && !entry.startsWith('arcli-'));

    expect(created).toEqual([]);
    expect(readdirSync(process.env.HOME as string)).toEqual([]);
  });
});

/** Un storage que falla si alguien lo usa: prueba que el corte por certificado vencido es anterior a WSAA. */
function failingStorage(): ArcliClientOptions['ticketStorage'] {
  const fail = async (): Promise<never> => {
    throw new Error('ticketStorage no debería usarse');
  };

  return { delete: fail, get: fail, save: fail };
}
