import type { Arca } from '@arcasdk/core';
import type { IVoucher } from '@arcasdk/core/lib/domain/types/voucher.types';
import { describe, expect, it, vi } from 'vitest';

import { ArcaBillingGateway } from '../arca-billing.gateway';

function createGateway(service: Record<string, unknown>): ArcaBillingGateway {
  return new ArcaBillingGateway({ electronicBillingService: service } as unknown as Arca);
}

describe('ArcaBillingGateway', () => {
  it('returns the last authorized number plus one, like createNextVoucher', async () => {
    const getLastVoucher = vi.fn(async () => ({ cbteNro: 41 }));
    const gateway = createGateway({ getLastVoucher });

    await expect(gateway.getNextVoucherNumber(3, 11)).resolves.toBe(42);
    expect(getLastVoucher).toHaveBeenCalledWith(3, 11);
  });

  it('starts at 1 when the sales point has no vouchers yet', async () => {
    const empty = createGateway({ getLastVoucher: vi.fn(async () => ({ cbteNro: 0 })) });
    const missing = createGateway({ getLastVoucher: vi.fn(async () => ({})) });

    await expect(empty.getNextVoucherNumber(3, 11)).resolves.toBe(1);
    await expect(missing.getNextVoucherNumber(3, 11)).resolves.toBe(1);
  });

  it('fails before emitting when the numbering is exhausted', async () => {
    const gateway = createGateway({ getLastVoucher: vi.fn(async () => ({ cbteNro: 99_999_999 })) });

    await expect(gateway.getNextVoucherNumber(3, 11)).rejects.toThrow(/no puede ser mayor a 99999999/);
  });

  it('fails before emitting when ARCA returns errors for the last number', async () => {
    const gateway = createGateway({
      getLastVoucher: vi.fn(async () => ({
        errors: {
          err: [{ code: 11002, msg: 'El punto de venta no se encuentra habilitado a usar en el presente WS' }],
        },
      })),
    });

    const error = await gateway.getNextVoucherNumber(9, 11).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'ARCA_LAST_VOUCHER_ERROR',
      details: { errores: [{ code: 11002 }] },
      suggestion: expect.stringMatching(/parametros puntos-venta/),
    });
    expect((error as Error).message).toMatch(/punto de venta 9: 11002/);
  });

  it('suggests retrying when the last-number error is not about the sales point', async () => {
    const gateway = createGateway({
      getLastVoucher: vi.fn(async () => ({ errors: { err: [{ code: 600, msg: 'ValidacionDeToken' }] } })),
    });

    await expect(gateway.getNextVoucherNumber(3, 11)).rejects.toMatchObject({
      code: 'ARCA_LAST_VOUCHER_ERROR',
      suggestion: expect.stringMatching(/No se emitió nada/),
    });
  });

  it('propagates authentication and last-number failures as they are', async () => {
    const wsaaError = new Error('Certificado expirado');
    const gateway = createGateway({
      getLastVoucher: vi.fn(async () => {
        throw wsaaError;
      }),
    });

    await expect(gateway.getNextVoucherNumber(3, 11)).rejects.toBe(wsaaError);
  });

  it('sends the numbered voucher to createVoucher and returns its result', async () => {
    const result = { cae: '123', caeFchVto: '20261031', response: {} };
    const createVoucher = vi.fn(async () => result);
    const gateway = createGateway({ createVoucher });
    const voucher = { CbteDesde: 42, CbteHasta: 42, CbteTipo: 11, PtoVta: 3 } as IVoucher;

    await expect(gateway.createVoucher(voucher)).resolves.toBe(result);
    expect(createVoucher).toHaveBeenCalledWith(voucher);
  });
});
