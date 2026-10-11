import type { ICbtesAsoc, IIva, INextVoucher } from '@arcasdk/core/lib/domain/types/voucher.types';

import { formatDateAsArcaDate, parseArgentineDateInputAsArcaDate } from '../../lib/dates/arca-date';
import { InputValidationError } from '../../lib/errors/app-error';
import type { ResolvedArcaRuntime } from '../../services/arca/arca-context.resolver';
import { evaluateFceObligation, type FceObligationGateway, shouldCheckFceObligation } from '../fce/fce-obligation';

import { resolveTaxAmounts, sumTaxAmounts } from './billing.amounts';
import { resolveAssociatedPeriod } from './billing.associated-period';
import { resolveAssociatedVouchers } from './billing.associated-vouchers';
import { isForeignCurrency, needsOfficialExchangeRate, resolveBillingCurrencyFields } from './billing.currency';
import { resolveBillingDateRange } from './billing.date-range';
import { EmissionUncertainError } from './billing.errors';
import { resolveElectronicCreditOptionals } from './billing.fce';
import { validateConsumerIdentification, validateIvaConditionForVoucher } from './billing.iva-receptor';
import {
  resolveBillingConceptCode,
  resolveBillingCurrencyCode,
  resolveBillingDocumentTypeCode,
  resolveBillingIvaConditionCode,
} from './billing.mappers';
import type { BillingCommandInput } from './billing.schemas';
import type { VoucherKindDefinition } from './billing.types';
import type { BillingExecutionResult, BillingGateway } from './billing.types.internal';
import { validateDocumentIdentity } from './billing.validation';
import { createDryRunResponse, mapBillingResponse } from './billing-response';
import { getVoucherKindByShortcut } from './voucher-kind-map';

export interface BillingExecutionOptions {
  readonly gateway: BillingGateway;
  readonly input: BillingCommandInput;
  readonly runtime: ResolvedArcaRuntime;
  readonly warnings?: readonly string[];
}

interface CliVoucherPayload extends Omit<INextVoucher, 'CbtesAsoc' | 'DocNro'> {
  CbtesAsoc?: ICbtesAsoc[];
  DocNro?: number;
  Iva?: IIva[];
}

export class BillingService {
  /**
   * Completa la cotizacion oficial cuando el comprobante se cancela en la misma moneda extranjera.
   * Se resuelve antes de la vista previa para que el preview muestre el valor que se va a enviar.
   */
  public async resolveExchangeRate(input: BillingCommandInput, gateway: BillingGateway): Promise<BillingCommandInput> {
    if (!needsOfficialExchangeRate(input)) {
      return input;
    }

    return {
      ...input,
      exchangeRate: await gateway.getQuotation(resolveBillingCurrencyCode(input.currencyCode)),
    };
  }

  public async execute(options: BillingExecutionOptions): Promise<BillingExecutionResult> {
    const voucherKind = this.requireVoucherKind(options.input.shortcut);
    const payload = this.buildVoucherPayload(options.input, options.runtime, voucherKind);

    if (options.input.dryRun || !options.input.emit) {
      return {
        dryRun: true,
        environment: options.runtime.environment,
        payload,
        response: createDryRunResponse(),
        voucherKind,
        warnings: options.warnings ?? [],
      };
    }

    let response: Awaited<ReturnType<BillingGateway['createNextVoucher']>>;

    try {
      response = await options.gateway.createNextVoucher(payload);
    } catch (error) {
      throw new EmissionUncertainError({ cause: error, pointOfSale: payload.PtoVta, shortcut: voucherKind.shortcut });
    }

    return {
      dryRun: false,
      environment: options.runtime.environment,
      payload,
      response: mapBillingResponse(response),
      voucherKind,
      warnings: options.warnings ?? [],
    };
  }

