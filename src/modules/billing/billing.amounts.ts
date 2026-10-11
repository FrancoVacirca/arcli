import type { IIva } from '@arcasdk/core/lib/domain/types/voucher.types';
import Big from 'big.js';

import { InputValidationError } from '../../lib/errors/app-error';

import { formatVoucherLabel } from './billing.mappers';
import type { BillingCommandInput, BillingIvaRate } from './billing.schemas';
import type { VoucherKindDefinition } from './billing.types';

/** Ids de alicuota de FEParamGetTiposIva. */
const IVA_RATE_DEFINITIONS: Record<BillingIvaRate, { readonly id: number; readonly rate: string }> = {
  '0': { id: 3, rate: '0' },
  '2.5': { id: 9, rate: '0.025' },
  '5': { id: 8, rate: '0.05' },
  '10.5': { id: 4, rate: '0.105' },
  '21': { id: 5, rate: '0.21' },
  '27': { id: 6, rate: '0.27' },
};

export const DEFAULT_IVA_RATE: BillingIvaRate = '21';

export interface TaxAmounts {
  readonly exemptAmount: number;
  readonly iva?: IIva[];
  readonly ivaAmount: number;
  readonly netAmount: number;
  readonly untaxedAmount: number;
}

type TaxAmountsInput = Pick<
  BillingCommandInput,
  'exemptAmount' | 'ivaRate' | 'ivaRateAmounts' | 'totalAmount' | 'untaxedAmount'
>;

export function resolveIvaRateLabel(aliquotId: number): string | undefined {
  const entry = Object.entries(IVA_RATE_DEFINITIONS).find(([, definition]) => definition.id === aliquotId);

  return entry ? `${entry[0].replace('.', ',')}%` : undefined;
}

function validateLetterCAmounts(input: TaxAmountsInput, voucherKind: VoucherKindDefinition): void {
  const flags = [
    input.ivaRate || input.ivaRateAmounts ? '--alicuota' : undefined,
    input.exemptAmount ? '--exento' : undefined,
    input.untaxedAmount ? '--nogravado' : undefined,
  ].filter((flag): flag is string => Boolean(flag));

  if (flags.length > 0) {
    throw new InputValidationError(
      `La ${formatVoucherLabel(voucherKind)} no discrimina IVA ni importes exentos o no gravados. Quite ${flags.join(', ')}.`,
    );
  }
}

/**
 * Reparte el total entre no gravado, exento, neto gravado e IVA.
 * ImpTotal = ImpTotConc + ImpOpEx + ImpNeto + ImpIVA (10048); la C no informa IVA (10071).
 */
export function resolveTaxAmounts(input: TaxAmountsInput, voucherKind: VoucherKindDefinition): TaxAmounts {
  if (voucherKind.letter === 'c') {
    validateLetterCAmounts(input, voucherKind);

    return {
      exemptAmount: 0,
      ivaAmount: 0,
      netAmount: input.totalAmount,
      untaxedAmount: 0,
    };
  }

  const exemptAmount = input.exemptAmount ?? 0;
  const untaxedAmount = input.untaxedAmount ?? 0;
  const taxedTotal = new Big(input.totalAmount).minus(exemptAmount).minus(untaxedAmount);

  if (taxedTotal.lt(0)) {
    throw new InputValidationError('El importe exento mas el no gravado no puede superar el monto total.');
  }

  if (taxedTotal.eq(0)) {
    return { exemptAmount, ivaAmount: 0, netAmount: 0, untaxedAmount };
  }

  const parts = resolveTaxedParts(input, taxedTotal);
  const iva = parts.map(({ amount, rate }) => {
    const definition = IVA_RATE_DEFINITIONS[rate];
    const BaseImp = roundAmount(amount.div(new Big(1).plus(definition.rate)));

    return { BaseImp, Id: definition.id, Importe: roundAmount(amount.minus(BaseImp)) };
  });

  // Con neto mayor a cero el array de IVA es obligatorio, incluso al 0% (10070).
  // La suma de BaseImp tiene que dar ImpNeto (10061).
  return {
    exemptAmount,
    iva,
    ivaAmount: roundAmount(iva.reduce((sum, item) => sum.plus(item.Importe), new Big(0))),
    netAmount: roundAmount(iva.reduce((sum, item) => sum.plus(item.BaseImp), new Big(0))),
    untaxedAmount,
  };
}

/**
 * Importe gravado (IVA incluido) de cada alicuota. Con una sola alicuota es todo lo gravado; con varias,
 * los montos de cada una tienen que sumar lo gravado del total.
 */
function resolveTaxedParts(
  input: TaxAmountsInput,
  taxedTotal: Big,
): Array<{ readonly amount: Big; readonly rate: BillingIvaRate }> {
  if (!input.ivaRateAmounts?.length) {
    return [{ amount: taxedTotal, rate: input.ivaRate ?? DEFAULT_IVA_RATE }];
  }

  const byRate = new Map<BillingIvaRate, Big>();

  for (const { amount, rate } of input.ivaRateAmounts) {
    byRate.set(rate, (byRate.get(rate) ?? new Big(0)).plus(amount));
  }

  const sum = [...byRate.values()].reduce((total, amount) => total.plus(amount), new Big(0));

  // Los importes tienen 2 decimales como maximo, asi que la suma tiene que dar exacta.
  if (!sum.eq(taxedTotal)) {
    throw new InputValidationError(
      `La suma de las alicuotas (${formatPlain(sum)}) no coincide con lo gravado del monto total (${formatPlain(taxedTotal)}). Revise --monto, --alicuota, --exento y --nogravado.`,
    );
  }

  return [...byRate.entries()].map(([rate, amount]) => ({ amount, rate }));
}

function formatPlain(value: Big): string {
  return value.round(2, Big.roundHalfUp).toFixed(2);
}

function roundAmount(value: Big): number {
  return value.round(2, Big.roundHalfUp).toNumber();
}

/** ImpTotal: la suma exacta de sus partes (10048), sin errores de coma flotante. */
export function sumTaxAmounts(amounts: TaxAmounts): number {
  return roundAmount(
    new Big(amounts.untaxedAmount).plus(amounts.exemptAmount).plus(amounts.netAmount).plus(amounts.ivaAmount),
  );
}
