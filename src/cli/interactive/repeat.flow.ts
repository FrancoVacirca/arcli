import { formatMoneyLabel } from '../../modules/billing/billing.labels';
import type { BillingConcept } from '../../modules/billing/billing.schemas';
import type { VoucherKindDefinition } from '../../modules/billing/billing.types';
import { parseAmountInput } from '../../modules/interactive/amount-input';
import { invoiceKindChoices } from '../../modules/interactive/choices';
import { copyInvoiceAmounts } from '../../modules/interactive/invoice-copy';
import { currentMonthPeriod, previousMonthPeriod, type ServicePeriod } from '../../modules/interactive/periods';
import { BACK, runWizard, type WizardStep } from '../../modules/interactive/wizard';
import { type IssuedVoucher, resolveDocumentType } from '../../modules/vouchers/voucher-history';
import { noticePanel, writeTerminalOutput } from '../../ui';

import { askAdvancedOptions } from './advanced-options';
import { buildInvoiceInput, type InvoiceState } from './invoice.flow';
import { pickInvoice } from './invoice-picker';
import { askTextStep, chooseStep } from './prompts';
import { askReceiverIvaCondition } from './receiver-padron';
import { type InteractiveSession, previewAndEmit, requirePointOfSale } from './session';
import { validateAmount, validateCbu, validateDate } from './validators';

const CONCEPTS_BY_CODE: Record<number, BillingConcept> = {
  1: 'productos',
  2: 'servicios',
  3: 'productos-servicios',
};

export interface RepeatState extends InvoiceState {
  readonly original?: IssuedVoucher;
}

const LOCAL_CURRENCIES = new Set(['PES', 'ARS', undefined]);

function describePeriod(period: ServicePeriod): string {
  return `${period.from} al ${period.to}`;
}

/**
 * Repetir una factura: se elige una de las ultimas emitidas y se copian el comprobante, el receptor, el concepto,
 * el monto y la alicuota. Las fechas se actualizan: la factura sale con fecha de hoy y el periodo se elige.
 */
