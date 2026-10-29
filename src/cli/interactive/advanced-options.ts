import type { BillingCommandInput } from '../../modules/billing/billing.schemas';
import type { VoucherKindDefinition } from '../../modules/billing/billing.types';
import { parseAmountInput, parseExchangeRateInput } from '../../modules/interactive/amount-input';
import { ivaRateChoices } from '../../modules/interactive/choices';
import { BACK, type Back } from '../../modules/interactive/wizard';

import { askTextStep, chooseManyStep, chooseStep } from './prompts';
import { validateDate, validateExchangeRate, validateOptionalAmount } from './validators';

export type AdvancedOptions = Pick<
  BillingCommandInput,
  | 'currencyCode'
  | 'exchangeRate'
  | 'exemptAmount'
  | 'ivaRate'
  | 'paymentDueDate'
  | 'sameCurrency'
  | 'serviceEndDate'
  | 'serviceStartDate'
  | 'transferMode'
  | 'untaxedAmount'
>;

export type AdvancedOptionKey = 'alicuota' | 'divisas' | 'exento' | 'servicio' | 'transferencia' | 'vencimiento';
type Option = AdvancedOptionKey;

interface AdvancedContext {
  readonly concept: BillingCommandInput['concept'];
  /** Alicuota que se usa si no se elige otra: la de la config o 21%. */
  readonly defaultIvaRate: NonNullable<BillingCommandInput['ivaRate']>;
  /** Opciones que arrancan marcadas, por ejemplo la moneda al repetir una factura en dolares. */
  readonly preselected?: readonly Option[];
  readonly voucherKind: VoucherKindDefinition;
}

function describeCurrency(options: AdvancedOptions): string {
  if (!options.currencyCode || options.currencyCode === 'PES' || options.currencyCode === 'ARS') {
    return 'pesos';
  }

  return options.sameCurrency ? 'dólares, cotización oficial de ARCA' : `dólares, cotización ${options.exchangeRate}`;
}

