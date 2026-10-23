import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedArcaRuntime } from '../../../services/arca/arca-context.resolver';
import { EmissionUncertainError } from '../billing.errors';
import type { BillingCommandInput } from '../billing.schemas';
import { BillingService } from '../billing.service';
import { mapBillingResponse } from '../billing-response';

function createRuntime(): ResolvedArcaRuntime {
  return {
    certificateNotices: [],
    config: {
      cert: {},
      emisor: {},
      entornoPorDefecto: 'testing',
      key: {},
      output: {
        emitirPorDefecto: false,
        brutoPorDefecto: false,
        jsonPorDefecto: false,
      },
      puntoVentaPorDefecto: 3,
    },
    context: {
      cert: 'CERT',
      cuit: 20123456789,
      key: 'KEY',
      production: false,
    },
    environment: 'testing',
    outputJson: false,
    outputRaw: false,
    pointOfSale: 3,
  };
}

function createBillingInput(overrides: Partial<BillingCommandInput> = {}): BillingCommandInput {
  return {
    cancellation: false,
    concept: 'servicios',
    currencyCode: 'PES',
    documentType: 'consumidor-final',
    dryRun: true,
    emit: false,
    exchangeRate: 1,
    ivaCondition: 'consumidor-final',
    sameCurrency: false,
    shortcut: 'fb',
    totalAmount: 1000,
    ...overrides,
  };
}

