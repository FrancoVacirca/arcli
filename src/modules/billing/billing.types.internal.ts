import type { CreateVoucherResultDto } from '@arcasdk/core/lib/application/dto/electronic-billing';
import type { INextVoucher, IVoucher } from '@arcasdk/core/lib/domain/types/voucher.types';

import type { PdfOutcome } from '../pdf/pdf.types';

import type { VoucherKindDefinition } from './billing.types';

export interface BillingGateway {
  /** Emite en ARCA. Un error aca puede haber dejado el comprobante autorizado. */
  createVoucher(voucher: IVoucher): Promise<CreateVoucherResultDto>;
  /** Autentica y pide el ultimo numero autorizado. Un error aca no emitio nada. */
  getNextVoucherNumber(pointOfSale: number, voucherType: number): Promise<number>;
  getQuotation(currencyCode: string): Promise<number>;
}

export interface BillingResponseSummary {
  readonly cae: string | null;
  readonly caeVencimiento: string | null;
  readonly errors: unknown[];
  readonly events: unknown[];
  readonly observaciones: string[];
  readonly observacion: string | null;
  readonly raw: CreateVoucherResultDto | null;
  readonly resultado: string | null;
  readonly suggestions: string[];
  readonly status: 'aprobado' | 'observado' | 'rechazado';
}

export interface BillingExecutionResult {
  readonly dryRun: boolean;
  readonly environment: 'produccion' | 'testing';
  readonly payload: INextVoucher;
  /** Solo si se intento generar el PDF. */
  readonly pdf?: PdfOutcome;
  /** Solo para mostrar: ARCA no recibe el nombre del receptor. */
  readonly receiver?: {
    readonly ivaConditionFromPadron: boolean;
    readonly name?: string;
  };
  readonly response: BillingResponseSummary;
  readonly voucherKind: VoucherKindDefinition;
  readonly warnings?: readonly string[];
}
