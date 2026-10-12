import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BillingService } from '../../../modules/billing/billing.service';
import { BACK, runWizard } from '../../../modules/interactive/wizard';
import type { IssuedVoucher, VoucherHistoryGateway } from '../../../modules/vouchers/voucher-history';
import type { ResolvedArcaRuntime } from '../../../services/arca/arca-context.resolver';
import { stripAnsi } from '../../../ui';
import { runHistoryFlow } from '../history.flow';
import { buildInvoiceInput, invoiceSteps } from '../invoice.flow';
import { buildNoteInput, noteSteps } from '../note.flow';
import { repeatSteps } from '../repeat.flow';
import type { InteractiveSession } from '../session';

import { createScript, onlyChoices } from './script';

let script = createScript([]);

vi.mock('../prompts', () => ({
  askTextStep: (...args: Parameters<typeof script.askTextStep>) => script.askTextStep(...args),
  chooseManyStep: (...args: Parameters<typeof script.chooseManyStep>) => script.chooseManyStep(...args),
  chooseStep: (...args: Parameters<typeof script.chooseStep>) => script.chooseStep(...args),
  chooseStepWhileLoading: (...args: Parameters<typeof script.chooseStepWhileLoading>) =>
    script.chooseStepWhileLoading(...args),
  eraseLastAnswer: () => undefined,
  fitPageSize: () => 12,
}));

function createSession(vouchers: IssuedVoucher[] = []): InteractiveSession {
  const historyGateway: VoucherHistoryGateway = {
    getLastNumber: async () => vouchers.reduce((max, voucher) => Math.max(max, voucher.number), 0),
    getVoucher: async (number) => vouchers.find((voucher) => voucher.number === number),
  };

  return {
    arca: {} as never,
    billingGateway: { createNextVoucher: vi.fn(), getQuotation: vi.fn() },
    historyGateway,
    runtime: {
      config: { cert: {}, entornoPorDefecto: 'testing', key: {}, output: {} },
      context: { cuit: 20409509763 },
      environment: 'testing',
      outputJson: false,
      outputRaw: false,
      pointOfSale: 3,
    } as unknown as ResolvedArcaRuntime,
    service: new BillingService(),
  };
}

const invoice = (overrides: Partial<IssuedVoucher> = {}): IssuedVoucher => ({
  cae: '86400940834693',
  concept: 2,
  date: '20261001',
  documentNumber: 0,
  documentTypeCode: 99,
  ivaAmount: 21,
  netAmount: 100,
  number: 14,
  total: 121,
  ...overrides,
});

