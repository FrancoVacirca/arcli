import Big from 'big.js';
import type { Command } from 'commander';

import { InputValidationError } from '../../lib/errors/app-error';
import { readJsonFile } from '../../lib/files/read-json-file';
import { parseArgentineAmount } from '../../lib/numbers/argentine-amount';
import { type BatchItemError, BatchValidationError, describeBatchItemError } from '../../modules/billing/billing.batch';
import { isForeignCurrency } from '../../modules/billing/billing.currency';
import { type BillingCommandInput, billingCommandSchema } from '../../modules/billing/billing.schemas';
import type { VoucherShortcut } from '../../modules/billing/billing.types';
import { getVoucherKindByShortcut } from '../../modules/billing/voucher-kind-map';

import { resolveConceptShortcut, resolveDocumentIdentity, resolveIvaShortcut } from './billing.command.shortcuts';

export { registerBillingOptions } from './billing.command.options';

type AssociatedVoucherInput = NonNullable<BillingCommandInput['associatedVoucher']>;

interface BillingJsonInput {
  readonly periodoAsociado?: {
    readonly desde?: string;
    readonly hasta?: string;
  };
  readonly comprobanteAsociado?: {
    readonly atajo?: AssociatedVoucherInput['shortcut'];
    readonly cuit?: AssociatedVoucherInput['cuit'];
    readonly fecha?: AssociatedVoucherInput['fecha'];
    readonly numero?: AssociatedVoucherInput['numero'];
    readonly puntoVenta?: AssociatedVoucherInput['puntoVenta'];
    readonly tipo?: AssociatedVoucherInput['tipo'];
  };
  readonly alicuotaIva?: number | string;
  readonly alicuotas?: ReadonlyArray<{ readonly monto?: number; readonly tasa?: number | string }>;
  readonly aliasCbu?: string;
  readonly anulacion?: boolean;
  readonly cbu?: string;
  readonly concepto?: BillingCommandInput['concept'];
  readonly codigoMoneda?: string;
  readonly cotizacionMoneda?: number;
  readonly dia?: number;
  readonly emitir?: boolean;
  readonly fechaComprobante?: string;
  readonly importeExento?: number;
  readonly importeNoGravado?: number;
  readonly ivaReceptor?: BillingCommandInput['ivaCondition'];
  readonly mismaMoneda?: boolean;
  readonly montoTotal?: number;
  readonly numeroDocumento?: number;
  readonly pdf?: boolean;
  readonly descripcion?: string;
  readonly previsualizar?: boolean;
  readonly puntoVenta?: number;
  readonly receptorDomicilio?: string;
  readonly receptorNombre?: string;
  readonly vencimientoPago?: string;
  readonly servicioDesde?: string;
  readonly servicioHasta?: string;
  readonly transferencia?: string;
  readonly tipoDocumento?: BillingCommandInput['documentType'];
}

type BillingJsonInputSource = BillingJsonInput | BillingJsonInput[];

function pickString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string');
}

function pickNumber(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === 'number');
}

interface RateAmountInput {
  readonly amount: unknown;
  readonly rate: unknown;
}

function parseRateAmount(flagValue: string, raw: string): number {
  const result = parseArgentineAmount(raw);

  if (!result.ok) {
    throw new InputValidationError(`--alicuota "${flagValue}": el monto no es valido: ${result.reason}.`);
  }

  return result.value;
}

/**
 * `--alicuota` acepta una tasa sola ("reducida", "10.5") o, repetido, pares TASA:MONTO con el importe
 * de cada alicuota IVA incluido. No se pueden mezclar las dos formas.
 */
function parseIvaRateFlags(values: readonly string[] | undefined): {
  readonly ivaRate?: string;
  readonly ivaRateAmounts?: RateAmountInput[];
} {
  if (!values || values.length === 0) {
    return {};
  }

  const withAmount = values.filter((value) => value.includes(':'));

  if (withAmount.length === 0) {
    if (values.length > 1) {
      throw new InputValidationError(
        'Para varias alicuotas use --alicuota TASA:MONTO en cada una, por ejemplo --alicuota general:1210 --alicuota reducida:552,50.',
      );
    }

    return { ivaRate: values[0] };
  }

  if (withAmount.length !== values.length) {
    throw new InputValidationError('No mezcle --alicuota TASA con --alicuota TASA:MONTO: use una sola forma.');
  }

  return {
    ivaRateAmounts: values.map((value) => {
      const separator = value.indexOf(':');

      return { amount: parseRateAmount(value, value.slice(separator + 1)), rate: value.slice(0, separator) };
    }),
  };
}