export function repeatSteps(
  session: InteractiveSession,
  pointOfSale: number,
  today: Date = new Date(),
): Array<WizardStep<RepeatState>> {
  const { config } = session.runtime;

  return [
    {
      name: 'tipo',
      run: async () => {
        const voucherKind = await chooseStep('¿Qué tipo de factura querés repetir?', invoiceKindChoices());

        return voucherKind === BACK ? BACK : { voucherKind };
      },
    },
    {
      name: 'factura',
      run: async (state) => {
        const voucherKind = state.voucherKind as VoucherKindDefinition;
        const picked = await pickInvoice(session, { message: '¿Cuál repetimos?', pointOfSale, voucherKind });

        if (picked === BACK) {
          return BACK;
        }

        const original = picked.invoice;
        const documentType = resolveDocumentType(original.documentTypeCode);

        if (!documentType) {
          writeTerminalOutput(
            noticePanel(
              'La factura tiene un tipo de documento que el asistente no soporta. Usa los flags del CLI.',
              'warning',
            ),
          );

          return BACK;
        }

        const copy = copyInvoiceAmounts(original, voucherKind.letter);

        if (copy.limitation) {
          writeTerminalOutput(
            noticePanel(`${copy.limitation} Revisa la alícuota y el monto antes de emitir.`, 'warning'),
          );
        }

        return {
          advanced: {
            currencyCode: 'ARS',
            exemptAmount: copy.exemptAmount,
            ivaRate: copy.ivaRate,
            sameCurrency: false,
            untaxedAmount: copy.untaxedAmount,
          },
          concept: CONCEPTS_BY_CODE[original.concept ?? 2] ?? 'servicios',
          documentNumber: documentType === 'consumidor-final' ? undefined : original.documentNumber,
          documentType,
          ivaCondition: documentType === 'consumidor-final' ? 'consumidor-final' : undefined,
          original,
          totalAmount: original.total,
        };
      },
    },
    {
      name: 'iva-receptor',
      // ARCA no devuelve la condicion IVA de la factura, asi que se pregunta.
      run: async (state) => {
        return askReceiverIvaCondition(session, state, state.voucherKind?.letter ?? 'c', config.ivaReceptorPorDefecto);
      },
      skip: (state) => state.documentType === 'consumidor-final',
    },
    {
      name: 'monto',
      run: async (state) => {
        const original = state.original as IssuedVoucher;
        // Si no se puede reproducir (varias alicuotas, tributos), "mismo monto" no daria la misma factura.
        const reproducible = !copyInvoiceAmounts(original, state.voucherKind?.letter ?? 'c').limitation;
        const scope = reproducible
          ? await chooseStep('¿Mismo monto?', [
              { name: `Sí, ${formatMoneyLabel(original.total)}`, value: 'mismo' as const },
              { name: 'No, ingresar otro monto', value: 'otro' as const },
            ])
          : ('otro' as const);

        if (scope === BACK || scope === 'mismo') {
          return scope === BACK ? BACK : { totalAmount: original.total };
        }

        const answer = await askTextStep('Monto total:', { validate: validateAmount });

        return answer === BACK ? BACK : { totalAmount: parseAmountInput(answer) };
      },
    },
    {
      name: 'periodo',
      run: async (state) => {
        const current = currentMonthPeriod(today);
        const previous = previousMonthPeriod(today);
        const choice = await chooseStep<'hoy' | 'otro' | ServicePeriod>('Período del servicio:', [
          { description: describePeriod(current), name: 'Este mes', value: current },
          { description: describePeriod(previous), name: 'El mes pasado', value: previous },
          { description: 'Desde y hasta hoy', name: 'Solo hoy', value: 'hoy' as const },
          { name: 'Otro período', value: 'otro' as const },
        ]);

        if (choice === BACK) {
          return BACK;
        }

        const advanced = { ...state.advanced };

        if (choice === 'hoy') {
          return { advanced: { ...advanced, serviceEndDate: undefined, serviceStartDate: undefined } };
        }

        if (choice !== 'otro') {
          return { advanced: { ...advanced, serviceEndDate: choice.to, serviceStartDate: choice.from } };
        }

        const from = await askTextStep('Servicio desde:', { validate: validateDate });

        if (from === BACK) {
          return BACK;
        }

        const to = await askTextStep('Servicio hasta:', { validate: validateDate });

        return to === BACK ? BACK : { advanced: { ...advanced, serviceEndDate: to, serviceStartDate: from } };
      },
      skip: (state) => state.concept === 'productos',
    },
    {
      name: 'cbu',
      run: async () => {
        const cbu = await askTextStep('CBU del emisor (22 digitos):', { validate: validateCbu });

        return cbu === BACK ? BACK : { cbu };
      },
      skip: (state) => state.voucherKind?.family !== 'factura-credito-electronica' || Boolean(config.cbu),
    },
    {
      name: 'opcionales',
      run: async (state) => {
        // La cotizacion de la factura original ya no sirve: si era en moneda extranjera, arranca marcada.
        const foreign = !LOCAL_CURRENCIES.has(state.original?.currency);

        if (foreign) {
          writeTerminalOutput(
            noticePanel('La factura original era en moneda extranjera: completa la moneda y la cotización.', 'info'),
          );
        }

        const advanced = await askAdvancedOptions(state.advanced, {
          concept: state.concept ?? 'servicios',
          defaultIvaRate: state.advanced.ivaRate ?? config.alicuotaPorDefecto ?? '21',
          // Sin alicuota deducida de la factura, que la elija en lugar de caer en la de la config.
          preselected: [
            ...(foreign ? (['divisas'] as const) : []),
            ...(!state.advanced.ivaRate && state.voucherKind?.letter !== 'c' ? (['alicuota'] as const) : []),
          ],
          voucherKind: state.voucherKind as VoucherKindDefinition,
        });

        return advanced === BACK ? BACK : { advanced };
      },
    },
  ];
}

export async function runRepeatFlow(session: InteractiveSession): Promise<void> {
  const pointOfSale = requirePointOfSale(session);

  if (!pointOfSale) {
    return;
  }

  const state = await runWizard(repeatSteps(session, pointOfSale), {
    advanced: { currencyCode: 'ARS', sameCurrency: false },
  });

  if (!state) {
    return;
  }

  await previewAndEmit(session, buildInvoiceInput(state, session));
}
