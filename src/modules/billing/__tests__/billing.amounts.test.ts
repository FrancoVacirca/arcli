import { describe, expect, it } from 'vitest';

import { resolveIvaRateLabel, resolveTaxAmounts, sumTaxAmounts } from '../billing.amounts';
import { billingCommandSchema, billingIvaRateSchema } from '../billing.schemas';
import { VOUCHER_KIND_MAP } from '../voucher-kind-map';

describe('resolveTaxAmounts', () => {
  it('no discrimina IVA para comprobantes tipo C', () => {
    const result = resolveTaxAmounts({ totalAmount: 121 }, VOUCHER_KIND_MAP.fc);

    expect(result).toEqual({ exemptAmount: 0, ivaAmount: 0, netAmount: 121, untaxedAmount: 0 });
  });

  it('discrimina neto e IVA para Factura B', () => {
    const result = resolveTaxAmounts({ totalAmount: 121 }, VOUCHER_KIND_MAP.fb);

    expect(result.netAmount).toBe(100);
    expect(result.ivaAmount).toBe(21);
    expect(result.iva).toEqual([{ BaseImp: 100, Id: 5, Importe: 21 }]);
  });

  it('redondea sin arrastrar el error de punto flotante de la division', () => {
    const result = resolveTaxAmounts({ totalAmount: 100 }, VOUCHER_KIND_MAP.fb);

    expect(result.netAmount).toBe(82.64);
    expect(result.ivaAmount).toBe(17.36);
    expect(result.netAmount + result.ivaAmount).toBe(100);
  });

  it('discrimina IVA en Factura A', () => {
    const result = resolveTaxAmounts({ totalAmount: 121 }, VOUCHER_KIND_MAP.fa);

    expect(result.ivaAmount).toBe(21);
    expect(result.iva).toEqual([{ BaseImp: 100, Id: 5, Importe: 21 }]);
  });

  it.each([
    ['0', 100, 3, 100, 0],
    ['2.5', 102.5, 9, 100, 2.5],
    ['5', 105, 8, 100, 5],
    ['10.5', 110.5, 4, 100, 10.5],
    ['27', 127, 6, 100, 27],
  ] as const)('usa la alicuota %s%%', (ivaRate, totalAmount, id, netAmount, ivaAmount) => {
    const result = resolveTaxAmounts({ ivaRate, totalAmount }, VOUCHER_KIND_MAP.fa);

    expect(result.iva).toEqual([{ BaseImp: netAmount, Id: id, Importe: ivaAmount }]);
    expect(result.netAmount).toBe(netAmount);
    expect(result.ivaAmount).toBe(ivaAmount);
  });

  it('descuenta exento y no gravado antes de calcular el IVA', () => {
    const result = resolveTaxAmounts({ exemptAmount: 50, totalAmount: 196, untaxedAmount: 25 }, VOUCHER_KIND_MAP.fb);

    expect(result).toEqual({
      exemptAmount: 50,
      iva: [{ BaseImp: 100, Id: 5, Importe: 21 }],
      ivaAmount: 21,
      netAmount: 100,
      untaxedAmount: 25,
    });
    expect(result.untaxedAmount + result.exemptAmount + result.netAmount + result.ivaAmount).toBe(196);
  });

  it('no informa IVA cuando todo el monto es exento', () => {
    const result = resolveTaxAmounts({ exemptAmount: 1000, totalAmount: 1000 }, VOUCHER_KIND_MAP.fb);

    expect(result).toEqual({ exemptAmount: 1000, ivaAmount: 0, netAmount: 0, untaxedAmount: 0 });
  });

  it('rechaza exento mas no gravado por encima del total', () => {
    expect(() =>
      resolveTaxAmounts({ exemptAmount: 600, totalAmount: 1000, untaxedAmount: 500 }, VOUCHER_KIND_MAP.fb),
    ).toThrow(/no puede superar el monto total/);
  });

  it('rechaza alicuota, exento y no gravado en letra C', () => {
    expect(() =>
      resolveTaxAmounts({ exemptAmount: 10, ivaRate: '10.5', totalAmount: 100 }, VOUCHER_KIND_MAP.fc),
    ).toThrow(/Quite --alicuota, --exento/);
  });
});

