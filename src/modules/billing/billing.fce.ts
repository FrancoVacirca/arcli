import type { IOpcional } from '@arcasdk/core/lib/domain/types/voucher.types';

import { InputValidationError } from '../../lib/errors/app-error';

import { formatVoucherLabel } from './billing.mappers';
import type { BillingCommandInput } from './billing.schemas';
import type { VoucherKindDefinition } from './billing.types';

/** Codigos de "Adicionales por R.G." que usa FCE (FEParamGetTiposOpcional). */
export const FCE_OPTIONAL_IDS = {
  cancellation: '22',
  cbu: '2101',
  cbuAlias: '2102',
  transferMode: '27',
} as const;

export const DEFAULT_FCE_TRANSFER_MODE = 'sca';

type FceInput = Pick<BillingCommandInput, 'cancellation' | 'cbu' | 'cbuAlias' | 'transferMode'>;

export function isElectronicCreditInvoice(voucherKind: VoucherKindDefinition): boolean {
  return voucherKind.family === 'factura-credito-electronica';
}

function listInvoiceOnlyFlags(input: FceInput): string[] {
  return [
    input.cbu ? '--cbu' : undefined,
    input.cbuAlias ? '--alias' : undefined,
    input.transferMode ? '--transferencia' : undefined,
  ].filter((flag): flag is string => Boolean(flag));
}

/**
 * Arma `Opcionales` segun el tipo de comprobante:
 * - factura FCE: CBU obligatorio (10168), alias opcional y modalidad de transferencia obligatoria (10216)
 * - NC/ND FCE: solo el codigo de anulacion, obligatorio (10173); sin CBU, alias ni transferencia (10172)
 * - resto: ningun opcional de FCE (10169)
 */
export function resolveElectronicCreditOptionals(
  input: FceInput,
  voucherKind: VoucherKindDefinition,
): IOpcional[] | undefined {
  const invoiceOnlyFlags = listInvoiceOnlyFlags(input);
  const label = formatVoucherLabel(voucherKind);

  if (!voucherKind.isElectronicCredit) {
    const flags = input.cancellation ? [...invoiceOnlyFlags, '--anulacion'] : invoiceOnlyFlags;

    if (flags.length > 0) {
      throw new InputValidationError(`${flags.join(', ')} solo aplica a comprobantes de crédito electrónica (FCE).`);
    }

    return undefined;
  }

  if (!isElectronicCreditInvoice(voucherKind)) {
    if (invoiceOnlyFlags.length > 0) {
      throw new InputValidationError(
        `La ${label} no lleva ${invoiceOnlyFlags.join(', ')}: solo van en la factura FCE.`,
      );
    }

    return [{ Id: FCE_OPTIONAL_IDS.cancellation, Valor: input.cancellation ? 'S' : 'N' }];
  }

  if (input.cancellation) {
    throw new InputValidationError(`La ${label} no usa --anulacion: solo aplica a notas de crédito o débito FCE.`);
  }

  if (!input.cbu) {
    throw new InputValidationError(
      `La ${label} requiere el CBU del emisor. Usá --cbu o configuralo con "arcli config establecer cbu <22 digitos>".`,
    );
  }

  const optionals: IOpcional[] = [{ Id: FCE_OPTIONAL_IDS.cbu, Valor: input.cbu }];

  if (input.cbuAlias) {
    optionals.push({ Id: FCE_OPTIONAL_IDS.cbuAlias, Valor: input.cbuAlias });
  }

  optionals.push({
    Id: FCE_OPTIONAL_IDS.transferMode,
    Valor: (input.transferMode ?? DEFAULT_FCE_TRANSFER_MODE).toUpperCase(),
  });

  return optionals;
}