describe('flujos del modo interactivo', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    expect(script.remaining()).toBe(0);
  });

  describe('factura', () => {
    it('arma una factura C y permite volver a cambiar una respuesta', async () => {
      script = createScript([
        [/comprobante/, 'Factura C'],
        [/A quien/, 'Consumidor final'],
        [/Que estas facturando/, 'Servicios'],
        [/Monto total/, BACK],
        [/Que estas facturando/, 'Productos'],
        [/Monto total/, '1.500,50'],
        [/Agregamos/, []],
      ]);

      const session = createSession();
      const state = await runWizard(invoiceSteps(session), { advanced: { currencyCode: 'ARS', sameCurrency: false } });
      const input = buildInvoiceInput(state as NonNullable<typeof state>, session);

      expect(input).toMatchObject({
        concept: 'productos',
        documentType: 'consumidor-final',
        ivaCondition: 'consumidor-final',
        shortcut: 'fc',
        totalAmount: 1500.5,
      });
      expect(script.asked.some((question) => /alicuota/i.test(question))).toBe(false);
    });

    it('arma una FCE A con CUIT y CBU, y alicuota, vencimiento y transferencia como opcionales', async () => {
      script = createScript([
        [/comprobante/, 'Factura de credito electronica A'],
        [/A quien/, 'Con CUIT'],
        [/CUIT del receptor/, '30-70996581-2'],
        [/Condicion frente al IVA/, 'Responsable inscripto'],
        [/Que estas facturando/, 'Servicios'],
        [/Monto total/, '1105'],
        [/CBU/, '0110599520000012345678'],
        [/Agregamos/, ['Modalidad', 'Alicuota', 'Vencimiento']],
        [/Alicuota/, '10,5%'],
        [/Vencimiento del pago/, '30/10'],
        [/Modalidad de transferencia/, 'ADC'],
      ]);

      const session = createSession();
      const state = await runWizard(invoiceSteps(session), { advanced: { currencyCode: 'ARS', sameCurrency: false } });

      expect(buildInvoiceInput(state as NonNullable<typeof state>, session)).toMatchObject({
        cbu: '0110599520000012345678',
        documentNumber: 30709965812,
        documentType: 'cuit',
        ivaRate: '10.5',
        paymentDueDate: '30/10',
        shortcut: 'fcea',
        transferMode: 'adc',
      });
    });

    it('suma moneda extranjera y exento desde las opciones avanzadas', async () => {
      script = createScript([
        [/comprobante/, 'Factura B'],
        [/A quien/, 'Consumidor final'],
        [/Que estas facturando/, 'Servicios'],
        [/Monto total/, '1210'],
        [/Agregamos/, ['Moneda extranjera', 'Importe exento']],
        [/Moneda del comprobante/, 'Dolares'],
        [/Como te pagan/, 'En dolares'],
        [/exenta/, '50'],
        [/no gravada/, ''],
      ]);

      const session = createSession();
      const state = await runWizard(invoiceSteps(session), { advanced: { currencyCode: 'ARS', sameCurrency: false } });

      expect(buildInvoiceInput(state as NonNullable<typeof state>, session)).toMatchObject({
        currencyCode: 'USD',
        exemptAmount: 50,
        ivaRate: undefined,
        sameCurrency: true,
        untaxedAmount: undefined,
      });
    });

    it('sin marcar opcionales usa la alicuota de la config', async () => {
      script = createScript([
        [/comprobante/, 'Factura B'],
        [/A quien/, 'Consumidor final'],
        [/Que estas facturando/, 'Productos'],
        [/Monto total/, '1105'],
        [/Agregamos/, []],
      ]);

      const session = createSession();

      (session.runtime.config as { alicuotaPorDefecto?: string }).alicuotaPorDefecto = '10.5';

      const state = await runWizard(invoiceSteps(session), { advanced: { currencyCode: 'ARS', sameCurrency: false } });

      expect(buildInvoiceInput(state as NonNullable<typeof state>, session).ivaRate).toBe('10.5');
      expect(script.asked.some((question) => /Alicuota/.test(question))).toBe(false);
    });

    it('volver dentro de un opcional vuelve a la seleccion con lo ya respondido', async () => {
      script = createScript([
        [/comprobante/, 'Factura B'],
        [/A quien/, 'Consumidor final'],
        [/Que estas facturando/, 'Servicios'],
        [/Monto total/, '1210'],
        [/Agregamos/, ['Alicuota', 'Periodo']],
        [/Alicuota/, '10,5%'],
        [/Servicio desde/, BACK],
        [/Agregamos/, ['Alicuota']],
        [/Alicuota/, '10,5%'],
      ]);

      const session = createSession();
      const state = await runWizard(invoiceSteps(session), { advanced: { currencyCode: 'ARS', sameCurrency: false } });
      const input = buildInvoiceInput(state as NonNullable<typeof state>, session);

      expect(input.ivaRate).toBe('10.5');
      expect(input.serviceStartDate).toBeUndefined();
      expect(script.chooseManyStep.mock.calls[1][1]).toContainEqual(
        expect.objectContaining({ description: '10,5%', value: 'alicuota' }),
      );
    });

    it('volver en la seleccion de opcionales vuelve al monto', async () => {
      script = createScript([
        [/comprobante/, 'Factura C'],
        [/A quien/, 'Consumidor final'],
        [/Que estas facturando/, 'Servicios'],
        [/Monto total/, '100'],
        [/Agregamos/, BACK],
        [/Monto total/, '200'],
        [/Agregamos/, []],
      ]);

      const session = createSession();
      const state = await runWizard(invoiceSteps(session), { advanced: { currencyCode: 'ARS', sameCurrency: false } });

      expect(buildInvoiceInput(state as NonNullable<typeof state>, session).totalAmount).toBe(200);
    });

    it('volver en la primera pregunta sale del flujo', async () => {
      script = createScript([[/comprobante/, BACK]]);

      expect(
        await runWizard(invoiceSteps(createSession()), { advanced: { currencyCode: 'ARS', sameCurrency: false } }),
      ).toBeUndefined();
    });
  });

  describe('repetir factura', () => {
    const today = new Date('2026-10-05T15:00:00Z');

    it('copia receptor, concepto, monto y alicuota con el periodo del mes pasado', async () => {
      script = createScript([
        [/tipo de factura queres repetir/, 'Factura A'],
        [/Cual repetimos/, '00003-00000014'],
        [/Condicion frente al IVA/, 'Responsable inscripto'],
        [/Mismo monto/, 'Si'],
        [/Periodo del servicio/, 'El mes pasado'],
        [/Agregamos/, []],
      ]);

      const session = createSession([invoice({ documentNumber: 30709965812, documentTypeCode: 80 })]);
      const state = await runWizard(repeatSteps(session, 3, today), {
        advanced: { currencyCode: 'ARS', sameCurrency: false },
      });

      expect(buildInvoiceInput(state as NonNullable<typeof state>, session)).toMatchObject({
        concept: 'servicios',
        documentNumber: 30709965812,
        documentType: 'cuit',
        ivaCondition: 'responsable-inscripto',
        ivaRate: undefined,
        serviceEndDate: '30/09/2026',
        serviceStartDate: '1/09/2026',
        shortcut: 'fa',
        totalAmount: 121,
      });
      expect(script.chooseManyStep.mock.calls[0][1]).toContainEqual(
        expect.objectContaining({ description: '1/09/2026 al 30/09/2026', value: 'servicio' }),
      );
    });

    it('permite otro monto y en consumidor final no pregunta el IVA', async () => {
      script = createScript([
        [/tipo de factura queres repetir/, 'Factura C'],
        [/Cual repetimos/, '00003-00000014'],
        [/Mismo monto/, 'No'],
        [/Monto total/, '2000'],
        [/Periodo del servicio/, 'Este mes'],
        [/Agregamos/, []],
      ]);

      const session = createSession([invoice({ ivaAmount: 0, netAmount: 121 })]);
      const state = await runWizard(repeatSteps(session, 3, today), {
        advanced: { currencyCode: 'ARS', sameCurrency: false },
      });

      expect(buildInvoiceInput(state as NonNullable<typeof state>, session)).toMatchObject({
        documentType: 'consumidor-final',
        serviceEndDate: '31/10/2026',
        serviceStartDate: '1/10/2026',
        shortcut: 'fc',
        totalAmount: 2000,
      });
    });

    it('copia exento y no gravado de la factura', async () => {
      script = createScript([
        [/tipo de factura queres repetir/, 'Factura A'],
        [/Cual repetimos/, '00003-00000014'],
        [/Condicion frente al IVA/, 'Responsable inscripto'],
        [/Mismo monto/, 'Si'],
        [/Periodo del servicio/, 'Solo hoy'],
        [/Agregamos/, []],
      ]);

      const session = createSession([
        invoice({ documentNumber: 30709965812, documentTypeCode: 80, exemptAmount: 50, total: 196, untaxedAmount: 25 }),
      ]);
      const state = await runWizard(repeatSteps(session, 3, today), {
        advanced: { currencyCode: 'ARS', sameCurrency: false },
      });

      expect(buildInvoiceInput(state as NonNullable<typeof state>, session)).toMatchObject({
        exemptAmount: 50,
        totalAmount: 196,
        untaxedAmount: 25,
      });
    });

    it('con varias alicuotas no ofrece el mismo monto y pide elegir la alicuota', async () => {
      script = createScript([
        [/tipo de factura queres repetir/, 'Factura A'],
        [/Cual repetimos/, '00003-00000014'],
        [/Condicion frente al IVA/, 'Responsable inscripto'],
        [/Monto total/, '1.210'],
        [/Periodo del servicio/, 'Solo hoy'],
        [/Agregamos/, []],
      ]);

      const session = createSession([
        invoice({
          documentNumber: 30709965812,
          documentTypeCode: 80,
          ivaAmount: 262.5,
          netAmount: 1500,
          total: 1762.5,
        }),
      ]);
      const state = await runWizard(repeatSteps(session, 3, today), {
        advanced: { currencyCode: 'ARS', sameCurrency: false },
      });

      expect(state?.totalAmount).toBe(1210);
      expect(script.chooseManyStep.mock.calls[0][2]).toEqual(['alicuota']);
    });

    it('si la factura era en dolares arranca con la moneda marcada', async () => {
      script = createScript([
        [/tipo de factura queres repetir/, 'Factura C'],
        [/Cual repetimos/, '00003-00000014'],
        [/Mismo monto/, 'Si'],
        [/Periodo del servicio/, 'Solo hoy'],
        [/Agregamos/, ['Moneda extranjera']],
        [/Moneda del comprobante/, 'Dolares'],
        [/Como te pagan/, 'En dolares'],
      ]);

      const session = createSession([invoice({ currency: 'DOL', ivaAmount: 0, netAmount: 121 })]);
      const state = await runWizard(repeatSteps(session, 3, today), {
        advanced: { currencyCode: 'ARS', sameCurrency: false },
      });

      expect(buildInvoiceInput(state as NonNullable<typeof state>, session)).toMatchObject({
        currencyCode: 'USD',
        sameCurrency: true,
      });
      expect(script.chooseManyStep.mock.calls[0][2]).toEqual(['divisas']);
    });
  });

  describe('notas', () => {
    it('arma una NC por el total sobre una factura de la lista', async () => {
      script = createScript([
        [/tipo de factura/, 'Factura B'],
        [/A que la asociamos/, 'A una factura'],
        [/Sobre que Factura B/, '00003-00000014'],
        [/Total o parcial/, 'Anular el total'],
      ]);

      const session = createSession([invoice()]);
      const state = await runWizard(noteSteps(session, 3), { kind: 'credito' });

      expect(buildNoteInput(state as NonNullable<typeof state>, session, 3)).toMatchObject({
        associatedVoucher: { cuit: '20409509763', fecha: '01/10/2026', numero: 14, puntoVenta: 3, shortcut: 'fb' },
        documentType: 'consumidor-final',
        ivaRate: undefined,
        shortcut: 'ncb',
        totalAmount: 121,
      });
    });

    it('una NC sobre una factura en dolares va en dolares y, si la anula entera, copia el exento', async () => {
      script = createScript([
        [/tipo de factura/, 'Factura B'],
        [/A que la asociamos/, 'A una factura'],
        [/Sobre que Factura B/, '00003-00000014'],
        [/Total o parcial/, 'Anular el total'],
      ]);

      const session = createSession([invoice({ currency: 'DOL', exchangeRate: 1450, exemptAmount: 10, total: 131 })]);
      const state = await runWizard(noteSteps(session, 3), { kind: 'credito' });

      expect(buildNoteInput(state as NonNullable<typeof state>, session, 3)).toMatchObject({
        currencyCode: 'DOL',
        exchangeRate: 1450,
        exemptAmount: 10,
        totalAmount: 131,
      });
    });

    it('con varias alicuotas no ofrece anular el total', async () => {
      script = createScript([
        [/tipo de factura/, 'Factura B'],
        [/A que la asociamos/, 'A una factura'],
        [/Sobre que Factura B/, '00003-00000014'],
        [/Monto de la nota de credito/, '100'],
        [/Alicuota de IVA de la factura/, '21%'],
      ]);

      const session = createSession([invoice({ ivaAmount: 262.5, netAmount: 1500, total: 1762.5 })]);
      const state = await runWizard(noteSteps(session, 3), { kind: 'credito' });
      const input = buildNoteInput(state as NonNullable<typeof state>, session, 3);

      expect(input.totalAmount).toBe(100);
      expect(input.exemptAmount).toBeUndefined();
      expect(script.chooseStep.mock.calls.map(([message]) => message)).not.toContainEqual(
        expect.stringMatching(/Total o parcial/),
      );
    });

    it('en FCE no ofrece periodo, pregunta el IVA receptor y la anulacion', async () => {
      script = createScript([
        [/tipo de factura/, 'Factura de credito electronica A'],
        [/Sobre que Factura de credito electronica A/, '00003-00000014'],
        [/Total o parcial/, 'Parcial'],
        [/Monto de la nota de credito/, '60,50'],
        [/Condicion frente al IVA/, 'Responsable inscripto'],
        [/rechazo la factura/, 'Si'],
      ]);

      const session = createSession([invoice({ documentNumber: 30709965812, documentTypeCode: 80 })]);
      const state = await runWizard(noteSteps(session, 3), { kind: 'credito' });

      expect(buildNoteInput(state as NonNullable<typeof state>, session, 3)).toMatchObject({
        cancellation: true,
        documentNumber: 30709965812,
        ivaCondition: 'responsable-inscripto',
        shortcut: 'ncea',
        totalAmount: 60.5,
      });
      expect(script.asked.some((question) => /asociamos/.test(question))).toBe(false);
    });

    it('arma una NC asociada a un periodo', async () => {
      script = createScript([
        [/tipo de factura/, 'Factura B'],
        [/A que la asociamos/, 'A un periodo'],
        [/Periodo desde/, '1/9'],
        [/Periodo hasta/, '30/9'],
        [/A quien va la nota/, 'Consumidor final'],
        [/concepto ajusta/, 'Servicios'],
        [/Monto de la nota/, '121'],
        [/Alicuota/, '21%'],
      ]);

      const session = createSession();
      const state = await runWizard(noteSteps(session, 3), { kind: 'credito' });
      const input = buildNoteInput(state as NonNullable<typeof state>, session, 3);

      expect(input).toMatchObject({
        associatedPeriod: { desde: '1/9', hasta: '30/9' },
        shortcut: 'ncb',
        totalAmount: 121,
      });
      expect(input.associatedVoucher).toBeUndefined();
    });

    it('si no hay facturas solo ofrece ingresarla a mano', async () => {
      script = createScript([
        [/tipo de factura/, 'Factura B'],
        [/A que la asociamos/, 'A una factura'],
        [/Sobre que Factura B/, BACK],
        [/A que la asociamos/, BACK],
        [/tipo de factura/, BACK],
      ]);

      expect(await runWizard(noteSteps(createSession([]), 3), { kind: 'debito' })).toBeUndefined();
      expect(onlyChoices(script.chooseStep.mock.calls[2][1]).map((choice) => choice.name)).toEqual([
        '# Ingresar el numero a mano…',
      ]);
    });

    it('carga mas facturas, de a la cantidad configurada, y deja elegir una vieja', async () => {
      script = createScript([
        [/tipo de factura/, 'Factura C'],
        [/A que la asociamos/, 'A una factura'],
        [/Sobre que Factura C/, 'Cargar mas'],
        [/Sobre que Factura C/, '00003-00000003'],
        [/Total o parcial/, 'Anular el total'],
      ]);

      const vouchers = Array.from({ length: 12 }, (_, index) => invoice({ ivaAmount: 0, number: index + 1 }));
      const session = createSession(vouchers);

      Object.assign(session.runtime.config, { comprobantesPorLista: 8 });
      const state = await runWizard(noteSteps(session, 3), { kind: 'credito' });
      const [firstList, secondList] = script.chooseStep.mock.calls
        .filter(([message]) => /Sobre que Factura C/.test(message))
        .map(([, choices]) => onlyChoices(choices).map((choice) => choice.name));

      expect(firstList).toHaveLength(10);
      expect(firstList).toContain('+ Cargar mas…');
      // Mientras carga, la misma lista con "Cargando…" en lugar del boton.
      const loadingList = script.chooseStepWhileLoading.mock.calls[0][1] as ReadonlyArray<{
        name?: string;
        separator?: string;
      }>;

      expect(loadingList.some((item) => stripAnsi(item.separator ?? '').includes('Cargando…'))).toBe(true);
      expect(loadingList.some((item) => item.name === '+ Cargar mas…')).toBe(false);
      // Ya estan las 12: no ofrece cargar mas.
      expect(secondList).toHaveLength(13);
      expect(secondList).not.toContain('+ Cargar mas…');
      expect(buildNoteInput(state as NonNullable<typeof state>, session, 3).associatedVoucher).toMatchObject({
        numero: 3,
        puntoVenta: 3,
      });
    });

    it('ingresa a mano una factura de otro punto de venta', async () => {
      script = createScript([
        [/tipo de factura/, 'Factura C'],
        [/A que la asociamos/, 'A una factura'],
        [/Sobre que Factura C/, 'Ingresar el numero a mano'],
        [/Punto de venta/, '5'],
        [/^Numero/, '14'],
        [/Total o parcial/, 'Anular el total'],
      ]);

      const session = createSession([invoice({ ivaAmount: 0 })]);
      const getVoucher = vi.spyOn(session.historyGateway, 'getVoucher');
      const state = await runWizard(noteSteps(session, 3), { kind: 'credito' });

      expect(getVoucher).toHaveBeenLastCalledWith(14, 5, 11);
      expect(buildNoteInput(state as NonNullable<typeof state>, session, 3)).toMatchObject({
        associatedVoucher: { numero: 14, puntoVenta: 5, shortcut: 'fc' },
        shortcut: 'ncc',
        totalAmount: 121,
      });
    });

    it('si la factura ingresada a mano no existe vuelve a la lista', async () => {
      script = createScript([
        [/tipo de factura/, 'Factura C'],
        [/A que la asociamos/, 'A una factura'],
        [/Sobre que Factura C/, 'Ingresar el numero a mano'],
        [/Punto de venta/, '3'],
        [/^Numero/, '99'],
        [/Sobre que Factura C/, '00003-00000014'],
        [/Total o parcial/, 'Anular el total'],
      ]);

      const session = createSession([invoice({ ivaAmount: 0 })]);
      const state = await runWizard(noteSteps(session, 3), { kind: 'credito' });

      expect(state?.invoice?.number).toBe(14);
    });
  });

  describe('consultar comprobantes', () => {
    function capture(): () => string {
      let printed = '';

      vi.mocked(process.stdout.write).mockImplementation((chunk) => {
        printed += String(chunk);
        return true;
      });

      return () => printed;
    }

    it('lista cualquier tipo, muestra el detalle y vuelve a la lista', async () => {
      script = createScript([
        [/Que comprobantes queres consultar/, 'Nota de credito B'],
        [/Que Nota de credito B queres ver/, '00003-00000014'],
        [/Que Nota de credito B queres ver/, BACK],
      ]);

      const printed = capture();
      const session = createSession([invoice()]);
      const getLastNumber = vi.spyOn(session.historyGateway, 'getLastNumber');

      await runHistoryFlow(session);

      expect(printed()).toContain('86400940834693');
      expect(getLastNumber).toHaveBeenCalledWith(3, 8);
      // El listado va entre lineas punteadas; buscar a mano queda afuera.
      const choices = script.chooseStep.mock.calls[1][1] as ReadonlyArray<{
        name?: string;
        separator?: string;
        short?: string;
      }>;
      const names = choices.map((item) => (item.separator === undefined ? item.name : stripAnsi(item.separator)));

      expect(names[0]).toMatch(/^┈+$/);
      expect(names[1]).toContain('CAE 86400940834693');
      // Al elegirla, la respuesta muestra solo el numero.
      expect(choices[1]?.short).toBe('00003-00000014');
      expect(names.slice(2)).toEqual([expect.stringMatching(/^┈+$/), ' ', '# Ingresar el numero a mano…']);
      // La lista se arma una sola vez: volver del detalle no consulta ARCA de nuevo.
      expect(getLastNumber).toHaveBeenCalledTimes(1);
    });

    it('busca uno por numero en otro punto de venta', async () => {
      script = createScript([
        [/Que comprobantes queres consultar/, 'Factura B'],
        [/Que Factura B queres ver/, 'Ingresar el numero a mano'],
        [/Punto de venta/, '7'],
        [/^Numero/, '14'],
        [/Que Factura B queres ver/, BACK],
      ]);

      const printed = capture();

      await runHistoryFlow(createSession([invoice()]));

      expect(printed()).toContain('00007-00000014');
    });

    it('volver sale sin consultar', async () => {
      script = createScript([[/Que comprobantes/, BACK]]);

      await runHistoryFlow(createSession([invoice()]));
    });
  });
});
