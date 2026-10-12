import { describe, expect, it } from 'vitest';

import { stripAnsi } from '../../../ui';
import { VOUCHER_KIND_MAP } from '../../billing/voucher-kind-map';
import type { IssuedVoucher } from '../voucher-history';
import {
  formatReceiver,
  formatVoucherDetailAsJson,
  formatVoucherDetailAsText,
  formatVoucherListAsJson,
  formatVoucherListAsText,
  formatVoucherNumber,
  formatVoucherPickerRows,
} from '../voucher-history.presenter';

const voucher: IssuedVoucher = {
  cae: '86400940834444',
  caeExpiration: '20261011',
  concept: 2,
  currency: 'PES',
  date: '20261001',
  documentNumber: 0,
  documentTypeCode: 99,
  exchangeRate: 1,
  exemptAmount: 50,
  ivaAmount: 105.05,
  netAmount: 1000.45,
  number: 12,
  result: 'A',
  taxesAmount: 0,
  total: 1180.5,
  untaxedAmount: 25,
};
const base = { environment: 'testing' as const, pointOfSale: 3, voucherKind: VOUCHER_KIND_MAP.fb };

describe('voucher-history.presenter', () => {
  it('alinea las filas del selector al dato mas largo de cada columna', () => {
    const rows = formatVoucherPickerRows(
      3,
      [
        voucher,
        { ...voucher, cae: undefined, documentNumber: 20123456789, documentTypeCode: 80, number: 13, total: 5 },
      ],
      ' · ',
    );

    expect(rows[0]).toMatch(/^00003-00000012 · 01\/10\/2026 · Consumidor final · +[\d.,]+\$ · CAE 86400940834444$/);
    // Sin CAE no queda un separador colgando; el receptor y el total quedan alineados con la otra fila.
    expect(rows[1]).toMatch(/^00003-00000013 · 01\/10\/2026 · CUIT 20123456789 · +5\$$/);
    expect(rows[0].indexOf('$')).toBe(rows[1].indexOf('$'));
  });

  it('con un ancho, agranda los separadores para que las filas lo ocupen', () => {
    const [natural] = formatVoucherPickerRows(3, [voucher], ' · ');
    const [wide] = formatVoucherPickerRows(3, [voucher], ' · ', natural.length + 9);

    expect(wide).toHaveLength(natural.length + 9);
    expect(wide).toMatch(
      /^00003-00000012 {2}· {3}01\/10\/2026 {2}· {2}Consumidor final {2}· {2}.+ {2}· {2}CAE 86400940834444$/,
    );
  });

  it('si no entran en el ancho, quedan como estan', () => {
    const [natural] = formatVoucherPickerRows(3, [voucher], ' · ');

    expect(formatVoucherPickerRows(3, [voucher], ' · ', 20)).toEqual([natural]);
  });

  it('formatea numero y receptor', () => {
    expect(formatVoucherNumber(3, 12)).toBe('00003-00000012');
    expect(formatReceiver(voucher)).toBe('Consumidor final');
    expect(formatReceiver({ ...voucher, documentNumber: 30709965812, documentTypeCode: 80 })).toBe('CUIT 30709965812');
  });

  it('lista los comprobantes en texto y avisa si no hay', () => {
    const text = stripAnsi(formatVoucherListAsText({ ...base, vouchers: [voucher] }));

    expect(text).toContain('ULTIMAS FACTURA B · PV 3 · TESTING');
    expect(text).toContain('00003-00000012  01/10/2026');
    expect(text).toContain('CAE 86400940834444');
    expect(stripAnsi(formatVoucherListAsText({ ...base, vouchers: [] }))).toContain('No hay Factura B emitidas');
  });

  it('serializa la lista en JSON', () => {
    const json = JSON.parse(formatVoucherListAsJson({ ...base, vouchers: [voucher] }));

    expect(json).toMatchObject({
      atajo: 'fb',
      comprobante: 'Factura B',
      entorno: 'testing',
      puntoVenta: 3,
      tipoArca: 6,
    });
    expect(json.comprobantes[0]).toMatchObject({
      cae: '86400940834444',
      fecha: '20261001',
      importes: { exento: 50, iva: 105.05, neto: 1000.45, noGravado: 25, total: 1180.5, tributos: 0 },
      numero: 12,
      resultado: 'A',
    });
  });

  it('muestra el detalle como ticket con el estado', () => {
    const text = stripAnsi(formatVoucherDetailAsText({ ...base, voucher }));

    expect(text).toContain('FACTURA B');
    expect(text).toContain('Importe no gravado');
    expect(text).toContain('Vencimiento CAE');
    expect(text).toContain('APROBADO');
    expect(text).not.toContain('Cotizacion');
    expect(
      stripAnsi(formatVoucherDetailAsText({ ...base, voucher: { ...voucher, currency: 'DOL', exchangeRate: 1200 } })),
    ).toContain('Cotizacion');
  });

  it('serializa el detalle en JSON', () => {
    expect(JSON.parse(formatVoucherDetailAsJson({ ...base, voucher }))).toMatchObject({
      atajo: 'fb',
      caeVencimiento: '20261011',
      numero: 12,
      puntoVenta: 3,
    });
  });
});
