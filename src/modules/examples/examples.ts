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

/** Una nota asocia una factura de su misma letra y categoria: `nca` -> `fa`, `ndeb` -> `fceb`. */
function resolveAssociatedShortcut(definition: VoucherKindDefinition): string {
  return `${definition.isElectronicCredit ? 'fce' : 'f'}${definition.letter}`;
}

const EXAMPLE_CBU = '0110599520000012345678';

/** En NC/ND FCE el asociado tiene que ser del CUIT emisor: `--acuit` se omite y se toma de la config. */
function resolveAssociatedFlags(definition: VoucherKindDefinition, form: 'long' | 'short'): string[] {
  if (!definition.requiresAssociatedVoucher) {
    return [];
  }

  return [
    `--ac ${resolveAssociatedShortcut(definition)}`,
    form === 'long' ? '--asociado-punto-venta 3' : '--apv 3',
    '--ar 120',
    ...(definition.isElectronicCredit ? [] : ['--acuit 20409509763']),
  ];
}

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

  command.push(...resolveAssociatedFlags(definition, 'long'));

  command.push(...resolveElectronicCreditFlags(definition, dates, 'minimal'));

  return command.join(' ');
}

function buildMinimalShort(definition: VoucherKindDefinition, dates: ExampleDates): string {
  const command = [`arcli ${definition.shortcut}`, `-m ${resolveAmount(definition)}`, '--cs'];
  command.push(...resolveIdentityShort(definition));

  command.push(...resolveAssociatedFlags(definition, 'short'));

  command.push(...resolveElectronicCreditFlags(definition, dates, 'minimal'));

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

  command.push(...resolveAssociatedFlags(definition, 'long'));

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

  command.push(...resolveAssociatedFlags(definition, 'short'));

  command.push(...resolveElectronicCreditFlags(definition, dates, 'full'), '--previsualizar');

  return command.join(' ');
}

function formatVoucherExample(definition: VoucherKindDefinition, dates: ExampleDates): string {
  return [
    sectionHeading(definition.displayName),
    '',
    `${badge('MINIMA LARGA', 'info')}`,
    `${buildMinimalLong(definition, dates)} --previsualizar`,
    '',
    `${badge('MINIMA CORTA', 'success')}`,
    `${buildMinimalShort(definition, dates)} --previsualizar`,
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

/** El comando minimo por shortcut (`arcli nca -m 1 --cs ...`), sin modo de ejecucion. Lo usa tambien la ayuda. */
export function buildMinimalShortcutExample(definition: VoucherKindDefinition, today = new Date()): string {
  return buildMinimalShort(definition, resolveExampleDates(today));
}

/** El comando minimo por familia y letra (`arcli nota-credito a --monto 1 ...`), sin modo de ejecucion. */
export function buildMinimalFamilyExample(definition: VoucherKindDefinition, today = new Date()): string {
  return buildMinimalLong(definition, resolveExampleDates(today));
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
