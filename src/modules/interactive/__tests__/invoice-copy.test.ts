import { describe, expect, it } from 'vitest';

import type { IssuedVoucher } from '../../vouchers/voucher-history';
import { copyInvoiceAmounts } from '../invoice-copy';

function invoice(overrides: Partial<IssuedVoucher> = {}): IssuedVoucher {
  return {
    date: '20261001',
    documentNumber: 20111111112,
    documentTypeCode: 80,
    ivaAmount: 210,
    netAmount: 1000,
    number: 14,
    total: 1210,
    ...overrides,
  };
}

describe('copyInvoiceAmounts', () => {
  it('copies the rate, exempt and untaxed amounts of an A or B invoice', () => {
    expect(copyInvoiceAmounts(invoice({ exemptAmount: 50, total: 1285, untaxedAmount: 25 }), 'a')).toEqual({
      currencyCode: 'PES',
      exchangeRate: undefined,
      exemptAmount: 50,
      ivaRate: '21',
      limitation: undefined,
      untaxedAmount: 25,
    });
  });

  it('keeps the currency and exchange rate of a foreign currency invoice', () => {
    expect(copyInvoiceAmounts(invoice({ currency: 'DOL', exchangeRate: 1450 }), 'a')).toMatchObject({
      currencyCode: 'DOL',
      exchangeRate: 1450,
    });
  });

  it('says why a multi-rate invoice cannot be reproduced', () => {
    // 21% sobre 1000 y 10,5% sobre 500: el cociente no es ninguna tasa.
    const copy = copyInvoiceAmounts(invoice({ ivaAmount: 262.5, netAmount: 1500, total: 1762.5 }), 'a');

    expect(copy.ivaRate).toBeUndefined();
    expect(copy.limitation).toMatch(/varias/);
  });

  it('says why an invoice with taxes cannot be reproduced', () => {
    expect(copyInvoiceAmounts(invoice({ taxesAmount: 30, total: 1240 }), 'a').limitation).toMatch(/tributos/);
  });

  it('does not copy IVA data for letter C', () => {
    expect(copyInvoiceAmounts(invoice({ ivaAmount: 0, netAmount: 1000, total: 1000 }), 'c')).toMatchObject({
      exemptAmount: undefined,
      ivaRate: undefined,
      limitation: undefined,
    });
  });
});
