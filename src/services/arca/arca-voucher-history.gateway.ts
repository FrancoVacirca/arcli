import type { Arca } from '@arcasdk/core';

import type { IssuedVoucher, VoucherHistoryGateway } from '../../modules/vouchers/voucher-history';

import { getLastAuthorizedNumber } from './last-voucher';

export class ArcaVoucherHistoryGateway implements VoucherHistoryGateway {
  public constructor(private readonly arca: Arca) {}

  public async getLastNumber(pointOfSale: number, voucherType: number): Promise<number> {
    return getLastAuthorizedNumber(this.arca, pointOfSale, voucherType);
  }

  public async getVoucher(
    number: number,
    pointOfSale: number,
    voucherType: number,
  ): Promise<IssuedVoucher | undefined> {
    const info = await this.arca.electronicBillingService.getVoucherInfo(number, pointOfSale, voucherType);

    // ARCA devuelve null cuando el comprobante no existe.
    if (!info?.cbteFch) {
      return undefined;
    }

    return {
      cae: info.codAutorizacion,
      caeExpiration: info.fchVto,
      concept: info.concepto,
      currency: info.monId,
      date: info.cbteFch,
      documentNumber: info.docNro ?? 0,
      documentTypeCode: info.docTipo ?? 99,
      exchangeRate: info.monCotiz,
      exemptAmount: info.impOpEx ?? 0,
      ivaAmount: info.impIVA ?? 0,
      netAmount: info.impNeto ?? 0,
      number,
      result: info.resultado,
      taxesAmount: info.impTrib ?? 0,
      total: info.impTotal ?? 0,
      untaxedAmount: info.impTotConc ?? 0,
    };
  }
}