function describeAmounts(options: AdvancedOptions): string {
  const parts = [
    options.exemptAmount ? `exento ${options.exemptAmount}` : undefined,
    options.untaxedAmount ? `no gravado ${options.untaxedAmount}` : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : 'sin exento ni no gravado';
}

async function askCurrency(current: AdvancedOptions): Promise<AdvancedOptions | Back> {
  const currency = await chooseStep('Moneda del comprobante:', [
    { name: 'Pesos', value: 'PES' as const },
    { name: 'Dólares (USD)', value: 'USD' as const },
  ]);

  if (currency === BACK) {
    return BACK;
  }

  if (currency === 'PES') {
    return { ...current, currencyCode: 'ARS', exchangeRate: undefined, sameCurrency: false };
  }

  const payment = await chooseStep('¿Cómo te pagan?', [
    { description: 'Ingresas la cotización acordada', name: 'En pesos', value: 'pesos' as const },
    { description: 'Se usa la cotización oficial de ARCA', name: 'En dólares', value: 'dolares' as const },
  ]);

  if (payment === BACK) {
    return BACK;
  }

  if (payment === 'dolares') {
    return { ...current, currencyCode: 'USD', exchangeRate: undefined, sameCurrency: true };
  }

  const rate = await askTextStep('Cotización del dólar:', { validate: validateExchangeRate });

  return rate === BACK
    ? BACK
    : { ...current, currencyCode: 'USD', exchangeRate: parseExchangeRateInput(rate), sameCurrency: false };
}

async function askExemptAmounts(current: AdvancedOptions): Promise<AdvancedOptions | Back> {
  const exempt = await askTextStep('Parte exenta del monto total (vacío si no hay):', {
    validate: validateOptionalAmount,
  });

  if (exempt === BACK) {
    return BACK;
  }

  const untaxed = await askTextStep('Parte no gravada del monto total (vacío si no hay):', {
    validate: validateOptionalAmount,
  });

  if (untaxed === BACK) {
    return BACK;
  }

  return { ...current, exemptAmount: parseAmountInput(exempt), untaxedAmount: parseAmountInput(untaxed) };
}

async function askServicePeriod(current: AdvancedOptions): Promise<AdvancedOptions | Back> {
  const start = await askTextStep('Servicio desde:', { validate: validateDate });

  if (start === BACK) {
    return BACK;
  }

  const end = await askTextStep('Servicio hasta:', { validate: validateDate });

  return end === BACK ? BACK : { ...current, serviceEndDate: end, serviceStartDate: start };
}

async function askPaymentDueDate(current: AdvancedOptions): Promise<AdvancedOptions | Back> {
  const due = await askTextStep('Vencimiento del pago:', { validate: validateDate });

  return due === BACK ? BACK : { ...current, paymentDueDate: due };
}

async function askIvaRate(current: AdvancedOptions, context: AdvancedContext): Promise<AdvancedOptions | Back> {
  const ivaRate = await chooseStep('Alícuota de IVA:', ivaRateChoices(), current.ivaRate ?? context.defaultIvaRate);

  return ivaRate === BACK ? BACK : { ...current, ivaRate };
}

async function askTransferMode(current: AdvancedOptions): Promise<AdvancedOptions | Back> {
  const transferMode = await chooseStep(
    'Modalidad de transferencia:',
    [
      { description: 'La opción habitual', name: 'Sistema de circulación abierta (SCA)', value: 'sca' as const },
      { name: 'Agente de deposito colectivo (ADC)', value: 'adc' as const },
    ],
    current.transferMode ?? 'sca',
  );

  return transferMode === BACK ? BACK : { ...current, transferMode };
}

function optionalChoices(options: AdvancedOptions, context: AdvancedContext) {
  const usesService = context.concept !== 'productos';
  const isFceInvoice = context.voucherKind.family === 'factura-credito-electronica';
  const discriminatesIva = context.voucherKind.letter !== 'c';

  return [
    ...(discriminatesIva
      ? [
          {
            description: `${(options.ivaRate ?? context.defaultIvaRate).replace('.', ',')}%`,
            name: 'Alícuota de IVA',
            value: 'alicuota' as const,
          },
        ]
      : []),
    { description: describeCurrency(options), name: 'Moneda extranjera', value: 'divisas' as const },
    ...(discriminatesIva
      ? [{ description: describeAmounts(options), name: 'Importe exento o no gravado', value: 'exento' as const }]
      : []),
    ...(usesService
      ? [
          {
            description: options.serviceStartDate ? `${options.serviceStartDate} al ${options.serviceEndDate}` : 'hoy',
            name: 'Período del servicio',
            value: 'servicio' as const,
          },
        ]
      : []),
    ...(usesService || isFceInvoice
      ? [
          {
            description: options.paymentDueDate ?? 'por defecto',
            name: 'Vencimiento del pago',
            value: 'vencimiento' as const,
          },
        ]
      : []),
    ...(isFceInvoice
      ? [
          {
            description: (options.transferMode ?? 'sca').toUpperCase(),
            name: 'Modalidad de transferencia',
            value: 'transferencia' as const,
          },
        ]
      : []),
  ];
}

/**
 * Despues de lo requerido, una sola pregunta con todos los opcionales: se marcan con espacio y Enter sigue
 * (sin marcar nada, todo queda por defecto). Despues se pregunta solo lo marcado, en orden. "Volver" en una
 * de esas preguntas vuelve a la seleccion, con lo marcado y lo ya respondido.
 */
export async function askAdvancedOptions(
  initial: AdvancedOptions,
  context: AdvancedContext,
): Promise<AdvancedOptions | Back> {
  const asks: Record<Option, (current: AdvancedOptions) => Promise<AdvancedOptions | Back>> = {
    alicuota: (current) => askIvaRate(current, context),
    divisas: askCurrency,
    exento: askExemptAmounts,
    servicio: askServicePeriod,
    transferencia: askTransferMode,
    vencimiento: askPaymentDueDate,
  };
  let options = initial;
  let selected: Option[] = [...(context.preselected ?? [])];

  for (;;) {
    const picked = await chooseManyStep<Option>(
      '¿Agregamos algún opcional? (espacio para marcar, Enter para seguir)',
      optionalChoices(options, context),
      selected,
    );

    if (picked === BACK) {
      return BACK;
    }

    selected = picked;

    let completed = true;

    for (const option of picked) {
      const updated = await asks[option](options);

      if (updated === BACK) {
        completed = false;
        break;
      }

      options = updated;
    }

    if (completed) {
      return options;
    }
  }
}
