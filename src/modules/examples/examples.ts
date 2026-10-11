import { toArgentineCalendarDate } from '../../lib/dates/arca-date';
import { badge, renderLogo, sectionHeading, toneText } from '../../ui';
import type { VoucherFamily, VoucherKindDefinition } from '../billing/billing.types';
import { VOUCHER_FAMILIES, VOUCHER_KIND_MAP, VOUCHER_SHORTCUTS } from '../billing/voucher-kind-map';

const ISSUER_HINT =
  'Estos ejemplos asumen que ya resolviste cuit emisor, credenciales y, en la version minima, tambien punto de venta por config.';

function resolveAmount(definition: VoucherKindDefinition): number {
  if (definition.letter === 'a') {
    return 1;
  }

  if (definition.letter === 'b') {
    return 15000;
  }

  return 300000;
}

function resolveIdentityLong(definition: VoucherKindDefinition): string[] {
  if (definition.letter === 'a') {
    return ['--cuit 20168598204', '--iva-receptor responsable-inscripto'];
  }

  return ['--consumidor-final', '--iva-receptor consumidor-final'];
}

function resolveIdentityShort(definition: VoucherKindDefinition): string[] {
  if (definition.letter === 'a') {
    return ['--cuit 20168598204', '--ir-ri'];
  }

  return ['--cfinal', '--ir-cf'];
}

function resolveAssociatedShortcut(definition: VoucherKindDefinition): string {
  if (!definition.requiresAssociatedVoucher) {
    return '';
  }

  if (definition.family === 'nota-credito') {
    return `f${definition.letter}`;
  }

  if (definition.family === 'nota-debito') {
    return `f${definition.letter}`;
  }

  if (definition.family === 'nota-credito-electronica') {
    return `fce${definition.letter}`;
  }

  return `fce${definition.letter}`;
}

const EXAMPLE_CBU = '0110599520000012345678';

interface ExampleDates {
  readonly associated: string;
  readonly billing: string;
  readonly paymentDue: string;
  readonly serviceEnd: string;
  readonly serviceStart: string;
}

function formatExampleDate(value: Date): string {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');

  return `${day}-${month}-${value.getFullYear()}`;
}

// Fechas relativas a hoy para que los ejemplos queden dentro de la ventana que acepta ARCA.
function resolveExampleDates(now: Date): ExampleDates {
  const argentineToday = toArgentineCalendarDate(now);
  // Fecha local armada con el dia argentino: las cuentas y el formato siguen en local.
  const today = new Date(argentineToday.year, argentineToday.month - 1, argentineToday.day);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const paymentDue = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10);

  return {
    associated: formatExampleDate(monthStart),
    billing: formatExampleDate(today),
    paymentDue: formatExampleDate(paymentDue),
    serviceEnd: formatExampleDate(today),
    serviceStart: formatExampleDate(monthStart),
  };
}

function isElectronicCreditNote(definition: VoucherKindDefinition): boolean {
  return definition.isElectronicCredit && definition.requiresAssociatedVoucher;
}

function resolveElectronicCreditFlags(
  definition: VoucherKindDefinition,
  dates: ExampleDates,
  variant: 'full' | 'minimal',
): string[] {
  if (!definition.isElectronicCredit) {
    return [];
  }

  if (isElectronicCreditNote(definition)) {
    return [`--afecha ${dates.associated}`];
  }

  return variant === 'full' ? [`--cbu ${EXAMPLE_CBU}`, '--transferencia sca'] : [`--cbu ${EXAMPLE_CBU}`];
}

function buildMinimalLong(definition: VoucherKindDefinition, dates: ExampleDates): string {
  const command = [
    `arcli ${definition.family} ${definition.letter}`,
    `--monto ${resolveAmount(definition)}`,
    '--concepto servicios',
  ];
  command.push(...resolveIdentityLong(definition));

  if (definition.requiresAssociatedVoucher) {
    command.push(
      `--ac ${resolveAssociatedShortcut(definition)}`,
      '--asociado-punto-venta 3',
      '--ar 120',
      '--acuit 20409509763',
    );
  }

  command.push(...resolveElectronicCreditFlags(definition, dates, 'minimal'), '--previsualizar');

  return command.join(' ');
}