/** Total de un comprobante con varias alicuotas, sumado con Big: 100.1 + 200.2 da 300.3, no 300.29999999999995. */
function sumRateAmounts(
  rateAmounts: readonly RateAmountInput[],
  exemptAmount: number | undefined,
  untaxedAmount: number | undefined,
): number {
  return rateAmounts
    .reduce((sum, item) => sum.plus(typeof item.amount === 'number' ? item.amount : 0), new Big(0))
    .plus(exemptAmount ?? 0)
    .plus(untaxedAmount ?? 0)
    .toNumber();
}

/**
 * Emitir o no, por nivel: lo escrito en el comando, despues el archivo y por ultimo la config.
 * El primer nivel que diga algo decide; solo es error que un mismo nivel pida las dos cosas.
 */
function resolveShouldEmit(options: {
  readonly cliEmit?: boolean;
  readonly cliPreview?: boolean;
  readonly defaultEmit?: boolean;
  readonly fileEmit?: boolean;
  readonly filePreview?: boolean;
}): boolean {
  if (options.cliEmit && options.cliPreview) {
    throw new InputValidationError('Use --emitir o --previsualizar, pero no ambos a la vez.');
  }

  if (options.cliEmit !== undefined || options.cliPreview !== undefined) {
    return options.cliEmit === true;
  }

  if (options.fileEmit === true && options.filePreview === true) {
    throw new InputValidationError('En el archivo use "emitir" o "previsualizar", pero no ambos en true.');
  }

  if (typeof options.fileEmit === 'boolean') {
    return options.fileEmit;
  }

  // "previsualizar": false no es lo mismo que "emitir": true; sin "emitir" decide la config.
  if (options.filePreview === true) {
    return false;
  }

  return Boolean(options.defaultEmit);
}

function resolvePdfFlag(
  commandOptions: Record<string, unknown>,
  fileInput: BillingJsonInput | undefined,
): boolean | undefined {
  const exportPdf = commandOptions.exportarPdf === true || commandOptions.pdf === true;

  if (exportPdf && commandOptions.sinPdf === true) {
    throw new InputValidationError('Use --exportar-pdf o --sin-pdf, pero no ambos a la vez.');
  }

  if (exportPdf) {
    return true;
  }

  return commandOptions.sinPdf === true ? false : fileInput?.pdf;
}

export interface BillingCommandDefaults {
  readonly defaultIvaRate?: BillingCommandInput['ivaRate'];
  readonly defaultCbu?: string;
  readonly defaultCbuAlias?: string;
  readonly defaultConcept?: BillingCommandInput['concept'];
  readonly defaultCurrencyCode?: string;
  readonly defaultEmit?: boolean;
  readonly defaultExchangeRate?: number;
  readonly defaultIvaCondition?: BillingCommandInput['ivaCondition'];
}

export interface BillingCommandPlan {
  /** Posicion en el lote (desde 1) de cada item de `inputs`. */
  readonly inputIndexes: number[];
  readonly inputs: BillingCommandInput[];
  /** Items del lote que no se pudieron leer; el comando no emite nada si hay alguno. */
  readonly invalidItems: BatchItemError[];
  readonly modeSource: 'default' | 'file' | 'flags';
  /** Cantidad de items del lote (1 si no hay lote). */
  readonly total: number;
}