  /**
   * Avisa si el comprobante elegido no coincide con el regimen FCE del receptor.
   * Es informativo: si ARCA no responde, devuelve el motivo como aviso y no frena la emision.
   */
  public async resolveFceWarnings(input: BillingCommandInput, gateway: FceObligationGateway): Promise<string[]> {
    const voucherKind = this.requireVoucherKind(input.shortcut);

    if (!shouldCheckFceObligation(input, voucherKind)) {
      return [];
    }

    const issueDate = input.billingDate
      ? parseArgentineDateInputAsArcaDate(input.billingDate)
      : formatDateAsArcaDate(new Date());
    const amountInPesos = input.totalAmount * (isForeignCurrency(input) ? (input.exchangeRate ?? 1) : 1);

    try {
      const obligation = await gateway.getObligation(input.documentNumber, issueDate);

      return evaluateFceObligation(obligation, voucherKind, amountInPesos);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'error desconocido';

      return [`No se pudo verificar el regimen FCE del receptor: ${reason}`];
    }
  }

  public buildVoucherPayload(
    input: BillingCommandInput,
    runtime: ResolvedArcaRuntime,
    voucherKind = this.requireVoucherKind(input.shortcut),
  ): INextVoucher {
    const pointOfSale = input.pointOfSale ?? runtime.pointOfSale;

    if (!pointOfSale) {
      throw new InputValidationError(
        'Falta el punto de venta. Use --punto-venta o --pv, o configurelo con "arcli config establecer puntoVenta <valor>".',
      );
    }

    const dateRange = resolveBillingDateRange(input, voucherKind);
    const concept = resolveBillingConceptCode(input.concept);
    const documentType = resolveBillingDocumentTypeCode(input.documentType);
    const ivaCondition = resolveBillingIvaConditionCode(input.ivaCondition);
    const associatedVouchers = resolveAssociatedVouchers({
      billingDate: dateRange.billingDate,
      emitterCuit: runtime.context.cuit,
      input,
      requireVoucherKind: (shortcut) => this.requireVoucherKind(shortcut),
      voucherKind,
    });
    const currencyFields = resolveBillingCurrencyFields(input, dateRange.billingDate, formatDateAsArcaDate(new Date()));
    const taxAmounts = resolveTaxAmounts(input, voucherKind);

    validateDocumentIdentity(input, voucherKind);
    validateIvaConditionForVoucher(input.ivaCondition, voucherKind);
    validateConsumerIdentification(input, currencyFields.MonCotiz, voucherKind);

    const payload: CliVoucherPayload = {
      CantReg: 1,
      CbteFch: dateRange.billingDate,
      CbteTipo: voucherKind.arcaType,
      Concepto: concept,
      CondicionIVAReceptorId: ivaCondition,
      DocTipo: documentType,
      FchServDesde: dateRange.serviceStartDate,
      FchServHasta: dateRange.serviceEndDate,
      FchVtoPago: dateRange.paymentDueDate,
      ImpIVA: taxAmounts.ivaAmount,
      ImpNeto: taxAmounts.netAmount,
      ImpOpEx: taxAmounts.exemptAmount,
      ImpTotConc: taxAmounts.untaxedAmount,
      ImpTotal: sumTaxAmounts(taxAmounts),
      ImpTrib: 0,
      MonCotiz: currencyFields.MonCotiz,
      MonId: currencyFields.MonId,
      PtoVta: pointOfSale,
    };

    if (currencyFields.CanMisMonExt) {
      payload.CanMisMonExt = currencyFields.CanMisMonExt;
    }

    if (taxAmounts.iva) {
      payload.Iva = taxAmounts.iva;
    }

    if (typeof input.documentNumber === 'number') {
      payload.DocNro = input.documentNumber;
    }

    if (associatedVouchers) {
      payload.CbtesAsoc = associatedVouchers;
    }

    const associatedPeriod = resolveAssociatedPeriod(input, voucherKind, dateRange.billingDate);

    if (associatedPeriod) {
      payload.PeriodoAsoc = associatedPeriod;
    }

    const optionals = resolveElectronicCreditOptionals(input, voucherKind);

    if (optionals) {
      payload.Opcionales = optionals;
    }

    // El SDK tipa DocNro como obligatorio, pero el CLI permite omitirlo cuando el usuario no lo informa.
    return payload as INextVoucher;
  }

  private requireVoucherKind(shortcut: string): VoucherKindDefinition {
    const definition = getVoucherKindByShortcut(shortcut);

    if (!definition) {
      throw new InputValidationError(`El atajo "${shortcut}" no corresponde a un comprobante soportado.`);
    }

    return definition;
  }
}
