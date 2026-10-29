import { formatArcaDateAsArgentineDate } from '../../lib/dates/arca-date';
import { formatMoneyLabel } from '../../modules/billing/billing.labels';
import {
  type BillingCommandInput,
  billingCommandSchema,
  type BillingConcept,
} from '../../modules/billing/billing.schemas';
import type { VoucherKindDefinition } from '../../modules/billing/billing.types';
import { parseAmountInput } from '../../modules/interactive/amount-input';
import {
  conceptChoices,
  invoiceKindChoices,
  ivaRateChoices,
  noteKindChoices,
  receiverChoices,
} from '../../modules/interactive/choices';
import { copyInvoiceAmounts } from '../../modules/interactive/invoice-copy';
import { BACK, type Back, runWizard, type WizardStep } from '../../modules/interactive/wizard';
import { type IssuedVoucher, resolveDocumentType } from '../../modules/vouchers/voucher-history';
import { noticePanel, writeTerminalOutput } from '../../ui';

import { pickInvoice } from './invoice-picker';
import { askTextStep, chooseStep } from './prompts';
import { askReceiverIvaCondition, type ReceiverFromPadron, receiverInputFields } from './receiver-padron';
import { type InteractiveSession, previewAndEmit, requirePointOfSale } from './session';
import { normalizeDocumentNumber, validateAmount, validateCuit, validateDate, validateDni } from './validators';

const CONCEPTS_BY_CODE: Record<number, BillingConcept> = {
  1: 'productos',
  2: 'servicios',
  3: 'productos-servicios',
};

export type NoteKind = 'credito' | 'debito';

export interface NoteState {
  readonly cancellation?: boolean;
  readonly concept?: BillingConcept;
  readonly documentNumber?: number;
  readonly documentType?: BillingCommandInput['documentType'];
  /** Anula la factura entera: la nota copia exento y no gravado. */
  readonly annulsTotal?: boolean;
  readonly invoice?: IssuedVoucher;
  readonly invoiceKind?: VoucherKindDefinition;
  /** Punto de venta de la factura asociada; ingresada a mano puede no ser el configurado. */
  readonly invoicePointOfSale?: number;
  readonly ivaCondition?: BillingCommandInput['ivaCondition'];
  readonly receiver?: ReceiverFromPadron;
  readonly ivaRate?: BillingCommandInput['ivaRate'];
  /** Credito o debito: viene del menu principal. */
  readonly kind?: NoteKind;
  readonly periodFrom?: string;
  readonly periodTo?: string;
  /** Sobre una factura de la lista o sobre un periodo (solo notas comunes). */
  readonly target?: 'factura' | 'periodo';
  readonly totalAmount?: number;
}

const isPeriod = (state: NoteState): boolean => state.target === 'periodo';

async function askNoteAmount(
  state: NoteState,
): Promise<Back | { readonly annulsTotal: boolean; readonly totalAmount: number | undefined }> {
  const invoice = state.invoice;
  const label = state.kind === 'debito' ? 'Monto de la nota de débito:' : 'Monto de la nota de crédito:';
  // Con varias alicuotas o tributos no se puede armar una nota igual a la factura: solo parcial.
  const canAnnulTotal = Boolean(invoice && !copyInvoiceAmounts(invoice, state.invoiceKind?.letter ?? 'c').limitation);

  if (state.kind === 'credito' && invoice && canAnnulTotal) {
    const scope = await chooseStep('¿Total o parcial?', [
      { name: `Anular el total (${formatMoneyLabel(invoice.total)})`, value: 'total' as const },
      { name: 'Parcial (ingresar monto)', value: 'parcial' as const },
    ]);

    if (scope === BACK || scope === 'total') {
      return scope === BACK ? BACK : { annulsTotal: true, totalAmount: invoice.total };
    }
  }

  const answer = await askTextStep(label, {
    validate: (value) => {
      const valid = validateAmount(value);

      if (valid !== true || state.kind !== 'credito' || !invoice) {
        return valid;
      }

      return (parseAmountInput(value) ?? 0) <= invoice.total
        ? true
        : `No puede superar el total de la factura (${formatMoneyLabel(invoice.total)}).`;
    },
  });

  return answer === BACK ? BACK : { annulsTotal: false, totalAmount: parseAmountInput(answer) };
}