describe('billing.service', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds invoice payload with default service dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();

    const payload = service.buildVoucherPayload(createBillingInput({ shortcut: 'fc' }), createRuntime());

    expect(payload).toMatchObject({
      CbteFch: '20260318',
      CbteTipo: 11,
      Concepto: 2,
      DocTipo: 99,
      ImpNeto: 1000,
      ImpTotal: 1000,
      MonCotiz: 1,
      MonId: 'PES',
      PtoVta: 3,
    });
    expect(payload.FchServDesde).toBe('20260318');
    expect(payload.FchServHasta).toBe('20260318');
    expect(payload.FchVtoPago).toBe('20260318');
    expect(payload.DocNro).toBeUndefined();
  });

  it('uses today as billing date when no explicit date is provided', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({ concept: 'productos', shortcut: 'fc' }),
      createRuntime(),
    );

    expect(payload.CbteFch).toBe('20260318');
  });

  it.each([[{ billingDate: '18/3' }], [{ serviceEndDate: '20/3', serviceStartDate: '1/3' }]])(
    'rejects --dia with an explicit date, because it would be ignored: %j',
    (dates) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

      expect(() =>
        new BillingService().buildVoucherPayload(
          createBillingInput({ concept: 'servicios', dueDay: 25, shortcut: 'fc', ...dates }),
          createRuntime(),
        ),
      ).toThrow(/--dia no se combina con --fecha ni con --servicio-hasta/);
    },
  );

  it('uses the Argentine date at night, even on a UTC machine', () => {
    vi.useFakeTimers();
    // 22:30 del 18/03 en Argentina; en UTC ya es el 19.
    vi.setSystemTime(new Date('2026-03-19T01:30:00Z'));

    const payload = new BillingService().buildVoucherPayload(
      createBillingInput({ concept: 'servicios', dueDay: 25, shortcut: 'fc' }),
      createRuntime(),
    );

    expect(payload.CbteFch).toBe('20260318');
    expect(payload.FchVtoPago).toBe('20260325');
  });

  it('never builds a payload while the IVA condition still waits for the padron', () => {
    expect(() =>
      new BillingService().buildVoucherPayload(
        createBillingInput({ documentNumber: 20201797064, documentType: 'cuit', ivaConditionSource: 'missing' }),
        createRuntime(),
      ),
    ).toThrow(/Falta IVA receptor/);
  });

  it('keeps --dia in the next month when today is the 31st', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T12:00:00Z'));

    const payload = new BillingService().buildVoucherPayload(
      createBillingInput({ concept: 'servicios', dueDay: 15, shortcut: 'fc' }),
      createRuntime(),
    );

    expect(payload.FchServHasta).toBe('20260415');
    expect(payload.FchVtoPago).toBe('20260415');
  });

  it('rolls --dia over to January when it already passed in December', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-20T12:00:00Z'));

    const payload = new BillingService().buildVoucherPayload(
      createBillingInput({ concept: 'servicios', dueDay: 10, shortcut: 'fc' }),
      createRuntime(),
    );

    expect(payload.FchVtoPago).toBe('20270110');
  });

  it('rejects --dia when that day does not exist in the month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T12:00:00Z'));

    expect(() =>
      new BillingService().buildVoucherPayload(
        createBillingInput({ concept: 'servicios', dueDay: 30, shortcut: 'fc' }),
        createRuntime(),
      ),
    ).not.toThrow();
    // 31 ya paso en marzo y abril no tiene 31.
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
    expect(() =>
      new BillingService().buildVoucherPayload(
        createBillingInput({ concept: 'servicios', dueDay: 31, shortcut: 'fc' }),
        createRuntime(),
      ),
    ).toThrow(/--dia 31 no existe en abril de 2026/);
  });

  it('builds invoice payload with explicit billing date in Argentine format', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        billingDate: '18-03-2026',
        concept: 'productos',
        documentNumber: 12345678,
        documentType: 'dni',
        shortcut: 'fb',
        totalAmount: 5000,
      }),
      createRuntime(),
    );

    expect(payload.CbteFch).toBe('20260318');
    expect(payload.FchServDesde).toBeUndefined();
    expect(payload.FchServHasta).toBeUndefined();
    expect(payload.FchVtoPago).toBeUndefined();
  });

  it('accepts slash-separated Argentine dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        billingDate: '18/03/2026',
        concept: 'productos',
        documentNumber: 12345678,
        documentType: 'dni',
        shortcut: 'fb',
      }),
      createRuntime(),
    );

    expect(payload.CbteFch).toBe('20260318');
  });

  it('uses the current year when Argentine dates omit it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T12:00:00Z'));

    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        billingDate: '09-08',
        serviceEndDate: '31/08',
        serviceStartDate: '01/08',
      }),
      createRuntime(),
    );

    expect(payload.CbteFch).toBe('20260809');
    expect(payload.FchServDesde).toBe('20260801');
    expect(payload.FchServHasta).toBe('20260831');
    expect(payload.FchVtoPago).toBe('20260831');
  });

  it('uses the current month and year when Argentine dates only include the day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T12:00:00Z'));

    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        billingDate: '5',
        serviceEndDate: '15',
        serviceStartDate: '05',
      }),
      createRuntime(),
    );

    expect(payload.CbteFch).toBe('20260805');
    expect(payload.FchServDesde).toBe('20260805');
    expect(payload.FchServHasta).toBe('20260815');
    expect(payload.FchVtoPago).toBe('20260815');
  });

  it('rejects ISO date input', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          billingDate: '2026-03-18',
          concept: 'productos',
          documentNumber: 12345678,
          documentType: 'dni',
          shortcut: 'fb',
        }),
        createRuntime(),
      ),
    ).toThrow(/Use D, DD, D-MM, D\/MM, D-MM-YY, D\/MM\/YY, D-MM-YYYY o D\/MM\/YYYY/);
  });

  it('rejects impossible Argentine dates', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          billingDate: '31/02/2026',
          concept: 'productos',
          documentNumber: 12345678,
          documentType: 'dni',
          shortcut: 'fb',
        }),
        createRuntime(),
      ),
    ).toThrow(/La fecha "31\/02\/2026" no es valida/);
  });

  it('requires associated vouchers for credit notes and debit notes', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          documentNumber: 0,
          shortcut: 'nca',
        }),
        createRuntime(),
      ),
    ).toThrow(/requiere comprobante asociado/);
  });

  it('includes associated voucher data when provided', () => {
    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        associatedVoucher: {
          cuit: '20123456789',
          numero: 123,
          puntoVenta: 3,
          tipo: 11,
        },
        documentNumber: 0,
        shortcut: 'ndc',
      }),
      createRuntime(),
    );

    expect(payload.CbtesAsoc).toEqual([
      {
        Cuit: '20123456789',
        Nro: 123,
        PtoVta: 3,
        Tipo: 11,
      },
    ]);
  });

  it('resolves associated voucher type from shortcut when provided', () => {
    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        associatedVoucher: {
          cuit: '20123456789',
          numero: 123,
          puntoVenta: 3,
          shortcut: 'fa',
        },
        documentNumber: 20123456789,
        documentType: 'cuit',
        ivaCondition: 'responsable-inscripto',
        shortcut: 'nca',
      }),
      createRuntime(),
    );

    expect(payload.CbtesAsoc?.[0]?.Tipo).toBe(1);
  });

  it('supports custom currency and exchange rate', () => {
    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        currencyCode: 'USD',
        documentNumber: 0,
        exchangeRate: 1200.5,
      }),
      createRuntime(),
    );

    expect(payload.MonId).toBe('DOL');
    expect(payload.MonCotiz).toBe(1200.5);
    expect(payload.CanMisMonExt).toBe('N');
  });

  it('does not send CanMisMonExt for pesos', () => {
    const service = new BillingService();

    const payload = service.buildVoucherPayload(createBillingInput({ documentNumber: 0 }), createRuntime());

    expect(payload.MonId).toBe('PES');
    expect(payload.MonCotiz).toBe(1);
    expect(payload).not.toHaveProperty('CanMisMonExt');
  });

  it('rejects foreign currency without an explicit exchange rate', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({ currencyCode: 'USD', documentNumber: 0, exchangeRate: undefined }),
        createRuntime(),
      ),
    ).toThrow(/Falta la cotizacion de USD/);
    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({ currencyCode: 'USD', documentNumber: 0, exchangeRate: 1 }),
        createRuntime(),
      ),
    ).toThrow(/Falta la cotizacion de USD/);
  });

  it('rejects an exchange rate other than 1 for pesos', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(createBillingInput({ documentNumber: 0, exchangeRate: 1200 }), createRuntime()),
    ).toThrow(/En pesos la cotizacion debe ser 1/);
  });

  it('rejects --misma-moneda for pesos', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(createBillingInput({ documentNumber: 0, sameCurrency: true }), createRuntime()),
    ).toThrow(/--misma-moneda solo aplica/);
  });

  it('resolves the official exchange rate when paying in the same foreign currency', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();
    const getQuotation = vi.fn(async () => 1415.25);
    const input = await service.resolveExchangeRate(
      createBillingInput({ currencyCode: 'USD', documentNumber: 0, exchangeRate: undefined, sameCurrency: true }),
      {
        createVoucher: async () => {
          throw new Error('No deberia emitirse');
        },
        getNextVoucherNumber: async () => {
          throw new Error('No deberia emitirse');
        },
        getQuotation,
      },
    );
    const payload = service.buildVoucherPayload(input, createRuntime());

    expect(getQuotation).toHaveBeenCalledWith('DOL');
    expect(payload.MonCotiz).toBe(1415.25);
    expect(payload.CanMisMonExt).toBe('S');
  });

  it('does not query the exchange rate when it is not needed', async () => {
    const service = new BillingService();
    const getQuotation = vi.fn(async () => 1415.25);
    const input = createBillingInput({ currencyCode: 'USD', exchangeRate: 1200 });

    await expect(
      service.resolveExchangeRate(input, {
        createVoucher: async () => {
          throw new Error('No deberia emitirse');
        },
        getNextVoucherNumber: async () => {
          throw new Error('No deberia emitirse');
        },
        getQuotation,
      }),
    ).resolves.toBe(input);
    expect(getQuotation).not.toHaveBeenCalled();
  });

  it('rejects --misma-moneda with a past billing date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          billingDate: '17/03/2026',
          currencyCode: 'USD',
          documentNumber: 0,
          exchangeRate: 1415.25,
          sameCurrency: true,
        }),
        createRuntime(),
      ),
    ).toThrow(/no puede ser anterior a hoy/);
  });

  it('discriminates IVA in factura A for a monotributista', () => {
    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        documentNumber: 20123456789,
        documentType: 'cuit',
        ivaCondition: 'responsable-monotributo',
        shortcut: 'fa',
        totalAmount: 121,
      }),
      createRuntime(),
    );

    expect(payload.ImpNeto).toBe(100);
    expect(payload.ImpIVA).toBe(21);
    expect(payload.Iva).toEqual([{ BaseImp: 100, Id: 5, Importe: 21 }]);
  });

  it('rejects receiver IVA conditions that ARCA does not accept for the voucher letter', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(createBillingInput({ documentNumber: 0, shortcut: 'fa' }), createRuntime()),
    ).toThrow(/factura a no admite IVA receptor "consumidor-final". Use un comprobante letra B/);
    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          documentNumber: 20123456789,
          documentType: 'cuit',
          ivaCondition: 'responsable-inscripto',
          shortcut: 'fb',
        }),
        createRuntime(),
      ),
    ).toThrow(/factura b no admite IVA receptor "responsable-inscripto". Use un comprobante letra A/);
  });

  it('accepts any receiver IVA condition for letter C', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          documentNumber: 20123456789,
          documentType: 'cuit',
          ivaCondition: 'responsable-inscripto',
          shortcut: 'fc',
        }),
        createRuntime(),
      ),
    ).not.toThrow();
  });

  it('requires identifying the consumer final from $10.000.000', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({ documentNumber: 0, totalAmount: 9_999_999.99 }),
        createRuntime(),
      ),
    ).not.toThrow();
    expect(() =>
      service.buildVoucherPayload(createBillingInput({ documentNumber: 0, totalAmount: 10_000_000 }), createRuntime()),
    ).toThrow(/requiere identificar al consumidor final/);
    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({ documentNumber: 12345678, documentType: 'dni', totalAmount: 10_000_000 }),
        createRuntime(),
      ),
    ).not.toThrow();
  });

  it('converts foreign currency amounts to pesos for the consumer final threshold', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({ currencyCode: 'USD', documentNumber: 0, exchangeRate: 1000, totalAmount: 10_000 }),
        createRuntime(),
      ),
    ).toThrow(/requiere identificar al consumidor final/);
  });

  it('builds IVA automatically for factura A with responsable inscripto', () => {
    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        documentNumber: 20123456789,
        documentType: 'cuit',
        ivaCondition: 'responsable-inscripto',
        shortcut: 'fa',
        totalAmount: 121,
      }),
      createRuntime(),
    );

    expect(payload.ImpNeto).toBe(100);
    expect(payload.ImpIVA).toBe(21);
    expect(payload.Iva).toEqual([
      {
        BaseImp: 100,
        Id: 5,
        Importe: 21,
      },
    ]);
  });

  it('builds IVA automatically for factura B', () => {
    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        documentNumber: 12345678,
        documentType: 'dni',
        shortcut: 'fb',
        totalAmount: 121,
      }),
      createRuntime(),
    );

    expect(payload.ImpNeto).toBe(100);
    expect(payload.ImpIVA).toBe(21);
    expect(payload.Iva).toEqual([
      {
        BaseImp: 100,
        Id: 5,
        Importe: 21,
      },
    ]);
  });

  it('requires a receiver document when document type is not consumer final', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          documentType: 'cuit',
          ivaCondition: 'responsable-inscripto',
        }),
        createRuntime(),
      ),
    ).toThrow(/requiere documento del receptor/);
  });

  it('rejects consumer final with a non-zero document number', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          documentNumber: 123,
        }),
        createRuntime(),
      ),
    ).toThrow(/consumidor final solo con documento 0/);
  });

  it('rejects consumer final with a non-consumer-final iva condition', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          documentType: 'consumidor-final',
          ivaCondition: 'responsable-inscripto',
        }),
        createRuntime(),
      ),
    ).toThrow(/--ir-cf|consumidor-final/);
  });

  it('rejects cuit or cuil with invalid length', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          documentNumber: 2012345678,
          documentType: 'cuit',
          ivaCondition: 'responsable-inscripto',
        }),
        createRuntime(),
      ),
    ).toThrow(/--cuit debe tener 11 digitos/);
  });

  it('rejects dni with invalid length', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          documentNumber: 123456,
          documentType: 'dni',
        }),
        createRuntime(),
      ),
    ).toThrow(/--dni debe tener 7 u 8 digitos/);
  });

  it('rejects service dates for products concept', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          billingDate: '18-03-2026',
          concept: 'productos',
          documentNumber: 0,
          serviceEndDate: '18-03-2026',
          serviceStartDate: '10-03-2026',
        }),
        createRuntime(),
      ),
    ).toThrow(/no usa fechas de servicio/);
  });

  it('requires both service dates when one is provided', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          billingDate: '18-03-2026',
          documentNumber: 0,
          serviceStartDate: '10-03-2026',
        }),
        createRuntime(),
      ),
    ).toThrow(/debe enviar ambas/);
  });

  it('rejects billing dates outside the ARCA window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();
    const build = (overrides: Partial<BillingCommandInput>) => () =>
      service.buildVoucherPayload(createBillingInput({ documentNumber: 0, ...overrides }), createRuntime());

    expect(build({ billingDate: '13/03/2026', concept: 'productos' })).not.toThrow();
    expect(build({ billingDate: '12/03/2026', concept: 'productos' })).toThrow(/hasta 5 dias antes y 5 despues/);
    expect(build({ billingDate: '08/03/2026' })).not.toThrow();
    expect(build({ billingDate: '07/03/2026' })).toThrow(/hasta 10 dias antes y 10 despues/);
    expect(build({ billingDate: '28/03/2026' })).not.toThrow();
    expect(build({ billingDate: '29/03/2026' })).toThrow(/hasta 10 dias antes y 10 despues/);
  });

  it('rejects future product dates in another month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T12:00:00Z'));

    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({ billingDate: '01/04/2026', concept: 'productos', documentNumber: 0 }),
        createRuntime(),
      ),
    ).toThrow(/futura y cae en otro mes/);
  });

  it('uses the FCE billing date window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();
    const build = (billingDate: string) => () =>
      service.buildVoucherPayload(
        createBillingInput({
          billingDate,
          documentNumber: 20123456789,
          documentType: 'cuit',
          cbu: '0110599520000012345678',
          ivaCondition: 'responsable-inscripto',
          shortcut: 'fcea',
        }),
        createRuntime(),
      );

    expect(build('19/03/2026')).not.toThrow();
    expect(build('20/03/2026')).toThrow(/hasta 5 dias antes y 1 despues/);
    expect(build('12/03/2026')).toThrow(/hasta 5 dias antes y 1 despues/);
  });

  it('sends FchVtoPago on FCE invoices even for products', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        billingDate: '16/03/2026',
        concept: 'productos',
        documentNumber: 20123456789,
        documentType: 'cuit',
        cbu: '0110599520000012345678',
        ivaCondition: 'responsable-inscripto',
        shortcut: 'fcea',
      }),
      createRuntime(),
    );

    expect(payload.FchServDesde).toBeUndefined();
    expect(payload.FchVtoPago).toBe('20260318');
  });

  it('rejects an FCE payment due date before today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          billingDate: '16/03/2026',
          documentNumber: 20123456789,
          documentType: 'cuit',
          ivaCondition: 'responsable-inscripto',
          cbu: '0110599520000012345678',
          paymentDueDate: '17/03/2026',
          shortcut: 'fcea',
        }),
        createRuntime(),
      ),
    ).toThrow(/no puede ser anterior al 18\/03\/2026/);
  });

  it('does not send FchVtoPago on FCE credit or debit notes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();
    const input = createBillingInput({
      associatedVoucher: { cuit: '20123456789', fecha: '10/03/2026', numero: 1, puntoVenta: 3, shortcut: 'fcea' },
      documentNumber: 20123456789,
      documentType: 'cuit',
      ivaCondition: 'responsable-inscripto',
      shortcut: 'ncea',
    });

    expect(service.buildVoucherPayload(input, createRuntime()).FchVtoPago).toBeUndefined();
    expect(() => service.buildVoucherPayload({ ...input, paymentDueDate: '30/03/2026' }, createRuntime())).toThrow(
      /no lleva vencimiento de pago/,
    );
  });

  it('accepts an explicit payment due date independent from the service period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        billingDate: '18/03/2026',
        documentNumber: 0,
        paymentDueDate: '10/04/2026',
        serviceEndDate: '28/02/2026',
        serviceStartDate: '01/02/2026',
      }),
      createRuntime(),
    );

    expect(payload.FchServHasta).toBe('20260228');
    expect(payload.FchVtoPago).toBe('20260410');
  });

  it('defaults the payment due date to the billing date when the service ended earlier', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();

    const payload = service.buildVoucherPayload(
      createBillingInput({
        billingDate: '18/03/2026',
        documentNumber: 0,
        serviceEndDate: '28/02/2026',
        serviceStartDate: '01/02/2026',
      }),
      createRuntime(),
    );

    expect(payload.FchVtoPago).toBe('20260318');
  });

  it('rejects a payment due date before the billing date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({ billingDate: '18/03/2026', documentNumber: 0, paymentDueDate: '17/03/2026' }),
        createRuntime(),
      ),
    ).toThrow(/no puede ser anterior al 18\/03\/2026/);
  });

  it('rejects --vencimiento on product invoices', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({ concept: 'productos', documentNumber: 0, paymentDueDate: '30/03/2026' }),
        createRuntime(),
      ),
    ).toThrow(/no usa --vencimiento/);
  });

  describe('periodo asociado', () => {
    const periodNote = (overrides: Partial<BillingCommandInput> = {}) =>
      createBillingInput({
        associatedPeriod: { desde: '01/02/2026', hasta: '28/02/2026' },
        billingDate: '18/03/2026',
        documentNumber: 0,
        shortcut: 'ncb',
        ...overrides,
      });

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));
    });

    it('sends PeriodoAsoc instead of CbtesAsoc on regular notes', () => {
      const payload = new BillingService().buildVoucherPayload(periodNote(), createRuntime());

      expect(payload.PeriodoAsoc).toEqual({ FchDesde: '20260201', FchHasta: '20260228' });
      expect(payload.CbtesAsoc).toBeUndefined();
    });

    it('requires both period dates', () => {
      expect(() =>
        new BillingService().buildVoucherPayload(
          periodNote({ associatedPeriod: { desde: '01/02/2026' } }),
          createRuntime(),
        ),
      ).toThrow(/requiere ambas fechas/);
    });

    it('rejects a period together with an associated voucher', () => {
      expect(() =>
        new BillingService().buildVoucherPayload(
          periodNote({ associatedVoucher: { cuit: '20123456789', numero: 1, puntoVenta: 3, shortcut: 'fb' } }),
          createRuntime(),
        ),
      ).toThrow(/pero no ambos/);
    });

    it('rejects a period ending after the note date', () => {
      expect(() =>
        new BillingService().buildVoucherPayload(
          periodNote({ associatedPeriod: { desde: '01/03/2026', hasta: '19/03/2026' } }),
          createRuntime(),
        ),
      ).toThrow(/no puede terminar despues/);
    });

    it('rejects an inverted period', () => {
      expect(() =>
        new BillingService().buildVoucherPayload(
          periodNote({ associatedPeriod: { desde: '28/02/2026', hasta: '01/02/2026' } }),
          createRuntime(),
        ),
      ).toThrow(/no puede ser posterior/);
    });

    it('rejects periods before 2006', () => {
      expect(() =>
        new BillingService().buildVoucherPayload(
          periodNote({ associatedPeriod: { desde: '01/12/2005', hasta: '31/12/2005' } }),
          createRuntime(),
        ),
      ).toThrow(/posterior al 01\/01\/2006/);
    });

    it('rejects a period on invoices and FCE notes', () => {
      const service = new BillingService();

      expect(() => service.buildVoucherPayload(periodNote({ shortcut: 'fb' }), createRuntime())).toThrow(
        /no usa periodo asociado/,
      );
      expect(() =>
        service.buildVoucherPayload(
          periodNote({
            documentNumber: 30709965812,
            documentType: 'cuit',
            ivaCondition: 'responsable-inscripto',
            shortcut: 'ncea',
          }),
          createRuntime(),
        ),
      ).toThrow(/no admite periodo asociado/);
    });

    it('mentions the period alternative when a regular note has no association', () => {
      expect(() =>
        new BillingService().buildVoucherPayload(periodNote({ associatedPeriod: undefined }), createRuntime()),
      ).toThrow(/o un periodo con --periodo-desde y --periodo-hasta/);
    });
  });

  describe('resolveFceWarnings', () => {
    const rejectingGateway = {
      getObligation: async () => {
        throw new Error('El certificado no esta autorizado para el servicio wsfecred.');
      },
    };

    it('queries the receiver CUIT with the billing date and amount in pesos', async () => {
      const getObligation = vi.fn(async () => ({ minimumAmount: 3_958_316, obligated: true }));
      const warnings = await new BillingService().resolveFceWarnings(
        createBillingInput({
          billingDate: '15/03/2026',
          currencyCode: 'USD',
          documentNumber: 30709965812,
          documentType: 'cuit',
          exchangeRate: 1000,
          ivaCondition: 'responsable-inscripto',
          shortcut: 'fa',
          totalAmount: 5000,
        }),
        { getObligation },
      );

      expect(getObligation).toHaveBeenCalledWith(30709965812, '20260315');
      expect(warnings).toEqual([expect.stringContaining('Corresponde emitir fcea en lugar de fa')]);
    });

    it('skips vouchers that do not depend on the FCE regime', async () => {
      const getObligation = vi.fn();

      await expect(
        new BillingService().resolveFceWarnings(createBillingInput({ documentNumber: 0 }), { getObligation }),
      ).resolves.toEqual([]);
      expect(getObligation).not.toHaveBeenCalled();
    });

    it('turns query failures into a warning instead of blocking', async () => {
      const warnings = await new BillingService().resolveFceWarnings(
        createBillingInput({
          documentNumber: 30709965812,
          documentType: 'cuit',
          ivaCondition: 'responsable-inscripto',
          shortcut: 'fa',
        }),
        rejectingGateway,
      );

      expect(warnings).toEqual([
        'No se pudo verificar el regimen FCE del receptor: El certificado no esta autorizado para el servicio wsfecred.',
      ]);
    });
  });

  describe('factura de credito electronica', () => {
    const fceInvoice = (overrides: Partial<BillingCommandInput> = {}) =>
      createBillingInput({
        billingDate: '18/03/2026',
        cbu: '0110599520000012345678',
        documentNumber: 30709965812,
        documentType: 'cuit',
        ivaCondition: 'responsable-inscripto',
        shortcut: 'fcea',
        ...overrides,
      });
    const fceNote = (overrides: Partial<BillingCommandInput> = {}) =>
      createBillingInput({
        associatedVoucher: { fecha: '10/03/2026', numero: 7, puntoVenta: 3, shortcut: 'fcea' },
        billingDate: '18/03/2026',
        documentNumber: 30709965812,
        documentType: 'cuit',
        ivaCondition: 'responsable-inscripto',
        shortcut: 'ncea',
        ...overrides,
      });

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));
    });

    it('sends CBU and the default SCA transfer mode on FCE invoices', () => {
      const payload = new BillingService().buildVoucherPayload(fceInvoice(), createRuntime());

      expect(payload.Opcionales).toEqual([
        { Id: '2101', Valor: '0110599520000012345678' },
        { Id: '27', Valor: 'SCA' },
      ]);
    });

    it('sends the CBU alias and the chosen transfer mode', () => {
      const payload = new BillingService().buildVoucherPayload(
        fceInvoice({ cbuAlias: 'mi.alias.cbu', transferMode: 'adc' }),
        createRuntime(),
      );

      expect(payload.Opcionales).toEqual([
        { Id: '2101', Valor: '0110599520000012345678' },
        { Id: '2102', Valor: 'mi.alias.cbu' },
        { Id: '27', Valor: 'ADC' },
      ]);
    });

    it('requires the CBU on FCE invoices', () => {
      expect(() => new BillingService().buildVoucherPayload(fceInvoice({ cbu: undefined }), createRuntime())).toThrow(
        /requiere el CBU del emisor/,
      );
    });

    it('rejects --anulacion on FCE invoices', () => {
      expect(() =>
        new BillingService().buildVoucherPayload(fceInvoice({ cancellation: true }), createRuntime()),
      ).toThrow(/no usa --anulacion/);
    });

    it('sends the cancellation code, associated date and emitter CUIT on FCE notes', () => {
      const service = new BillingService();
      const regular = service.buildVoucherPayload(fceNote(), createRuntime());
      const cancellation = service.buildVoucherPayload(fceNote({ cancellation: true }), createRuntime());

      expect(regular.Opcionales).toEqual([{ Id: '22', Valor: 'N' }]);
      expect(cancellation.Opcionales).toEqual([{ Id: '22', Valor: 'S' }]);
      expect(regular.CbtesAsoc).toEqual([{ CbteFch: '20260310', Cuit: '20123456789', Nro: 7, PtoVta: 3, Tipo: 201 }]);
    });

    it('rejects invoice-only optionals on FCE notes', () => {
      expect(() =>
        new BillingService().buildVoucherPayload(fceNote({ cbu: '0110599520000012345678' }), createRuntime()),
      ).toThrow(/no lleva --cbu/);
    });

    it('requires the associated voucher date on FCE notes', () => {
      expect(() =>
        new BillingService().buildVoucherPayload(
          fceNote({ associatedVoucher: { numero: 7, puntoVenta: 3, shortcut: 'fcea' } }),
          createRuntime(),
        ),
      ).toThrow(/requiere la fecha del comprobante asociado/);
    });

    it('rejects an associated voucher date after the note date', () => {
      expect(() =>
        new BillingService().buildVoucherPayload(
          fceNote({ associatedVoucher: { fecha: '19/03/2026', numero: 7, puntoVenta: 3, shortcut: 'fcea' } }),
          createRuntime(),
        ),
      ).toThrow(/no puede ser posterior/);
    });

    it('rejects an associated CUIT different from the emitter on FCE notes', () => {
      expect(() =>
        new BillingService().buildVoucherPayload(
          fceNote({
            associatedVoucher: { cuit: '20999999999', fecha: '10/03/2026', numero: 7, puntoVenta: 3, shortcut: 'fcea' },
          }),
          createRuntime(),
        ),
      ).toThrow(/tiene que ser del CUIT emisor/);
    });

    it('rejects FCE optionals on regular vouchers', () => {
      expect(() =>
        new BillingService().buildVoucherPayload(
          createBillingInput({ billingDate: '18/03/2026', cbu: '0110599520000012345678', documentNumber: 0 }),
          createRuntime(),
        ),
      ).toThrow(/--cbu solo aplica a comprobantes de credito electronica/);
    });

    it('keeps the associated date optional on regular credit notes', () => {
      const payload = new BillingService().buildVoucherPayload(
        createBillingInput({
          associatedVoucher: { cuit: '20123456789', fecha: '10/03/2026', numero: 7, puntoVenta: 3, shortcut: 'fb' },
          billingDate: '18/03/2026',
          documentNumber: 0,
          shortcut: 'ncb',
        }),
        createRuntime(),
      );

      expect(payload.CbtesAsoc?.[0]?.CbteFch).toBe('20260310');
      expect(payload.Opcionales).toBeUndefined();
    });
  });

  it('rejects invalid service date ranges', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          billingDate: '18-03-2026',
          documentNumber: 0,
          serviceEndDate: '10-03-2026',
          serviceStartDate: '20-03-2026',
        }),
        createRuntime(),
      ),
    ).toThrow(/inicio de servicio no puede ser posterior/);
  });

  it('rejects associated vouchers on invoice types that do not support them', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          associatedVoucher: {
            cuit: '20123456789',
            numero: 99,
            puntoVenta: 3,
            tipo: 11,
          },
          documentNumber: 0,
        }),
        createRuntime(),
      ),
    ).toThrow(/no usa comprobante asociado/);
  });

  it('rejects associated vouchers with a different letter when shortcut is provided', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          associatedVoucher: {
            cuit: '20123456789',
            numero: 99,
            puntoVenta: 3,
            shortcut: 'fc',
          },
          documentNumber: 0,
          shortcut: 'nca',
        }),
        createRuntime(),
      ),
    ).toThrow(/misma letra/);
  });

  it('validates a numeric --at like a shortcut: an NC A cannot point to a Factura B', () => {
    expect(() =>
      new BillingService().buildVoucherPayload(
        createBillingInput({
          associatedVoucher: { cuit: '20123456789', numero: 99, puntoVenta: 3, tipo: 6 },
          documentNumber: 20123456789,
          documentType: 'cuit',
          ivaCondition: 'responsable-inscripto',
          shortcut: 'nca',
        }),
        createRuntime(),
      ),
    ).toThrow(/misma letra/);
  });

  it('rejects a shortcut and a numeric type that do not match', () => {
    expect(() =>
      new BillingService().buildVoucherPayload(
        createBillingInput({
          associatedVoucher: { cuit: '20123456789', numero: 99, puntoVenta: 3, shortcut: 'fa', tipo: 6 },
          documentNumber: 20123456789,
          documentType: 'cuit',
          ivaCondition: 'responsable-inscripto',
          shortcut: 'nca',
        }),
        createRuntime(),
      ),
    ).toThrow(/El atajo "fa" es el tipo 1, no el 6/);
  });

  it('rejects associated vouchers that are not invoices when shortcut is provided', () => {
    const service = new BillingService();

    expect(() =>
      service.buildVoucherPayload(
        createBillingInput({
          associatedVoucher: {
            cuit: '20123456789',
            numero: 99,
            puntoVenta: 3,
            shortcut: 'nda',
          },
          documentNumber: 0,
          shortcut: 'nca',
        }),
        createRuntime(),
      ),
    ).toThrow(/debe ser una factura, no otra nota/);
  });

  it('returns a mapped dry-run response without calling the gateway', async () => {
    const service = new BillingService();

    const result = await service.execute({
      gateway: {
        createVoucher: async () => {
          throw new Error('No deberia ejecutarse en dry-run');
        },
        getNextVoucherNumber: async () => {
          throw new Error('No deberia ejecutarse en dry-run');
        },
        getQuotation: async () => {
          throw new Error('No deberia consultarse la cotizacion');
        },
      },
      input: createBillingInput({
        documentNumber: 0,
      }),
      runtime: createRuntime(),
    });

    expect(result.dryRun).toBe(true);
    expect(result.response).toMatchObject({
      cae: null,
      errors: [],
      events: [],
      resultado: null,
    });
  });

  it('flags a failed createVoucher call as uncertain, because the voucher may have been issued', async () => {
    const service = new BillingService();
    const run = service.execute({
      gateway: {
        createVoucher: async () => {
          throw new Error('socket hang up');
        },
        getNextVoucherNumber: async () => 42,
        getQuotation: async () => 1,
      },
      input: createBillingInput({ documentNumber: 0, dryRun: false, emit: true }),
      runtime: createRuntime(),
    });

    await expect(run).rejects.toBeInstanceOf(EmissionUncertainError);
    await expect(run).rejects.toThrow('No se pudo confirmar la emision: socket hang up');
    await expect(run).rejects.toMatchObject({
      code: 'EMISSION_UNCERTAIN',
      suggestion: expect.stringContaining('arcli ultimos fb --pv 3'),
    });
  });

  it.each([
    ['an authentication (WSAA) failure', 'Certificado expirado'],
    ['a failure fetching the last voucher number', 'ARCA no disponible'],
  ])('does not flag %s as uncertain, because nothing was sent to ARCA', async (_case, message) => {
    const service = new BillingService();
    const cause = new Error(message);
    const createVoucher = vi.fn();
    const run = service.execute({
      gateway: {
        createVoucher,
        getNextVoucherNumber: async () => {
          throw cause;
        },
        getQuotation: async () => 1,
      },
      input: createBillingInput({ documentNumber: 0, dryRun: false, emit: true }),
      runtime: createRuntime(),
    });

    await expect(run).rejects.toBe(cause);
    await expect(run).rejects.not.toBeInstanceOf(EmissionUncertainError);
    expect(createVoucher).not.toHaveBeenCalled();
  });

  it('emits the next voucher number with the same payload and maps the response', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));

    const service = new BillingService();
    const arcaResult = {
      cae: '76123456789012',
      caeFchVto: '20261029',
      response: { FeDetResp: { FECAEDetResponse: [{ CbteDesde: 42, CbteHasta: 42, Resultado: 'A' }] } },
    };
    const getNextVoucherNumber = vi.fn(async () => 42);
    const createVoucher = vi.fn(async () => arcaResult as never);
    const input = createBillingInput({ documentNumber: 0, dryRun: false, emit: true });
    const payload = service.buildVoucherPayload(input, createRuntime());

    const result = await service.execute({
      gateway: { createVoucher, getNextVoucherNumber, getQuotation: async () => 1 },
      input,
      runtime: createRuntime(),
    });

    expect(getNextVoucherNumber).toHaveBeenCalledWith(payload.PtoVta, payload.CbteTipo);
    expect(createVoucher).toHaveBeenCalledWith({ ...payload, CbteDesde: 42, CbteHasta: 42 });
    expect(result.dryRun).toBe(false);
    expect(result.payload).toEqual(payload);
    expect(result.response).toEqual(mapBillingResponse(arcaResult as never));
  });

  it('maps the empty CAE of a rejected voucher to null', () => {
    const summary = mapBillingResponse({
      cae: '',
      caeFchVto: '',
      response: { FeDetResp: { FECAEDetResponse: [{ Resultado: 'R' }] } },
    } as never);

    expect(summary).toMatchObject({ cae: null, caeVencimiento: null, status: 'rechazado' });
  });

  it('suggests a web service point of sale when ARCA rejects it with code 10005', () => {
    const summary = mapBillingResponse({
      cae: '',
      caeFchVto: '',
      response: {
        Errors: {
          Err: [{ Code: 10005, Msg: 'El punto de venta informado debe estar dado de alta y ser del tipo RECE.' }],
        },
      },
    } as never);

    expect(summary.status).toBe('rechazado');
    expect(summary.suggestions).toEqual([expect.stringContaining('Factura en linea')]);
    expect(summary.suggestions[0]).toContain('obtencion-certificados.md#punto-de-venta-para-web-service');
  });

  it('recognizes the point of sale rejection by its message when the code is missing', () => {
    const summary = mapBillingResponse({
      cae: '',
      caeFchVto: '',
      response: {
        Errors: { Err: [{ Msg: 'El punto de venta informado debe estar dado de alta y ser del tipo RECE.' }] },
      },
    } as never);

    expect(summary.suggestions).toEqual([expect.stringContaining('arcli parametros puntos-venta')]);
  });

  it('does not suggest a point of sale fix for unrelated rejections', () => {
    const summary = mapBillingResponse({
      cae: '',
      caeFchVto: '',
      response: {
        Errors: { Err: [{ Code: 10016, Msg: 'El numero de comprobante no es el proximo a autorizar.' }] },
        FeDetResp: { FECAEDetResponse: [{ Resultado: 'R' }] },
      },
    } as never);

    expect(summary.suggestions.join(' ')).not.toContain('Factura en linea');
  });

  it('maps ARCA responses into a stable summary', () => {
    const summary = mapBillingResponse({
      cae: '12345678901234',
      caeFchVto: '20260331',
      response: {
        Errors: {
          Err: [{ Code: 1000, Msg: 'Error de prueba' }],
        },
        Events: {
          Evt: [{ Code: 1, Msg: 'Evento de prueba' }],
        },
        FeDetResp: {
          FECAEDetResponse: [
            {
              Observaciones: {
                Obs: [{ Msg: 'Observacion de prueba' }],
              },
              Resultado: 'A',
            },
          ],
        },
      },
    } as never);

    expect(summary).toMatchObject({
      cae: '12345678901234',
      caeVencimiento: '20260331',
      observacion: 'Observacion de prueba',
      resultado: 'A',
    });
    expect(summary.events).toHaveLength(1);
    expect(summary.errors).toHaveLength(1);
  });
});
