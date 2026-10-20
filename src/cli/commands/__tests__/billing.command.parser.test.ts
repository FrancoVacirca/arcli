import { Command } from 'commander';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  parseBillingCommandInput,
  parseBillingCommandInputs,
  parseBillingCommandPlan,
  registerBillingOptions,
} from '../billing.command.parser';

const temporaryDirectories: string[] = [];

function createCommand(args: string[]): Command {
  const command = new Command();

  registerBillingOptions(command);
  command.parse(['node', 'test', ...args], { from: 'node' });

  return command;
}

function writeJsonInput(content: Record<string, unknown>): string {
  const directory = mkdtempSync(join(tmpdir(), 'arcli-billing-cli-'));
  const inputPath = join(directory, 'comprobante.json');

  temporaryDirectories.push(directory);
  writeFileSync(
    inputPath,
    JSON.stringify({
      concepto: 'servicios',
      ivaReceptor: 'consumidor-final',
      montoTotal: 1000,
      numeroDocumento: 0,
      tipoDocumento: 'consumidor-final',
      ...content,
    }),
    'utf8',
  );

  return inputPath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('billing.command.parser', () => {
  it('defaults to safe dry-run when emit is absent', () => {
    const command = createCommand(['--monto', '1000']);
    const input = parseBillingCommandInput(command, 'fa', {
      defaultConcept: 'servicios',
      defaultCurrencyCode: 'ARS',
      defaultExchangeRate: 1,
      defaultIvaCondition: 'consumidor-final',
    });

    expect(input.dryRun).toBe(true);
    expect(input.emit).toBe(false);
  });

  it('uses configured emit default when the user omits execution flags', () => {
    const command = createCommand(['--monto', '1000']);
    const plan = parseBillingCommandPlan(command, 'fa', {
      defaultConcept: 'servicios',
      defaultCurrencyCode: 'ARS',
      defaultEmit: true,
      defaultExchangeRate: 1,
      defaultIvaCondition: 'consumidor-final',
    });

    expect(plan.modeSource).toBe('default');
    expect(plan.inputs[0]?.emit).toBe(true);
    expect(plan.inputs[0]?.dryRun).toBe(false);
  });

  it('marks file mode when execution flags come from json input', () => {
    const directory = mkdtempSync(join(tmpdir(), 'arcli-billing-cli-'));

    temporaryDirectories.push(directory);

    const inputPath = join(directory, 'voucher-emit.json');

    writeFileSync(
      inputPath,
      JSON.stringify({
        concepto: 'servicios',
        emitir: true,
        ivaReceptor: 'consumidor-final',
        montoTotal: 1000,
        numeroDocumento: 0,
        previsualizar: false,
        tipoDocumento: 'consumidor-final',
      }),
      'utf8',
    );

    const command = createCommand(['--cargar', inputPath]);
    const plan = parseBillingCommandPlan(command, 'fa');

    expect(plan.modeSource).toBe('file');
    expect(plan.inputs[0]?.emit).toBe(true);
    expect(plan.inputs[0]?.dryRun).toBe(false);
  });

  it('uses emit when explicitly requested', () => {
    const command = createCommand(['--monto', '1000', '--emitir']);
    const input = parseBillingCommandInput(command, 'fa', {
      defaultConcept: 'servicios',
      defaultCurrencyCode: 'ARS',
      defaultExchangeRate: 1,
      defaultIvaCondition: 'consumidor-final',
    });

    expect(input.emit).toBe(true);
    expect(input.dryRun).toBe(false);
  });

  it('rejects mixing emit and preview at the same time', () => {
    const command = createCommand(['--monto', '1000', '--emitir', '--previsualizar', '--cs', '--ir-cf']);

    expect(() => parseBillingCommandInput(command, 'fa')).toThrow(/Use --emitir o --previsualizar/);
  });

  describe('a written flag wins over the file and the config', () => {
    it('previews with --previsualizar even if the config emits by default', () => {
      const input = parseBillingCommandInput(
        createCommand(['--monto', '1000', '--cs', '--ir-cf', '--previsualizar']),
        'fc',
        {
          defaultEmit: true,
        },
      );

      expect(input.emit).toBe(false);
      expect(input.dryRun).toBe(true);
    });

    it('previews with --previsualizar even if the file says emitir', () => {
      const input = parseBillingCommandInput(
        createCommand(['--cargar', writeJsonInput({ emitir: true }), '--previsualizar']),
        'fc',
      );

      expect(input.emit).toBe(false);
    });

    it('emits with --emitir even if the file says previsualizar', () => {
      const input = parseBillingCommandInput(
        createCommand(['--cargar', writeJsonInput({ previsualizar: true }), '--emitir']),
        'fc',
      );

      expect(input.emit).toBe(true);
      expect(input.dryRun).toBe(false);
    });

    it('rejects a file that asks for emitir and previsualizar', () => {
      expect(() =>
        parseBillingCommandInput(
          createCommand(['--cargar', writeJsonInput({ emitir: true, previsualizar: true })]),
          'fc',
        ),
      ).toThrow(/"emitir" o "previsualizar", pero no ambos/);
    });

    it('does not emit when the file only says previsualizar false', () => {
      const input = parseBillingCommandInput(
        createCommand(['--cargar', writeJsonInput({ previsualizar: false })]),
        'fc',
      );

      expect(input.emit).toBe(false);
    });

    it('uses a single --alicuota instead of the file alicuotas', () => {
      const input = parseBillingCommandInput(
        createCommand([
          '--cargar',
          writeJsonInput({ alicuotas: [{ monto: 1000, tasa: 21 }], ivaReceptor: 'responsable-inscripto' }),
          '--alicuota',
          'reducida',
          '--cuit',
          '20111111112',
        ]),
        'fa',
      );

      expect(input.ivaRate).toBe('10.5');
      expect(input.ivaRateAmounts).toBeUndefined();
    });

    it('uses --cm instead of the file mismaMoneda', () => {
      const input = parseBillingCommandInput(
        createCommand(['--cargar', writeJsonInput({ codigoMoneda: 'USD', mismaMoneda: true }), '--cm', '1.200']),
        'fc',
      );

      expect(input.sameCurrency).toBe(false);
      expect(input.exchangeRate).toBe(1200);
    });

    it('uses --misma-moneda instead of the file cotizacionMoneda', () => {
      const input = parseBillingCommandInput(
        createCommand(['--cargar', writeJsonInput({ codigoMoneda: 'USD', cotizacionMoneda: 1200 }), '--misma-moneda']),
        'fc',
      );

      expect(input.sameCurrency).toBe(true);
      expect(input.exchangeRate).toBeUndefined();
    });
  });

  it('parses --misma-moneda without applying the default exchange rate', () => {
    const command = createCommand(['--monto', '1000', '--cs', '--ir-cf', '--moneda', 'USD', '--misma-moneda']);
    const input = parseBillingCommandInput(command, 'fc', { defaultExchangeRate: 1200 });

    expect(input.sameCurrency).toBe(true);
    expect(input.exchangeRate).toBeUndefined();
  });

  it('rejects --misma-moneda together with an explicit exchange rate', () => {
    const command = createCommand([
      '--monto',
      '1000',
      '--cs',
      '--ir-cf',
      '--moneda',
      'USD',
      '--misma-moneda',
      '--cm',
      '1200',
    ]);

    expect(() => parseBillingCommandInput(command, 'fc')).toThrow(/la cotizacion se toma de ARCA/);
  });

  it('applies the default exchange rate only to foreign currency', () => {
    const pesos = parseBillingCommandInput(createCommand(['--monto', '1000', '--cs', '--ir-cf']), 'fc', {
      defaultExchangeRate: 1200,
    });
    const dollars = parseBillingCommandInput(
      createCommand(['--monto', '1000', '--cs', '--ir-cf', '--moneda', 'USD']),
      'fc',
      { defaultExchangeRate: 1200 },
    );

    expect(pesos.exchangeRate).toBeUndefined();
    expect(dollars.exchangeRate).toBe(1200);
  });

  it('parses the payment due date from --vencimiento or --vto', () => {
    const long = parseBillingCommandInput(
      createCommand(['--monto', '1000', '--cs', '--ir-cf', '--vencimiento', '10/04']),
      'fc',
    );
    const short = parseBillingCommandInput(
      createCommand(['--monto', '1000', '--cs', '--ir-cf', '--vto', '11/04']),
      'fc',
    );

    expect(long.paymentDueDate).toBe('10/04');
    expect(short.paymentDueDate).toBe('11/04');
  });

  it('applies the configured CBU only to FCE invoices', () => {
    const defaults = { defaultCbu: '0110599520000012345678', defaultCbuAlias: 'mi.alias.cbu' };
    const fce = parseBillingCommandInput(createCommand(['--monto', '1000', '--cs', '--ir-ri']), 'fcea', defaults);
    const regular = parseBillingCommandInput(createCommand(['--monto', '1000', '--cs', '--ir-ri']), 'fa', defaults);

    expect(fce.cbu).toBe('0110599520000012345678');
    expect(fce.cbuAlias).toBe('mi.alias.cbu');
    expect(regular.cbu).toBeUndefined();
    expect(regular.cbuAlias).toBeUndefined();
  });

  it('parses FCE flags', () => {
    const input = parseBillingCommandInput(
      createCommand([
        '--monto',
        '1000',
        '--cs',
        '--ir-ri',
        '--ac',
        'fcea',
        '--apv',
        '3',
        '--ar',
        '7',
        '--afecha',
        '10/03',
        '--anulacion',
      ]),
      'ncea',
    );

    expect(input.cancellation).toBe(true);
    expect(input.associatedVoucher?.fecha).toBe('10/03');
  });

  it('normalizes the transfer mode and rejects unknown values', () => {
    const input = parseBillingCommandInput(
      createCommand(['--monto', '1000', '--cs', '--ir-ri', '--transferencia', 'ADC']),
      'fcea',
    );

    expect(input.transferMode).toBe('adc');
    expect(() =>
      parseBillingCommandInput(createCommand(['--monto', '1000', '--cs', '--ir-ri', '--transferencia', 'xyz']), 'fcea'),
    ).toThrow();
  });

  it('parses the IVA rate and the exempt and untaxed amounts', () => {
    const input = parseBillingCommandInput(
      createCommand([
        '--monto',
        '1000',
        '--cs',
        '--ir-ri',
        '--alicuota',
        '10,5',
        '--exento',
        '100',
        '--nogravado',
        '50',
      ]),
      'fa',
    );

    expect(input.ivaRate).toBe('10.5');
    expect(input.exemptAmount).toBe(100);
    expect(input.untaxedAmount).toBe(50);
  });

  it('applies the configured IVA rate only to letters A and B', () => {
    const defaults = { defaultIvaRate: '10.5' as const };
    const letterA = parseBillingCommandInput(createCommand(['--monto', '1000', '--cs', '--ir-ri']), 'fa', defaults);
    const letterC = parseBillingCommandInput(createCommand(['--monto', '1000', '--cs', '--ir-cf']), 'fc', defaults);
    const explicit = parseBillingCommandInput(
      createCommand(['--monto', '1000', '--cs', '--ir-ri', '--alicuota', '27']),
      'fa',
      defaults,
    );

    expect(letterA.ivaRate).toBe('10.5');
    expect(letterC.ivaRate).toBeUndefined();
    expect(explicit.ivaRate).toBe('27');
  });

  it('parses the associated period from long and short flags', () => {
    const long = parseBillingCommandInput(
      createCommand(['--monto', '1000', '--cs', '--ir-cf', '--periodo-desde', '1/2', '--periodo-hasta', '28/2']),
      'ncb',
    );
    const short = parseBillingCommandInput(
      createCommand(['--monto', '1000', '--cs', '--ir-cf', '--pd', '1/2', '--ph', '28/2']),
      'ncb',
    );

    expect(long.associatedPeriod).toEqual({ desde: '1/2', hasta: '28/2' });
    expect(short.associatedPeriod).toEqual({ desde: '1/2', hasta: '28/2' });
  });

  it('parses several alicuotas with aliases and computes the total', () => {
    const input = parseBillingCommandInput(
      createCommand(['--cs', '--ir-ri', '--alicuota', 'general:1210', '--alicuota', '10,5:552,50', '--exento', '50']),
      'fa',
    );

    expect(input.ivaRateAmounts).toEqual([
      { amount: 1210, rate: '21' },
      { amount: 552.5, rate: '10.5' },
    ]);
    expect(input.ivaRate).toBeUndefined();
    expect(input.totalAmount).toBe(1812.5);
  });

  it.each([
    ['--monto', '1.500,50', 'totalAmount', 1500.5],
    ['--monto', '15.000', 'totalAmount', 15000],
    ['--exento', '1500,5', 'exemptAmount', 1500.5],
    ['--nogravado', '2.000', 'untaxedAmount', 2000],
  ] as const)('reads %s %s with the Argentine format', (flag, value, field, expected) => {
    const args = flag === '--monto' ? [flag, value] : ['--monto', '100.000', flag, value];
    const input = parseBillingCommandInput(createCommand([...args, '--cs', '--ir-ri']), 'fa');

    expect(input[field]).toBe(expected);
  });

  it('accepts up to 6 decimals in the exchange rate', () => {
    const input = parseBillingCommandInput(
      createCommand(['--monto', '100', '--cs', '--ir-ri', '--moneda', 'USD', '--cm', '1.452,123456']),
      'fa',
    );

    expect(input.exchangeRate).toBe(1452.123456);
  });

  it.each([
    [['--monto', '1500.50'], /--monto "1500.50" no es valido: use coma para los decimales/],
    [['--monto', '12abc'], /--monto "12abc" no es valido: use punto para miles y coma para decimales/],
    [['--monto', '1500,555'], /--monto "1500,555" no es valido: use hasta 2 decimales/],
    [['--monto', '100', '--exento', '10.5'], /--exento "10.5" no es valido/],
    [['--monto', '100', '--cm', '1452.5'], /--cm "1452.5" no es valido/],
  ])('rejects amounts that are not in the Argentine format: %j', (args, message) => {
    expect(() => createCommand(args)).toThrow(message);
  });

  it('rejects an alicuota amount that is not in the Argentine format', () => {
    expect(() =>
      parseBillingCommandInput(
        createCommand(['--cs', '--ir-ri', '--alicuota', 'general:1210', '--alicuota', 'reducida:552.50']),
        'fa',
      ),
    ).toThrow(/--alicuota "reducida:552.50": el monto no es valido: use coma para los decimales/);
  });

  it('sums several alicuotas without floating point errors', () => {
    const input = parseBillingCommandInput(
      createCommand(['--cs', '--ir-ri', '--alicuota', 'general:100,1', '--alicuota', 'reducida:200,2']),
      'fa',
    );

    expect(input.totalAmount).toBe(300.3);
  });

  it('accepts a single alicuota by alias', () => {
    const input = parseBillingCommandInput(
      createCommand(['--monto', '110,5', '--cs', '--ir-ri', '--alicuota', 'reducida']),
      'fa',
    );

    expect(input.ivaRate).toBe('10.5');
  });

  it('rejects mixing a single alicuota with TASA:MONTO pairs', () => {
    expect(() =>
      parseBillingCommandInput(
        createCommand(['--monto', '100', '--cs', '--ir-ri', '--alicuota', '21', '--alicuota', '10.5:50']),
        'fa',
      ),
    ).toThrow(/No mezcle --alicuota TASA con --alicuota TASA:MONTO/);
    expect(() =>
      parseBillingCommandInput(
        createCommand(['--monto', '100', '--cs', '--ir-ri', '--alicuota', '21', '--alicuota', '27']),
        'fa',
      ),
    ).toThrow(/Para varias alicuotas use --alicuota TASA:MONTO/);
  });

  it('loads base data from a JSON file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'arcli-billing-cli-'));

    temporaryDirectories.push(directory);

    const inputPath = join(directory, 'voucher.json');

    writeFileSync(
      inputPath,
      JSON.stringify({
        codigoMoneda: 'USD',
        comprobanteAsociado: {
          atajo: 'fc',
          cuit: '20123456789',
          numero: 10,
          puntoVenta: 3,
        },
        concepto: 'productos',
        cotizacionMoneda: 1200,
        ivaReceptor: 'consumidor-final',
        montoTotal: 9999,
        numeroDocumento: 12345678,
        puntoVenta: 7,
        tipoDocumento: 'dni',
      }),
      'utf8',
    );

    const command = createCommand(['--cargar', inputPath]);
    const input = parseBillingCommandInput(command, 'fb');

    expect(input.concept).toBe('productos');
    expect(input.documentType).toBe('dni');
    expect(input.documentNumber).toBe(12345678);
    expect(input.pointOfSale).toBe(7);
    expect(input.totalAmount).toBe(9999);
    expect(input.currencyCode).toBe('USD');
    expect(input.exchangeRate).toBe(1200);
    expect(input.associatedVoucher?.shortcut).toBe('fc');
  });

  it('in a batch, collects every invalid item instead of failing on the first one', () => {
    const directory = mkdtempSync(join(tmpdir(), 'arcli-billing-cli-'));

    temporaryDirectories.push(directory);

    const inputPath = join(directory, 'lote.json');

    writeFileSync(
      inputPath,
      JSON.stringify([
        { concepto: 'servicios', ivaReceptor: 'consumidor-final', montoTotal: 100 },
        { concepto: 'servicios', ivaReceptor: 'consumidor-final' },
        { concepto: 'servicios', ivaReceptor: 'consumidor-final', montoTotal: 300 },
        { concepto: 'servicios', ivaReceptor: 'no-existe', montoTotal: 400 },
      ]),
      'utf8',
    );

    const plan = parseBillingCommandPlan(createCommand(['--cargar', inputPath]), 'fc');

    expect(plan.total).toBe(4);
    expect(plan.inputIndexes).toEqual([1, 3]);
    expect(plan.inputs.map((input) => input.totalAmount)).toEqual([100, 300]);
    expect(plan.invalidItems.map((item) => item.index)).toEqual([2, 4]);
    expect(plan.invalidItems[0]?.message).toContain('monto');
    expect(() => parseBillingCommandInputs(createCommand(['--cargar', inputPath]), 'fc')).toThrow(
      /2 de 4 comprobantes del lote tienen errores/,
    );
  });

  it('loads multiple voucher inputs from a JSON array', () => {
    const directory = mkdtempSync(join(tmpdir(), 'arcli-billing-cli-'));

    temporaryDirectories.push(directory);

    const inputPath = join(directory, 'voucher-array.json');

    writeFileSync(
      inputPath,
      JSON.stringify([
        {
          concepto: 'servicios',
          ivaReceptor: 'consumidor-final',
          montoTotal: 1000,
          numeroDocumento: 0,
          tipoDocumento: 'consumidor-final',
        },
        {
          concepto: 'productos',
          ivaReceptor: 'consumidor-final',
          montoTotal: 2000,
          numeroDocumento: 12345678,
          tipoDocumento: 'dni',
        },
      ]),
      'utf8',
    );

    const command = createCommand(['--cargar', inputPath]);
    const inputs = parseBillingCommandInputs(command, 'fc');

    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.totalAmount).toBe(1000);
    expect(inputs[1]?.totalAmount).toBe(2000);
  });

  it('accepts concept aliases from flags', () => {
    const command = createCommand(['-m', '1000', '--concepto', 'productos-servicios']);
    const input = parseBillingCommandInput(command, 'fa', { defaultIvaCondition: 'consumidor-final' });

    expect(input.concept).toBe('productos-servicios');
  });

  it('uses the configured default concept when the command omits it', () => {
    const command = createCommand(['--monto', '1000']);
    const input = parseBillingCommandInput(command, 'fa', {
      defaultConcept: 'servicios',
      defaultCurrencyCode: 'ARS',
      defaultExchangeRate: 1,
      defaultIvaCondition: 'consumidor-final',
    });

    expect(input.concept).toBe('servicios');
  });

  it('fails when no concept is provided anywhere', () => {
    const command = createCommand(['--monto', '1000']);

    expect(() => parseBillingCommandInput(command, 'fa', { defaultIvaCondition: 'consumidor-final' })).toThrow(
      /Falta el concepto/,
    );
  });

  it('keeps document number undefined when the user does not provide it', () => {
    const command = createCommand(['-m', '1000', '--concepto', 'servicios', '--ir-cf']);
    const input = parseBillingCommandInput(command, 'fa');

    expect(input.documentNumber).toBeUndefined();
  });

  it('accepts renamed aliases for common billing options', () => {
    const command = createCommand([
      '-m',
      '2500',
      '--cs',
      '--cfinal',
      '--ir-cf',
      '--pv',
      '9',
      '--mda',
      'USD',
      '--cm',
      '1234',
      '--sd',
      '01-03-2026',
      '--sh',
      '31-03-2026',
    ]);
    const input = parseBillingCommandInput(command, 'fc');

    expect(input.pointOfSale).toBe(9);
    expect(input.currencyCode).toBe('USD');
    expect(input.exchangeRate).toBe(1234);
    expect(input.sameCurrency).toBe(false);
    expect(input.serviceStartDate).toBe('01-03-2026');
    expect(input.serviceEndDate).toBe('31-03-2026');
    expect(input.documentType).toBe('consumidor-final');
  });

  it('accepts associated voucher aliases', () => {
    const command = createCommand([
      '--monto',
      '5000',
      '--cs',
      '--cfinal',
      '--ir-cf',
      '--ac',
      'fc',
      '--apv',
      '3',
      '--ar',
      '120',
      '--acuit',
      '20409509763',
    ]);
    const input = parseBillingCommandInput(command, 'ncc');

    expect(input.associatedVoucher).toEqual({
      cuit: '20409509763',
      numero: 120,
      puntoVenta: 3,
      shortcut: 'fc',
      tipo: undefined,
    });
  });

  describe('PDF flags', () => {
    const defaults = { defaultConcept: 'servicios' as const, defaultIvaCondition: 'consumidor-final' as const };

    it('reads --exportar-pdf, its alias and the PDF-only data', () => {
      const input = parseBillingCommandInput(
        createCommand([
          '--monto',
          '1000',
          '--exportar-pdf',
          '--descripcion',
          'Servicios de octubre',
          '--receptor-nombre',
          'Cliente SA',
          '--receptor-domicilio',
          'Calle 1',
        ]),
        'fc',
        defaults,
      );

      expect(input).toMatchObject({
        pdf: true,
        pdfDescription: 'Servicios de octubre',
        receiverAddress: 'Calle 1',
        receiverName: 'Cliente SA',
      });
      expect(parseBillingCommandInput(createCommand(['--monto', '1000', '--pdf']), 'fc', defaults).pdf).toBe(true);
      expect(parseBillingCommandInput(createCommand(['--monto', '1000', '--sin-pdf']), 'fc', defaults).pdf).toBe(false);
      expect(parseBillingCommandInput(createCommand(['--monto', '1000']), 'fc', defaults).pdf).toBeUndefined();
    });

    it('rejects --exportar-pdf together with --sin-pdf', () => {
      expect(() =>
        parseBillingCommandInput(createCommand(['--monto', '1000', '--pdf', '--sin-pdf']), 'fc', defaults),
      ).toThrow(/--exportar-pdf o --sin-pdf/);
    });
  });
});

