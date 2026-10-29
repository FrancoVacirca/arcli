import type { Arca } from '@arcasdk/core';
import { describe, expect, it, vi } from 'vitest';

import { ArcaParametersGateway } from '../arca-parameters.gateway';

function createGateway(service: Record<string, unknown>): ArcaParametersGateway {
  return new ArcaParametersGateway({ electronicBillingService: service } as unknown as Arca);
}

describe('ArcaParametersGateway', () => {
  it('maps tables and treats "NULL" as no expiry', async () => {
    const gateway = createGateway({
      getIvaReceptorTypes: vi.fn(async () => ({
        resultGet: { condicionIvaReceptor: [{ cmp_Clase: 'A/ALEY/C', desc: 'IVA Responsable Inscripto', id: 1 }] },
      })),
      getVoucherTypes: vi.fn(async () => ({
        resultGet: { cbteTipo: [{ desc: 'Factura A', fchDesde: '20100917', fchHasta: 'NULL', id: 1 }] },
      })),
    });

    expect(await gateway.listTable('comprobantes')).toEqual([
      { description: 'Factura A', detail: undefined, id: '1', validTo: undefined },
    ]);
    expect(await gateway.listTable('iva-receptor')).toEqual([
      { description: 'IVA Responsable Inscripto', detail: 'A/ALEY/C', id: '1', validTo: undefined },
    ]);
  });

  it('returns no sales points on "Sin Resultados" and fails on other errors', async () => {
    const empty = createGateway({
      getSalesPoints: vi.fn(async () => ({
        errors: { err: [{ code: 602, msg: 'Sin Resultados' }] },
        resultGet: { ptoVenta: [] },
      })),
    });
    const failing = createGateway({
      getSalesPoints: vi.fn(async () => ({ errors: { err: [{ code: 600, msg: 'No autorizado' }] } })),
    });

    expect(await empty.getSalesPoints()).toEqual([]);
    await expect(failing.getSalesPoints()).rejects.toMatchObject({ code: 'ARCA_PARAMETERS_ERROR' });
  });

  it('maps sales points', async () => {
    const gateway = createGateway({
      getSalesPoints: vi.fn(async () => ({
        resultGet: {
          ptoVenta: [
            { bloqueado: 'N', emisionTipo: 'CAE - Factura en línea', fechaBaja: 'NULL', nro: 3 },
            { bloqueado: 'S', emisionTipo: 'CAE', nro: 4 },
          ],
        },
      })),
    });

    expect(await gateway.getSalesPoints()).toEqual([
      { blocked: false, closedOn: undefined, emissionType: 'CAE - Factura en línea', number: 3 },
      { blocked: true, closedOn: undefined, emissionType: 'CAE', number: 4 },
    ]);
  });

  it('asks the quotation with the ARCA currency code', async () => {
    const getQuotation = vi.fn(async () => ({ resultGet: { fchCotiz: '20261004', monCotiz: 1167.33, monId: 'DOL' } }));
    const gateway = createGateway({ getQuotation });

    expect(await gateway.getQuotation('usd')).toEqual({ currency: 'DOL', date: '20261004', rate: 1167.33 });
    expect(getQuotation).toHaveBeenCalledWith('DOL');
  });

  it('maps the server status', async () => {
    const gateway = createGateway({
      getServerStatus: vi.fn(async () => ({ appServer: 'OK', authServer: 'OK', dbServer: 'ERROR' })),
    });

    expect(await gateway.getServerStatus()).toEqual({ app: 'OK', auth: 'OK', db: 'ERROR' });
  });
});