function parseBillingCommandInputFromSource(
  command: Command,
  shortcut: VoucherShortcut,
  fileInput: BillingJsonInput | undefined,
  defaults: BillingCommandDefaults = {},
): BillingCommandInput & { readonly __modeSource: BillingCommandPlan['modeSource'] } {
  const commandOptions = command.optsWithGlobals<Record<string, unknown>>();
  const emitirSource = command.getOptionValueSource('emitir');
  const previsualizarSource = command.getOptionValueSource('previsualizar');
  const hasAssociatedShortcut = typeof commandOptions.ac === 'string';
  const hasAssociatedType = typeof commandOptions.at === 'number';

  if (hasAssociatedShortcut && hasAssociatedType) {
    throw new InputValidationError('Use --ac o --at para identificar el comprobante asociado, pero no ambos a la vez.');
  }

  const associatedVoucherFromFlags =
    commandOptions.ar ||
    commandOptions.apv ||
    commandOptions.asociadoPuntoVenta ||
    commandOptions.at ||
    commandOptions.acuit ||
    commandOptions.afecha ||
    commandOptions.ac
      ? {
          cuit: pickString(commandOptions.acuit),
          fecha: pickString(commandOptions.afecha),
          numero: pickNumber(commandOptions.ar),
          puntoVenta: pickNumber(commandOptions.apv, commandOptions.asociadoPuntoVenta),
          shortcut: pickString(commandOptions.ac),
          tipo: pickNumber(commandOptions.at),
        }
      : undefined;

  const modeSource: BillingCommandPlan['modeSource'] =
    emitirSource === 'cli' || previsualizarSource === 'cli'
      ? 'flags'
      : typeof fileInput?.emitir === 'boolean' || typeof fileInput?.previsualizar === 'boolean'
        ? 'file'
        : 'default';
  const shouldEmit = resolveShouldEmit({
    cliEmit: emitirSource === 'cli' ? commandOptions.emitir === true : undefined,
    cliPreview: previsualizarSource === 'cli' ? commandOptions.previsualizar === true : undefined,
    defaultEmit: defaults.defaultEmit,
    fileEmit: fileInput?.emitir,
    filePreview: fileInput?.previsualizar,
  });
  const conceptShortcut = resolveConceptShortcut(commandOptions);
  const documentIdentity = resolveDocumentIdentity(commandOptions);
  const ivaShortcut = resolveIvaShortcut(commandOptions);
  const resolvedConcept =
    pickString(commandOptions.concepto) ?? conceptShortcut ?? fileInput?.concepto ?? defaults.defaultConcept;
  const resolvedIvaCondition =
    pickString(commandOptions.ivaReceptor, commandOptions.ir) ??
    ivaShortcut ??
    fileInput?.ivaReceptor ??
    defaults.defaultIvaCondition;

  if (typeof commandOptions.concepto === 'string' && conceptShortcut) {
    throw new InputValidationError('Use --concepto o un flag corto de concepto (--cs, --cp, --csp), pero no ambos.');
  }

  if (typeof commandOptions.ivaReceptor === 'string' && typeof commandOptions.ir === 'string') {
    throw new InputValidationError('Use --iva-receptor o --ir para indicar IVA receptor, pero no ambos.');
  }

  if ((typeof commandOptions.ivaReceptor === 'string' || typeof commandOptions.ir === 'string') && ivaShortcut) {
    throw new InputValidationError('Use --iva-receptor, --ir o un flag corto --ir-*, pero no varios a la vez.');
  }

  if (!resolvedConcept) {
    throw new InputValidationError(
      'Falta el concepto. Use --concepto <tipo>, o bien --cs/--cp/--csp, o configure uno por defecto con "arcli config establecer concepto servicios".',
    );
  }

  if (!resolvedIvaCondition) {
    throw new InputValidationError(
      'Falta IVA receptor. Use --iva-receptor <tipo>, --ir <tipo>, un flag --ir-*, o configure uno por defecto con "arcli config establecer ivaReceptor consumidor-final".',
    );
  }

  const associatedVoucherFromFile = fileInput?.comprobanteAsociado
    ? {
        cuit: fileInput.comprobanteAsociado.cuit,
        fecha: fileInput.comprobanteAsociado.fecha,
        numero: fileInput.comprobanteAsociado.numero,
        puntoVenta: fileInput.comprobanteAsociado.puntoVenta,
        shortcut: fileInput.comprobanteAsociado.atajo,
        tipo: fileInput.comprobanteAsociado.tipo,
      }
    : undefined;

  const currencyCode = pickString(
    commandOptions.moneda,
    commandOptions.mda,
    fileInput?.codigoMoneda,
    defaults.defaultCurrencyCode,
  );
  // Un flag pisa lo del archivo: --cm descarta "mismaMoneda" del JSON y --misma-moneda, su "cotizacionMoneda".
  const flagExchangeRate = pickNumber(commandOptions.cotizacionMoneda, commandOptions.cm);
  const flagSameCurrency = commandOptions.mismaMoneda === true;
  const sameCurrency = flagSameCurrency || (flagExchangeRate === undefined && fileInput?.mismaMoneda === true);
  const explicitExchangeRate = flagExchangeRate ?? (flagSameCurrency ? undefined : fileInput?.cotizacionMoneda);

  if (sameCurrency && typeof explicitExchangeRate === 'number') {
    throw new InputValidationError(
      'Con --misma-moneda la cotizacion se toma de ARCA. Quite --cotizacion-moneda o --cm.',
    );
  }

  // La cotizacion por defecto de la config solo aplica a moneda extranjera sin --misma-moneda.
  const exchangeRate =
    explicitExchangeRate ??
    (!sameCurrency && isForeignCurrency({ currencyCode }) ? defaults.defaultExchangeRate : undefined);

  // El CBU de la config solo aplica a facturas FCE: ARCA rechaza esos opcionales en otros comprobantes (10169).
  const voucherKind = getVoucherKindByShortcut(shortcut);
  const usesFceDefaults = voucherKind?.family === 'factura-credito-electronica';
  // La C no discrimina IVA: la alicuota de la config solo aplica a A y B.
  const usesIvaRateDefault = voucherKind?.letter !== 'c';

  const periodFrom = pickString(commandOptions.periodoDesde, commandOptions.pd);
  const periodTo = pickString(commandOptions.periodoHasta, commandOptions.ph);
  const associatedPeriod = periodFrom || periodTo ? { desde: periodFrom, hasta: periodTo } : fileInput?.periodoAsociado;

  const flagRates = parseIvaRateFlags(commandOptions.alicuota as string[] | undefined);
  const fileRateAmounts = fileInput?.alicuotas?.map((item) => ({ amount: item.monto, rate: item.tasa }));
  // --alicuota TASA tambien pisa las "alicuotas" del archivo.
  const ivaRateAmounts = flagRates.ivaRateAmounts ?? (flagRates.ivaRate ? undefined : fileRateAmounts);
  const exemptAmount = pickNumber(commandOptions.exento, fileInput?.importeExento);
  const untaxedAmount = pickNumber(commandOptions.nogravado, fileInput?.importeNoGravado);
  // Con varias alicuotas el monto total se puede omitir: es la suma de cada una mas exento y no gravado.
  const totalAmount =
    pickNumber(commandOptions.monto, fileInput?.montoTotal) ??
    (ivaRateAmounts ? sumRateAmounts(ivaRateAmounts, exemptAmount, untaxedAmount) : undefined);

  return {
    ...billingCommandSchema.parse({
      associatedPeriod,
      associatedVoucher: associatedVoucherFromFlags ?? associatedVoucherFromFile,
      billingDate: pickString(commandOptions.fecha, fileInput?.fechaComprobante),
      cancellation: commandOptions.anulacion === true || fileInput?.anulacion === true,
      cbu: pickString(commandOptions.cbu, fileInput?.cbu, usesFceDefaults ? defaults.defaultCbu : undefined),
      cbuAlias: pickString(
        commandOptions.alias,
        fileInput?.aliasCbu,
        usesFceDefaults ? defaults.defaultCbuAlias : undefined,
      ),
      concept: resolvedConcept,
      currencyCode,
      documentNumber: documentIdentity.documentNumber ?? fileInput?.numeroDocumento,
      documentType: documentIdentity.documentType ?? fileInput?.tipoDocumento,
      dryRun: !shouldEmit,
      dueDay: pickNumber(commandOptions.dia, fileInput?.dia),
      emit: shouldEmit,
      exchangeRate,
      exemptAmount,
      ivaRate: ivaRateAmounts
        ? undefined
        : (flagRates.ivaRate ?? fileInput?.alicuotaIva ?? (usesIvaRateDefault ? defaults.defaultIvaRate : undefined)),
      ivaRateAmounts,
      ivaCondition: resolvedIvaCondition,
      paymentDueDate: pickString(commandOptions.vencimiento, commandOptions.vto, fileInput?.vencimientoPago),
      pdf: resolvePdfFlag(commandOptions, fileInput),
      pdfDescription: pickString(commandOptions.descripcion, fileInput?.descripcion),
      pointOfSale: pickNumber(commandOptions.puntoVenta, commandOptions.pv, fileInput?.puntoVenta),
      receiverAddress: pickString(commandOptions.receptorDomicilio, fileInput?.receptorDomicilio),
      receiverName: pickString(commandOptions.receptorNombre, fileInput?.receptorNombre),
      sameCurrency,
      serviceEndDate: pickString(commandOptions.servicioHasta, commandOptions.sh, fileInput?.servicioHasta),
      serviceStartDate: pickString(commandOptions.servicioDesde, commandOptions.sd, fileInput?.servicioDesde),
      shortcut,
      totalAmount: totalAmount === undefined ? undefined : Math.round(totalAmount * 100) / 100,
      transferMode: pickString(commandOptions.transferencia, fileInput?.transferencia),
      untaxedAmount,
    }),
    __modeSource: modeSource,
  };
}