describe('IVA receptor y padron', () => {
  const parse = (args: string[], defaults: Parameters<typeof parseBillingCommandPlan>[2] = {}) =>
    parseBillingCommandPlan(createCommand(['--monto', '1000', '--cs', ...args]), 'fa', defaults).inputs[0];

  it('con un CUIT y sin --ir deja la consulta al padron, aunque no haya default', () => {
    expect(parse(['--cuit', '20201797064'], { lookupIvaConditionInPadron: true })).toMatchObject({
      documentType: 'cuit',
      ivaConditionSource: 'missing',
    });
  });

  it('marca el IVA de la config para que el padron lo pueda corregir', () => {
    expect(
      parse(['--cuit', '20201797064'], { defaultIvaCondition: 'consumidor-final', lookupIvaConditionInPadron: true }),
    ).toMatchObject({ ivaCondition: 'consumidor-final', ivaConditionSource: 'default' });
  });

  it('un --ir explicito no se marca y no se consulta', () => {
    expect(
      parse(['--cuit', '20201797064', '--ir-ri'], { lookupIvaConditionInPadron: true })?.ivaConditionSource,
    ).toBeUndefined();
  });

  it('sin padron, o con DNI, falta el IVA receptor como antes', () => {
    expect(() => parse(['--cuit', '20201797064'])).toThrow(/Falta IVA receptor/);
    expect(() => parse(['--dni', '12345678'], { lookupIvaConditionInPadron: true })).toThrow(/Falta IVA receptor/);
  });
});

