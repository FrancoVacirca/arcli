import { describe, expect, it } from 'vitest';

import { filterCurrentEntries, type ParametersGateway, resolveParameterTable, salesPointToEntry } from '../parameters';
import { formatParameterEntriesAsText, formatStatusAsJson, formatStatusAsText } from '../parameters.presenter';
import { buildStatusReport } from '../status';

function createGateway(overrides: Partial<ParametersGateway> = {}): ParametersGateway {
  return {
    getQuotation: async () => ({ currency: 'DOL', rate: 1 }),
    getSalesPoints: async () => [],
    getServerStatus: async () => ({ app: 'OK', auth: 'OK', db: 'OK' }),
    listTable: async () => [],
    ...overrides,
  };
}

describe('parameters', () => {
  it('accepts known tables case-insensitively and rejects the rest', () => {
    expect(resolveParameterTable(' Alicuotas ')).toBe('alicuotas');
    expect(() => resolveParameterTable('foo')).toThrow(/no existe/);
  });

  it('keeps only entries still valid today', () => {
    const entries = [
      { description: 'vigente', id: '1' },
      { description: 'vence despues', id: '2', validTo: '20271231' },
      { description: 'vencida', id: '3', validTo: '20200101' },
    ];

    expect(filterCurrentEntries(entries, '20261005').map((entry) => entry.id)).toEqual(['1', '2']);
  });

  it('describes sales points', () => {
    expect(salesPointToEntry({ blocked: true, emissionType: 'CAE', number: 3 })).toMatchObject({
      detail: 'bloqueado',
      id: '3',
    });
    expect(salesPointToEntry({ blocked: false, emissionType: 'CAE', number: 4 }).detail).toBe('habilitado');
  });

  it('explains empty sales points in testing', () => {
    expect(formatParameterEntriesAsText('puntos-venta', [], 'testing')).toContain('En testing ARCA no informa');
  });
});

describe('buildStatusReport', () => {
  it('is ready when servers are OK and the point of sale is enabled', async () => {
    const report = await buildStatusReport({
      environment: 'produccion',
      gateway: createGateway({ getSalesPoints: async () => [{ blocked: false, emissionType: 'CAE', number: 3 }] }),
      pointOfSale: 3,
    });

    expect(report).toMatchObject({ pointOfSale: { kind: 'habilitado' }, ready: true });
    expect(JSON.parse(formatStatusAsJson(report))).toMatchObject({ listo: true, puntoVenta: { estado: 'habilitado' } });
  });

  it('cannot verify the point of sale in testing but still is ready', async () => {
    const report = await buildStatusReport({ environment: 'testing', gateway: createGateway(), pointOfSale: 3 });

    expect(report).toMatchObject({ pointOfSale: { kind: 'sin-datos' }, ready: true });
  });

  it('is not ready with a missing, blocked or unconfigured point of sale', async () => {
    const points = async () => [
      { blocked: true, emissionType: 'CAE', number: 3 },
      { blocked: false, emissionType: 'CAE', number: 4 },
    ];

    const blocked = await buildStatusReport({
      environment: 'produccion',
      gateway: createGateway({ getSalesPoints: points }),
      pointOfSale: 3,
    });
    const missing = await buildStatusReport({
      environment: 'produccion',
      gateway: createGateway({ getSalesPoints: points }),
      pointOfSale: 9,
    });
    const unset = await buildStatusReport({ environment: 'produccion', gateway: createGateway() });

    expect([blocked.pointOfSale.kind, missing.pointOfSale.kind, unset.pointOfSale.kind]).toEqual([
      'bloqueado',
      'no-encontrado',
      'sin-configurar',
    ]);
    expect([blocked.ready, missing.ready, unset.ready]).toEqual([false, false, false]);
    expect(formatStatusAsText(missing)).toContain('arcli parametros puntos-venta');
    expect(formatStatusAsText(missing)).toContain('Factura en linea');
    expect(formatStatusAsText(missing)).toContain('#punto-de-venta-para-web-service');
    expect(formatStatusAsText(blocked)).not.toContain('Factura en linea');
  });

  it('is not ready when a server is down and measures latency', async () => {
    let clock = 1000;
    const report = await buildStatusReport({
      environment: 'testing',
      gateway: createGateway({
        getServerStatus: async () => {
          clock += 120;

          return { app: 'OK', auth: 'OK', db: 'ERROR' };
        },
      }),
      now: () => clock,
      pointOfSale: 3,
    });

    expect(report).toMatchObject({ latencyMs: 120, ready: false });
    expect(formatStatusAsText(report)).toContain('ARCA tiene problemas');
  });
});
