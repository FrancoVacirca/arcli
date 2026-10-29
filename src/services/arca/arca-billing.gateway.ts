import type { Arca } from '@arcasdk/core';
import type { CreateVoucherResultDto } from '@arcasdk/core/lib/application/dto/electronic-billing';
import type { IVoucher } from '@arcasdk/core/lib/domain/types/voucher.types';

import { AppError } from '../../lib/errors/app-error';
import type { BillingGateway } from '../../modules/billing/billing.types.internal';

import { getLastAuthorizedNumber } from './last-voucher';

/** Tope de numeracion de ARCA; el SDK lo valida igual en `createNextVoucher`. */
const MAX_VOUCHER_NUMBER = 99_999_999;

export class ArcaBillingGateway implements BillingGateway {
  public constructor(private readonly arca: Arca) {}

  /**
   * Primer paso de `createNextVoucher` del SDK: autentica en WSAA y pide el ultimo numero autorizado.
   * Si falla, no se envio nada a ARCA. Como el SDK, sin comprobantes previos arranca en 1.
   */
  public async getNextVoucherNumber(pointOfSale: number, voucherType: number): Promise<number> {
    const nextNumber = (await getLastAuthorizedNumber(this.arca, pointOfSale, voucherType)) + 1;

    if (nextNumber > MAX_VOUCHER_NUMBER) {
      throw new Error(`Numero de comprobante no puede ser mayor a ${MAX_VOUCHER_NUMBER}`);
    }

    return nextNumber;
  }

  /** Segundo paso: la llamada que emite. Si falla, ARCA pudo haber autorizado el comprobante igual. */
  public async createVoucher(voucher: IVoucher): Promise<CreateVoucherResultDto> {
    return this.arca.electronicBillingService.createVoucher(voucher);
  }

  public async getQuotation(currencyCode: string): Promise<number> {
    const result = await this.arca.electronicBillingService.getQuotation(currencyCode);
    const exchangeRate = result.resultGet?.monCotiz;

    if (typeof exchangeRate !== 'number' || exchangeRate <= 0) {
      throw new AppError(`ARCA no devolvio una cotizacion valida para ${currencyCode}.`, {
        code: 'ARCA_QUOTATION_ERROR',
        details: { errors: result.errors },
      });
    }

    return exchangeRate;
  }
}