describe('--cargar JSON validation', () => {
  function writeRawJson(content: unknown): string {
    const directory = mkdtempSync(join(tmpdir(), 'arcli-billing-cli-'));
    const inputPath = join(directory, 'comprobante.json');

    temporaryDirectories.push(directory);
    writeFileSync(inputPath, JSON.stringify(content), 'utf8');

    return inputPath;
  }

  it('rejects a point of sale written as text instead of using the one in the config', () => {
    expect(() =>
      parseBillingCommandInput(createCommand(['--cargar', writeJsonInput({ puntoVenta: '3' })]), 'fc'),
    ).toThrow(/"puntoVenta" tiene que ser un numero/);
  });

  it('rejects a misspelled key instead of ignoring it', () => {
    expect(() =>
      parseBillingCommandInput(createCommand(['--cargar', writeJsonInput({ vencimiento: '10-04-2026' })]), 'fc'),
    ).toThrow(/"vencimiento"/);
  });

  it('reports invalid JSON items of a batch with their index', () => {
    const inputPath = writeRawJson([
      { concepto: 'servicios', ivaReceptor: 'consumidor-final', montoTotal: 100 },
      { concepto: 'servicios', ivaReceptor: 'consumidor-final', montototal: 200 },
      { concepto: 'servicios', ivaReceptor: 'consumidor-final', montoTotal: 300, puntoVenta: '3' },
    ]);
    const plan = parseBillingCommandPlan(createCommand(['--cargar', inputPath]), 'fc');

    expect(plan.inputIndexes).toEqual([1]);
    expect(plan.invalidItems.map((item) => item.index)).toEqual([2, 3]);
    expect(plan.invalidItems[0]?.message).toContain('"montototal"');
    expect(plan.invalidItems[1]?.message).toContain('"puntoVenta"');
    expect(() => parseBillingCommandInputs(createCommand(['--cargar', inputPath]), 'fc')).toThrow(
      /2 de 3 comprobantes del lote tienen errores/,
    );
  });

  it('rejects an empty batch instead of falling back to flags', () => {
    expect(() =>
      parseBillingCommandInput(
        createCommand(['--cargar', writeRawJson([]), '--monto', '100', '--cs', '--ir-cf']),
        'fc',
      ),
    ).toThrow(/vacio/);
  });
});
