import type { IPeriodoAsoc } from '@arcasdk/core/lib/domain/types/voucher.types';

import { formatArcaDateAsArgentineDate, parseArgentineDateInputAsArcaDate } from '../../lib/dates/arca-date';
import { InputValidationError } from '../../lib/errors/app-error';

import { formatVoucherLabel } from './billing.mappers';
import type { BillingCommandInput } from './billing.schemas';
import type { VoucherKindDefinition } from './billing.types';

const MINIMUM_PERIOD_DATE = '20060101';

/**
 * PeriodoAsoc es la alternativa a CbtesAsoc para NC/ND que ajustan un periodo y no una factura puntual (10197).
 * No aplica a facturas (10198) ni a comprobantes FCE (10196).
 */
export function resolveAssociatedPeriod(
  input: Pick<BillingCommandInput, 'associatedPeriod' | 'associatedVoucher'>,
  voucherKind: VoucherKindDefinition,
  billingDate: string,
): IPeriodoAsoc | undefined {
  const period = input.associatedPeriod;

  if (!period) {
    return undefined;
  }

  const label = formatVoucherLabel(voucherKind);

  if (!voucherKind.requiresAssociatedVoucher) {
    throw new InputValidationError(`La ${label} no usa período asociado: solo aplica a notas de crédito o débito.`);
  }

  if (voucherKind.isElectronicCredit) {
    throw new InputValidationError(
      `La ${label} no admite período asociado: ARCA solo lo acepta en notas comunes. Usá el comprobante asociado (--ac).`,
    );
  }

  if (input.associatedVoucher) {
    throw new InputValidationError(
      'Usá un comprobante asociado (--ac/--at) o un período asociado (--periodo-desde/--periodo-hasta), pero no ambos.',
    );
  }

  if (!period.desde || !period.hasta) {
    throw new InputValidationError('El período asociado requiere ambas fechas: --periodo-desde y --periodo-hasta.');
  }

  const FchDesde = parseArgentineDateInputAsArcaDate(period.desde);
  const FchHasta = parseArgentineDateInputAsArcaDate(period.hasta);

  if (FchDesde < MINIMUM_PERIOD_DATE) {
    throw new InputValidationError('El período asociado tiene que ser posterior al 01/01/2006.');
  }

  if (FchDesde > FchHasta) {
    throw new InputValidationError('En el período asociado, --periodo-desde no puede ser posterior a --periodo-hasta.');
  }

  if (FchHasta > billingDate) {
    throw new InputValidationError(
      `El período asociado no puede terminar después de la fecha de la ${label} (${formatArcaDateAsArgentineDate(billingDate)}).`,
    );
  }

  return { FchDesde, FchHasta };
}