/** Pasos del flujo de notas; cada uno se puede deshacer con "Volver". */
export function noteSteps(session: InteractiveSession, pointOfSale: number): Array<WizardStep<NoteState>> {
  return [
    {
      name: 'tipo-factura',
      run: async () => {
        const invoiceKind = await chooseStep('¿Sobre qué tipo de factura?', invoiceKindChoices());

        return invoiceKind === BACK ? BACK : { invoiceKind, target: 'factura' };
      },
    },
    {
      name: 'asociacion',
      run: async () => {
        const target = await chooseStep('¿A qué la asociamos?', [
          {
            description: 'Elegis una de las últimas emitidas o la ingresas a mano',
            name: 'A una factura',
            value: 'factura' as const,
          },
          {
            description: 'Por ejemplo, un descuento sobre todo el mes',
            name: 'A un período',
            value: 'periodo' as const,
          },
        ]);

        return target === BACK ? BACK : { target };
      },
      // ARCA no acepta periodo asociado en notas FCE (10196).
      skip: (state) => Boolean(state.invoiceKind?.isElectronicCredit),
    },
    {
      name: 'factura',
      run: async (state) => {
        const invoiceKind = state.invoiceKind as VoucherKindDefinition;
        const picked = await pickInvoice(session, {
          message: `¿Sobre qué ${invoiceKind.displayName}?`,
          pointOfSale,
          voucherKind: invoiceKind,
        });

        if (picked === BACK) {
          return BACK;
        }

        const { invoice } = picked;
        const documentType = resolveDocumentType(invoice.documentTypeCode);

        if (!documentType) {
          writeTerminalOutput(
            noticePanel(
              'La factura tiene un tipo de documento que el asistente no soporta. Usa los flags del CLI.',
              'warning',
            ),
          );

          return BACK;
        }

        const copy = copyInvoiceAmounts(invoice, invoiceKind.letter);

        if (copy.limitation) {
          writeTerminalOutput(
            noticePanel(`${copy.limitation} La nota solo puede ser parcial; revisa la alícuota.`, 'warning'),
          );
        }

        // La nota hereda de la factura el receptor, el concepto, la moneda y la alicuota (si se puede deducir).
        return {
          concept: CONCEPTS_BY_CODE[invoice.concept ?? 2] ?? 'servicios',
          documentNumber: documentType === 'consumidor-final' ? undefined : invoice.documentNumber,
          documentType,
          invoice,
          invoicePointOfSale: picked.pointOfSale,
          ivaCondition: documentType === 'consumidor-final' ? 'consumidor-final' : undefined,
          ivaRate: copy.ivaRate,
        };
      },
      skip: isPeriod,
    },
    {
      name: 'periodo',
      run: async () => {
        const periodFrom = await askTextStep('Período desde:', { validate: validateDate });

        if (periodFrom === BACK) {
          return BACK;
        }

        const periodTo = await askTextStep('Período hasta:', { validate: validateDate });

        return periodTo === BACK ? BACK : { invoice: undefined, invoicePointOfSale: undefined, periodFrom, periodTo };
      },
      skip: (state) => !isPeriod(state),
    },
    {
      name: 'receptor',
      run: async (state) => {
        const documentType = await chooseStep(
          '¿A quien va la nota?',
          receiverChoices(state.invoiceKind?.letter ?? 'c'),
        );

        return documentType === BACK
          ? BACK
          : {
              documentNumber: undefined,
              documentType,
              ivaCondition: documentType === 'consumidor-final' ? 'consumidor-final' : undefined,
            };
      },
      skip: (state) => !isPeriod(state),
    },
    {
      name: 'documento',
      run: async (state) => {
        const isCuit = state.documentType === 'cuit';
        const answer = await askTextStep(isCuit ? 'CUIT del receptor:' : 'DNI del receptor:', {
          validate: isCuit ? validateCuit : validateDni,
        });

        return answer === BACK ? BACK : { documentNumber: normalizeDocumentNumber(answer) };
      },
      skip: (state) => !isPeriod(state) || state.documentType === 'consumidor-final',
    },
    {
      name: 'concepto',
      run: async () => {
        const concept = await chooseStep('¿Qué concepto ajusta la nota?', conceptChoices());

        return concept === BACK ? BACK : { concept };
      },
      skip: (state) => !isPeriod(state),
    },
    {
      name: 'monto',
      run: async (state) => {
        const amount = await askNoteAmount(state);

        return amount === BACK ? BACK : amount;
      },
    },
    {
      name: 'iva-receptor',
      run: async (state) => {
        // ARCA no devuelve la condicion IVA de la factura, asi que se pregunta, filtrada por la letra.
        return askReceiverIvaCondition(session, state, state.invoiceKind?.letter ?? 'c');
      },
      skip: (state) => state.documentType === 'consumidor-final',
    },
    {
      name: 'alicuota',
      run: async (state) => {
        const ivaRate = await chooseStep(
          isPeriod(state) ? 'Alícuota de IVA:' : 'Alícuota de IVA de la factura:',
          ivaRateChoices(),
        );

        return ivaRate === BACK ? BACK : { ivaRate };
      },
      // En la C no hay IVA; si la factura deja deducir la alicuota, no se pregunta.
      skip: (state) => state.invoiceKind?.letter === 'c' || (!isPeriod(state) && Boolean(state.ivaRate)),
    },
    {
      name: 'anulacion',
      run: async () => {
        const cancellation = await chooseStep('¿El comprador rechazo la factura?', [
          { name: 'Sí, es una nota de anulación', value: true },
          { name: 'No', value: false },
        ]);

        return cancellation === BACK ? BACK : { cancellation };
      },
      skip: (state) => !state.invoiceKind?.isElectronicCredit,
    },
  ];
}

