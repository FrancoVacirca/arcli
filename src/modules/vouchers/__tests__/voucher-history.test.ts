import { describe, expect, it, vi } from 'vitest';

import {
  inferIvaRate,
  type IssuedVoucher,
  listRecentVouchers,
  listVouchersFrom,
  resolveDocumentType,
} from '../voucher-history';

function voucher(number: number): IssuedVoucher {
  return {
    date: '20261001',
    documentNumber: 0,
    documentTypeCode: 99,
    ivaAmount: 21,
    netAmount: 100,
    number,
    total: 121,
  };
}

describe('listRecentVouchers', () => {
  it('trae los ultimos comprobantes del mas nuevo al mas viejo', async () => {
    const getVoucher = vi.fn(async (number: number) => voucher(number));
    const result = await listRecentVouchers({ getLastNumber: async () => 14, getVoucher }, 3, 6, { limit: 5 });

    expect(result.map((item) => item.number)).toEqual([14, 13, 12, 11, 10]);
    expect(getVoucher).toHaveBeenCalledWith(14, 3, 6);
  });

  it('no consulta numeros menores a 1', async () => {
    const getVoucher = vi.fn(async (number: number) => voucher(number));
    const result = await listRecentVouchers({ getLastNumber: async () => 2, getVoucher }, 3, 6);

    expect(result.map((item) => item.number)).toEqual([2, 1]);
  });

  it('devuelve vacio si no hay comprobantes y omite los que ARCA no devuelve', async () => {
    expect(await listRecentVouchers({ getLastNumber: async () => 0, getVoucher: vi.fn() }, 3, 6)).toEqual([]);

    const sparse = await listRecentVouchers(
      { getLastNumber: async () => 3, getVoucher: async (number) => (number === 2 ? undefined : voucher(number)) },
      3,
      6,
    );

    expect(sparse.map((item) => item.number)).toEqual([3, 1]);
  });
});

describe('listVouchersFrom', () => {
  it('pagina desde un numero sin pedir el ultimo emitido', async () => {
    const getLastNumber = vi.fn();
    const getVoucher = vi.fn(async (number: number) => voucher(number));
    const result = await listVouchersFrom({ getLastNumber, getVoucher }, 3, 6, 4, { limit: 10 });

    expect(result.map((item) => item.number)).toEqual([4, 3, 2, 1]);
    expect(getLastNumber).not.toHaveBeenCalled();
  });

  it('desde 0 o menos no consulta nada', async () => {
    const getVoucher = vi.fn();

    expect(await listVouchersFrom({ getLastNumber: vi.fn(), getVoucher }, 3, 6, 0)).toEqual([]);
    expect(await listVouchersFrom({ getLastNumber: vi.fn(), getVoucher }, 3, 6, -2)).toEqual([]);
    expect(getVoucher).not.toHaveBeenCalled();
  });
});

describe('inferIvaRate', () => {
  it.each([
    [100, 21, '21'],
    [100, 10.5, '10.5'],
    [826.45, 173.55, '21'],
    [100, 0, '0'],
  ] as const)('deduce la alícuota de neto %s e IVA %s', (net, iva, expected) => {
    expect(inferIvaRate(net, iva)).toBe(expected);
  });

  it('no deduce nada sin neto o con una tasa desconocida', () => {
    expect(inferIvaRate(0, 0)).toBeUndefined();
    expect(inferIvaRate(100, 19)).toBeUndefined();
  });
});

describe('resolveDocumentType', () => {
  it('traduce los codigos de documento de ARCA', () => {
    expect(resolveDocumentType(80)).toBe('cuit');
    expect(resolveDocumentType(96)).toBe('dni');
    expect(resolveDocumentType(99)).toBe('consumidor-final');
    expect(resolveDocumentType(1)).toBeUndefined();
  });
});
