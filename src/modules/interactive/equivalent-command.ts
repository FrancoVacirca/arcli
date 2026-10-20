import { formatArgentineAmountInput } from '../../lib/numbers/argentine-amount';
import { isForeignCurrency } from '../billing/billing.currency';
import type { BillingCommandInput } from '../billing/billing.schemas';

const CONCEPT_FLAGS: Record<BillingCommandInput['concept'], string> = {
  productos: '--cp',
  'productos-servicios': '--csp',
  servicios: '--cs',
};

function identityFlags(input: BillingCommandInput): string[] {
  if (input.documentType === 'consumidor-final') {
    return ['--consumidor-final'];
  }

  return [`--${input.documentType}`, String(input.documentNumber)];
}

function associatedFlags(input: BillingCommandInput): string[] {
  const flags: string[] = [];
  const associated = input.associatedVoucher;

  if (associated) {
    if (associated.shortcut) {
      flags.push('--ac', associated.shortcut);
    } else if (associated.tipo) {
      flags.push('--at', String(associated.tipo));
    }

    if (associated.puntoVenta) flags.push('--apv', String(associated.puntoVenta));
    if (associated.numero) flags.push('--ar', String(associated.numero));
    if (associated.cuit) flags.push('--acuit', associated.cuit);
    if (associated.fecha) flags.push('--afecha', associated.fecha);
  }

  if (input.associatedPeriod?.desde) flags.push('--pd', input.associatedPeriod.desde);
  if (input.associatedPeriod?.hasta) flags.push('--ph', input.associatedPeriod.hasta);

  return flags;
}

/**
 * Comando de CLI que reproduce exactamente la entrada armada por el asistente.
 * Se muestra antes de emitir para que el usuario pueda repetirlo sin el modo interactivo.
 */
export function buildEquivalentCommand(
  input: BillingCommandInput,
  options: { readonly environment: 'produccion' | 'testing' },
): string {
  const parts = [
    'arcli',
    input.shortcut,
    '-m',
    formatArgentineAmountInput(input.totalAmount),
    CONCEPT_FLAGS[input.concept],
    ...identityFlags(input),
    '--ir',
    input.ivaCondition,
  ];

  if (input.pointOfSale) parts.push('--pv', String(input.pointOfSale));
  if (input.billingDate) parts.push('-f', input.billingDate);
  if (isForeignCurrency(input)) {
    parts.push('--moneda', input.currencyCode.toUpperCase());

    if (input.sameCurrency) {
      parts.push('--misma-moneda');
    } else if (input.exchangeRate) {
      parts.push('--cm', formatArgentineAmountInput(input.exchangeRate));
    }
  }
  if (input.ivaRate) parts.push('--alicuota', input.ivaRate);

  for (const { amount, rate } of input.ivaRateAmounts ?? []) {
    parts.push('--alicuota', `${rate}:${formatArgentineAmountInput(amount)}`);
  }
  if (input.exemptAmount) parts.push('--exento', formatArgentineAmountInput(input.exemptAmount));
  if (input.untaxedAmount) parts.push('--nogravado', formatArgentineAmountInput(input.untaxedAmount));
  if (input.serviceStartDate) parts.push('--sd', input.serviceStartDate);
  if (input.serviceEndDate) parts.push('--sh', input.serviceEndDate);
  if (input.paymentDueDate) parts.push('--vto', input.paymentDueDate);
  if (input.cbu) parts.push('--cbu', input.cbu);
  if (input.cbuAlias) parts.push('--alias', input.cbuAlias);
  if (input.transferMode) parts.push('--transferencia', input.transferMode);

  parts.push(...associatedFlags(input));

  if (input.cancellation) parts.push('--anulacion');
  // Siempre explicito: si la config cambia de entorno, el comando pegado sigue emitiendo donde se armo.
  parts.push(`--${options.environment}`);

  parts.push('--emitir');

  return parts.join(' ');
}