/** Arma la entrada del CLI con lo que respondio el usuario. */
export function buildNoteInput(
  state: NoteState,
  session: InteractiveSession,
  pointOfSale: number,
): BillingCommandInput {
  const invoiceKind = state.invoiceKind as VoucherKindDefinition;
  const noteKind = noteKindChoices(state.kind ?? 'credito', invoiceKind);
  const invoice = state.invoice;
  // Una nota va en la moneda de su factura; si la anula entera, tambien copia exento y no gravado.
  const copy = !isPeriod(state) && invoice ? copyInvoiceAmounts(invoice, invoiceKind.letter) : undefined;

  return billingCommandSchema.parse({
    associatedPeriod: isPeriod(state) ? { desde: state.periodFrom, hasta: state.periodTo } : undefined,
    associatedVoucher:
      !isPeriod(state) && invoice
        ? {
            cuit: String(session.runtime.context.cuit),
            fecha: formatArcaDateAsArgentineDate(invoice.date),
            numero: invoice.number,
            puntoVenta: state.invoicePointOfSale ?? pointOfSale,
            shortcut: invoiceKind.shortcut,
          }
        : undefined,
    cancellation: state.cancellation ?? false,
    concept: state.concept,
    currencyCode: copy?.currencyCode,
    documentNumber: state.documentType === 'consumidor-final' ? undefined : state.documentNumber,
    documentType: state.documentType,
    exchangeRate: copy?.exchangeRate,
    exemptAmount: state.annulsTotal ? copy?.exemptAmount : undefined,
    ivaCondition: state.ivaCondition,
    ...receiverInputFields(state),
    ivaRate: state.ivaRate === '21' && !session.runtime.config.alicuotaPorDefecto ? undefined : state.ivaRate,
    shortcut: noteKind.shortcut,
    totalAmount: state.totalAmount,
    untaxedAmount: state.annulsTotal ? copy?.untaxedAmount : undefined,
  });
}

export async function runNoteFlow(session: InteractiveSession, kind: NoteKind): Promise<void> {
  const pointOfSale = requirePointOfSale(session);

  if (!pointOfSale) {
    return;
  }

  const state = await runWizard(noteSteps(session, pointOfSale), { kind });

  if (!state) {
    return;
  }

  await previewAndEmit(session, buildNoteInput(state, session, pointOfSale));
}