export function parseBillingCommandPlan(
  command: Command,
  shortcut: VoucherShortcut,
  defaults: BillingCommandDefaults = {},
): BillingCommandPlan {
  const commandOptions = command.optsWithGlobals<Record<string, unknown>>();
  const inputFilePath = typeof commandOptions.cargar === 'string' ? commandOptions.cargar : undefined;
  const fileInputSource = inputFilePath ? readJsonFile<BillingJsonInputSource>(inputFilePath) : undefined;
  const fileInputs = Array.isArray(fileInputSource) ? fileInputSource : [fileInputSource].filter(Boolean);

  if (fileInputs.length === 0) {
    const { __modeSource, ...input } = parseBillingCommandInputFromSource(command, shortcut, undefined, defaults);

    return {
      inputIndexes: [1],
      inputs: [input],
      invalidItems: [],
      modeSource: __modeSource,
      total: 1,
    };
  }

  // Un solo comprobante falla como siempre. En un lote se leen todos y se juntan los errores,
  // para informarlos de una vez en lugar de cortar en el primero.
  if (fileInputs.length === 1) {
    const { __modeSource, ...input } = parseBillingCommandInputFromSource(command, shortcut, fileInputs[0], defaults);

    return { inputIndexes: [1], inputs: [input], invalidItems: [], modeSource: __modeSource, total: 1 };
  }

  const parsed: Array<ReturnType<typeof parseBillingCommandInputFromSource>> = [];
  const inputIndexes: number[] = [];
  const invalidItems: BatchItemError[] = [];

  fileInputs.forEach((fileInput, position) => {
    try {
      parsed.push(parseBillingCommandInputFromSource(command, shortcut, fileInput, defaults));
      inputIndexes.push(position + 1);
    } catch (error) {
      invalidItems.push({ index: position + 1, message: describeBatchItemError(error) });
    }
  });

  const modeSource = parsed.some((input) => input.__modeSource === 'flags')
    ? 'flags'
    : parsed.some((input) => input.__modeSource === 'file')
      ? 'file'
      : 'default';

  return {
    inputIndexes,
    inputs: parsed.map(({ __modeSource: _modeSource, ...input }) => input),
    invalidItems,
    modeSource,
    total: fileInputs.length,
  };
}

export function parseBillingCommandInputs(
  command: Command,
  shortcut: VoucherShortcut,
  defaults: BillingCommandDefaults = {},
): BillingCommandInput[] {
  const plan = parseBillingCommandPlan(command, shortcut, defaults);

  if (plan.invalidItems.length > 0) {
    throw new BatchValidationError(plan.invalidItems, plan.total);
  }

  return plan.inputs;
}

export function parseBillingCommandInput(
  command: Command,
  shortcut: VoucherShortcut,
  defaults: BillingCommandDefaults = {},
): BillingCommandInput {
  return parseBillingCommandInputs(command, shortcut, defaults)[0];
}
