import { listAllowedIvaConditions } from '../billing/billing.iva-receptor';
import { formatIvaConditionLabel } from '../billing/billing.labels';
import { resolveBillingIvaConditionCode } from '../billing/billing.mappers';
import type {
  BillingConcept,
  BillingDocumentType,
  BillingIvaCondition,
  BillingIvaRate,
} from '../billing/billing.schemas';
import type { VoucherKindDefinition, VoucherLetter, VoucherShortcut } from '../billing/billing.types';
import { VOUCHER_KIND_MAP } from '../billing/voucher-kind-map';

export interface InteractiveChoice<T> {
  readonly description?: string;
  readonly name: string;
  readonly value: T;
}

const INVOICE_DESCRIPTIONS: Record<VoucherLetter, string> = {
  a: 'Entre responsables inscriptos, o de RI a monotributista',
  b: 'De responsable inscripto a consumidor final, exento u otros',
  c: 'La emiten monotributistas y exentos',
};

const INVOICE_SHORTCUTS: readonly VoucherShortcut[] = ['fc', 'fb', 'fa', 'fcec', 'fceb', 'fcea'];

export function invoiceKindChoices(): Array<InteractiveChoice<VoucherKindDefinition>> {
  return INVOICE_SHORTCUTS.map((shortcut) => {
    const definition = VOUCHER_KIND_MAP[shortcut];
    const description = definition.isElectronicCredit
      ? 'Factura de Crédito Electrónica MiPyMEs, para grandes empresas'
      : INVOICE_DESCRIPTIONS[definition.letter];

    return { description, name: `${definition.displayName} (${shortcut})`, value: definition };
  });
}

export function noteKindChoices(kind: 'credito' | 'debito', invoice: VoucherKindDefinition): VoucherKindDefinition {
  const prefix = kind === 'credito' ? 'nc' : 'nd';
  const shortcut = `${prefix}${invoice.isElectronicCredit ? 'e' : ''}${invoice.letter}` as VoucherShortcut;

  return VOUCHER_KIND_MAP[shortcut];
}

export function receiverChoices(letter: VoucherLetter): Array<InteractiveChoice<BillingDocumentType>> {
  const choices: Array<InteractiveChoice<BillingDocumentType>> = [];

  // La A no admite consumidor final (10243), asi que solo se identifica por CUIT.
  if (listAllowedIvaConditions(letter).includes('consumidor-final')) {
    choices.push({ name: 'Consumidor final (sin identificar)', value: 'consumidor-final' });
  }

  choices.push({ name: 'Con CUIT', value: 'cuit' });

  if (letter !== 'a') {
    choices.push({ name: 'Con DNI', value: 'dni' });
  }

  return choices;
}

export function ivaConditionChoices(letter: VoucherLetter): Array<InteractiveChoice<BillingIvaCondition>> {
  return listAllowedIvaConditions(letter).map((condition) => ({
    name: formatIvaConditionLabel(resolveBillingIvaConditionCode(condition)),
    value: condition,
  }));
}

export function conceptChoices(): Array<InteractiveChoice<BillingConcept>> {
  return [
    { name: 'Servicios', value: 'servicios' },
    { name: 'Productos', value: 'productos' },
    { name: 'Productos y servicios', value: 'productos-servicios' },
  ];
}

export function ivaRateChoices(): Array<InteractiveChoice<BillingIvaRate>> {
  return (['21', '10.5', '27', '5', '2.5', '0'] as const).map((rate) => ({
    name: `${rate.replace('.', ',')}%`,
    value: rate,
  }));
}