function buildMinimalShort(definition: VoucherKindDefinition, dates: ExampleDates): string {
  const command = [`arcli ${definition.shortcut}`, `-m ${resolveAmount(definition)}`, '--cs'];
  command.push(...resolveIdentityShort(definition));

  if (definition.requiresAssociatedVoucher) {
    command.push(`--ac ${resolveAssociatedShortcut(definition)}`, '--apv 3', '--ar 120', '--acuit 20409509763');
  }

  command.push(...resolveElectronicCreditFlags(definition, dates, 'minimal'), '--previsualizar');

  return command.join(' ');
}

function buildFullLong(definition: VoucherKindDefinition, dates: ExampleDates): string {
  const command = [
    `arcli ${definition.family} ${definition.letter}`,
    `--monto ${resolveAmount(definition)}`,
    '--concepto servicios',
    '--punto-venta 3',
    `--fecha ${dates.billing}`,
    '--moneda PES',
    '--cotizacion-moneda 1',
    `--servicio-desde ${dates.serviceStart}`,
    `--servicio-hasta ${dates.serviceEnd}`,
  ];

  if (!isElectronicCreditNote(definition)) {
    command.push(`--vencimiento ${dates.paymentDue}`);
  }

  command.push(...resolveIdentityLong(definition));

  if (definition.requiresAssociatedVoucher) {
    command.push(
      `--ac ${resolveAssociatedShortcut(definition)}`,
      '--asociado-punto-venta 3',
      '--ar 120',
      '--acuit 20409509763',
    );
  }

  command.push(...resolveElectronicCreditFlags(definition, dates, 'full'), '--previsualizar');

  return command.join(' ');
}

function buildFullShort(definition: VoucherKindDefinition, dates: ExampleDates): string {
  const command = [
    `arcli ${definition.shortcut}`,
    `-m ${resolveAmount(definition)}`,
    '--cs',
    '--pv 3',
    `-f ${dates.billing}`,
    '--mda PES',
    '--cm 1',
    `--sd ${dates.serviceStart}`,
    `--sh ${dates.serviceEnd}`,
  ];

  if (!isElectronicCreditNote(definition)) {
    command.push(`--vto ${dates.paymentDue}`);
  }

  command.push(...resolveIdentityShort(definition));

  if (definition.requiresAssociatedVoucher) {
    command.push(`--ac ${resolveAssociatedShortcut(definition)}`, '--apv 3', '--ar 120', '--acuit 20409509763');
  }

  command.push(...resolveElectronicCreditFlags(definition, dates, 'full'), '--previsualizar');

  return command.join(' ');
}

function formatVoucherExample(definition: VoucherKindDefinition, dates: ExampleDates): string {
  return [
    sectionHeading(definition.displayName),
    '',
    `${badge('MINIMA LARGA', 'info')}`,
    `${buildMinimalLong(definition, dates)}`,
    '',
    `${badge('MINIMA CORTA', 'success')}`,
    `${buildMinimalShort(definition, dates)}`,
    '',
    `${badge('FULL LARGA', 'warning')}`,
    `${buildFullLong(definition, dates)}`,
    '',
    `${badge('FULL CORTA', 'debug')}`,
    `${buildFullShort(definition, dates)}`,
  ].join('\n');
}

function renderFamilyExamples(family: VoucherFamily, dates: ExampleDates): string {
  return VOUCHER_SHORTCUTS.map((shortcut) => VOUCHER_KIND_MAP[shortcut])
    .filter((definition) => definition.family === family)
    .map((definition) => formatVoucherExample(definition, dates))
    .join('\n\n\n');
}

export function renderExamples(today = new Date()): string {
  const dates = resolveExampleDates(today);

  return [
    renderLogo().trim(),
    '',
    `${badge('MINIMA', 'info')} datos esenciales`,
    `${badge('FULL', 'warning')} mas campos explicitados`,
    `${badge('LARGA', 'success')} comando largo`,
    `${badge('CORTA', 'debug')} shortcut y aliases`,
    '',
    toneText('SEGURIDAD', 'warning'),
    'Todos usan --previsualizar para evitar emisiones reales por error.',
    'Si queres emitir de verdad, reemplaza --previsualizar por --emitir.',
    'Para emitir en produccion necesitas --produccion junto con --emitir.',
    'Para guardar el PDF con el QR, agrega --exportar-pdf al emitir (ver docs/pdf.md).',
    '',
    ISSUER_HINT,
    '',
    ...VOUCHER_FAMILIES.flatMap((family) => [renderFamilyExamples(family, dates), '']),
    '',
  ].join('\n');
}