describe('resolveTaxAmounts con varias alicuotas', () => {
  it('parte cada monto en neto e IVA segun su alicuota', () => {
    const result = resolveTaxAmounts(
      {
        ivaRateAmounts: [
          { amount: 1210, rate: '21' },
          { amount: 552.5, rate: '10.5' },
        ],
        totalAmount: 1762.5,
      },
      VOUCHER_KIND_MAP.fa,
    );

    expect(result.iva).toEqual([
      { BaseImp: 1000, Id: 5, Importe: 210 },
      { BaseImp: 500, Id: 4, Importe: 52.5 },
    ]);
    expect(result.netAmount).toBe(1500);
    expect(result.ivaAmount).toBe(262.5);
  });

  it('junta montos repetidos de la misma alicuota', () => {
    const result = resolveTaxAmounts(
      {
        ivaRateAmounts: [
          { amount: 121, rate: '21' },
          { amount: 242, rate: '21' },
        ],
        totalAmount: 363,
      },
      VOUCHER_KIND_MAP.fb,
    );

    expect(result.iva).toEqual([{ BaseImp: 300, Id: 5, Importe: 63 }]);
  });

  it('suma exento y no gravado aparte de las alicuotas', () => {
    const result = resolveTaxAmounts(
      { exemptAmount: 50, ivaRateAmounts: [{ amount: 121, rate: '21' }], totalAmount: 171 },
      VOUCHER_KIND_MAP.fb,
    );

    expect(result.exemptAmount).toBe(50);
    expect(result.netAmount + result.ivaAmount + result.exemptAmount).toBe(171);
  });

  it('rechaza alicuotas que no suman lo gravado del total', () => {
    expect(() =>
      resolveTaxAmounts({ ivaRateAmounts: [{ amount: 1210, rate: '21' }], totalAmount: 2000 }, VOUCHER_KIND_MAP.fa),
    ).toThrow(/La suma de las alicuotas \(1210.00\) no coincide con lo gravado del monto total \(2000.00\)/);
  });

  it('rechaza varias alicuotas en letra C', () => {
    expect(() =>
      resolveTaxAmounts({ ivaRateAmounts: [{ amount: 100, rate: '21' }], totalAmount: 100 }, VOUCHER_KIND_MAP.fc),
    ).toThrow(/Quite --alicuota/);
  });
});

describe('ImpTotal exacto', () => {
  it('rechaza alicuotas que no suman exacto lo gravado, aunque sea por un centavo', () => {
    expect(() =>
      resolveTaxAmounts(
        {
          ivaRateAmounts: [
            { amount: 500, rate: '21' },
            { amount: 500.01, rate: '10.5' },
          ],
          totalAmount: 1000,
        },
        VOUCHER_KIND_MAP.fa,
      ),
    ).toThrow(/no coincide/);
  });

  it.each([
    [{ totalAmount: 1196, exemptAmount: 50, untaxedAmount: 25 }, 'fb'],
    [
      {
        totalAmount: 300.3,
        ivaRateAmounts: [
          { amount: 100.1, rate: '21' },
          { amount: 200.2, rate: '10.5' },
        ],
      },
      'fa',
    ],
    [{ totalAmount: 0.1 }, 'fa'],
    [{ totalAmount: 1234.56 }, 'fc'],
  ] as const)('las partes suman exacto el total: %j', (input, shortcut) => {
    const amounts = resolveTaxAmounts(input as never, VOUCHER_KIND_MAP[shortcut]);

    expect(sumTaxAmounts(amounts)).toBe(input.totalAmount);
  });

  it('el schema rechaza importes con mas de 2 decimales, como los de un JSON', () => {
    const base = { concept: 'servicios', ivaCondition: 'consumidor-final', shortcut: 'fc' };

    expect(() => billingCommandSchema.parse({ ...base, totalAmount: 100.555 })).toThrow(/Use hasta 2 decimales/);
    expect(() => billingCommandSchema.parse({ ...base, exemptAmount: 0.001, totalAmount: 100 })).toThrow(
      /Use hasta 2 decimales/,
    );
    expect(billingCommandSchema.parse({ ...base, exchangeRate: 1452.123456, totalAmount: 100 }).exchangeRate).toBe(
      1452.123456,
    );
  });
});

describe('billingIvaRateSchema', () => {
  it.each([
    ['10,5', '10.5'],
    ['10.5%', '10.5'],
    [' 21 ', '21'],
    [27, '27'],
    ['general', '21'],
    ['Reducida', '10.5'],
    ['incrementada', '27'],
    ['cero', '0'],
  ])('normaliza %s', (input, expected) => {
    expect(billingIvaRateSchema.parse(input)).toBe(expected);
  });

  it('rechaza alicuotas que ARCA no admite', () => {
    expect(() => billingIvaRateSchema.parse('19')).toThrow(/general \(21\), reducida \(10\.5\)/);
  });
});

describe('resolveIvaRateLabel', () => {
  it('traduce el id de ARCA a la tasa', () => {
    expect(resolveIvaRateLabel(4)).toBe('10,5%');
    expect(resolveIvaRateLabel(5)).toBe('21%');
    expect(resolveIvaRateLabel(99)).toBeUndefined();
  });
});
