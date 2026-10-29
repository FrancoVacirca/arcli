import { type Command, Help } from 'commander';

import { CERTIFICATE_GUIDE_URL } from '../lib/links';
import type { VoucherFamily, VoucherLetter, VoucherShortcut } from '../modules/billing/billing.types';
import {
  getVoucherKindByFamilyAndLetter,
  getVoucherKindByShortcut,
  VOUCHER_FAMILIES,
  VOUCHER_LETTERS,
} from '../modules/billing/voucher-kind-map';
import type { ConfigPublicKey } from '../modules/config/config.schemas';
import { CONFIG_LABELS, CONFIG_SECTIONS } from '../modules/config/config.sections';
import { buildMinimalFamilyExample, buildMinimalShortcutExample } from '../modules/examples/examples';
import { CONFIG_FIELDS } from '../modules/interactive/config-fields';
import { renderLogo } from '../ui';

import { CLI_VERSION } from './version';

const FAMILY_LABELS: Record<VoucherFamily, string> = {
  factura: 'Factura',
  'factura-credito-electronica': 'Factura de crédito electrónica',
  'nota-credito': 'Nota de crédito',
  'nota-credito-electronica': 'Nota de crédito electrónica',
  'nota-debito': 'Nota de débito',
  'nota-debito-electronica': 'Nota de débito electrónica',
};

const FAMILY_SHORTCUTS: Record<VoucherFamily, readonly [VoucherShortcut, VoucherShortcut, VoucherShortcut]> = {
  factura: ['fa', 'fb', 'fc'],
  'factura-credito-electronica': ['fcea', 'fceb', 'fcec'],
  'nota-credito': ['nca', 'ncb', 'ncc'],
  'nota-credito-electronica': ['ncea', 'nceb', 'ncec'],
  'nota-debito': ['nda', 'ndb', 'ndc'],
  'nota-debito-electronica': ['ndea', 'ndeb', 'ndec'],
};

/** Lo que vale para cualquier comprobante. */
const CORE_RULES = [
  'Usá --emitir o --previsualizar, no los dos.',
  'Una sola identidad del receptor: --cuit, --cuil, --dni o --consumidor-final.',
  'Un solo IVA receptor: --iva-receptor o un flag --ir-*.',
  'Un solo concepto: --concepto o uno entre --cs, --cp y --csp.',
  'Con servicios: --servicio-desde y --servicio-hasta, o --dia para el día de vencimiento.',
  'Sin --fecha usa hoy. Lo que no pasás por flag sale del JSON de --cargar o de la config.',
];

interface HelpScope {
  readonly isElectronicCredit: boolean;
  readonly isNote: boolean;
  readonly letters: readonly VoucherLetter[];
}

/** Las reglas que dependen del comprobante; la lista de opciones ya muestra solo las que aplican. */
function createRules(scope: HelpScope): string {
  const rules = [...CORE_RULES];

  if (scope.letters.some((letter) => letter !== 'c')) {
    rules.push(
      'IVA (A y B): --alicuota usa 21 por defecto, o la clave alícuota de la config. Para varias, repetí --alicuota TASA:MONTO con el IVA incluido; --monto pasa a ser opcional.',
    );
  }

  if (scope.isNote) {
    rules.push(
      scope.isElectronicCredit
        ? 'Asociado: la factura FCE con --ac o --at, --apv, --ar y --afecha; --acuit toma tu CUIT. Con --anulacion, anula una factura que rechazó el comprador.'
        : 'Asociado: el comprobante con --ac o --at, --apv, --ar y --acuit, o un período con --periodo-desde y --periodo-hasta.',
    );
  } else if (scope.isElectronicCredit) {
    rules.push('FCE: necesita CBU (--cbu o la clave cbu de la config); --transferencia es sca por defecto.');
  }

  return section('Reglas', compactList(rules));
}

function section(title: string, body: string): string {
  return [title, body].join('\n');
}

function compactList(values: readonly string[]): string {
  return values.map((value) => `  - ${value}`).join('\n');
}

/** Los 18 atajos en una tabla familia × letra, en lugar de 24 renglones en la lista de comandos. */
function createProgramVoucherTable(): string {
  const width = Math.max(...VOUCHER_FAMILIES.map((family) => family.length)) + 2;
  const column = (value: string) => value.padEnd(7);
  const rows = VOUCHER_FAMILIES.map(
    (family) => `  ${family.padEnd(width)}${FAMILY_SHORTCUTS[family].map(column).join('').trimEnd()}`,
  );

  return section(
    'Comprobantes (atajo por familia y letra)',
    [
      `  ${''.padEnd(width)}${['A', 'B', 'C'].map(column).join('').trimEnd()}`,
      ...rows,
      '  arcli fc ... es lo mismo que arcli factura c ...; cada uno tiene su ayuda: arcli fc --ayuda',
    ].join('\n'),
  );
}

function createProgramQuickStart(): string {
  return section(
    'Para empezar',
    compactList([
      'Revisá que esté todo listo: arcli config revisar',
      'Vista previa: arcli fc -m 300000 --cs --consumidor-final --ir-cf',
      'Emitir: agregá --emitir (sin el flag, en una terminal te pregunta). --produccion usa el entorno real.',
      'Paso a paso, sin flags: arcli (sin argumentos)',
      'Un comando se arma con el comprobante, --monto, el concepto (--cs, --cp, --csp), el receptor (--cuit, --dni o --consumidor-final) y su IVA (--ir-*).',
    ]),
  );
}

function createProgramMore(): string {
  return section(
    'Más ayuda',
    compactList([
      'Ejemplos listos para copiar: arcli ejemplos',
      'Autocompletado con Tab de comandos y flags: arcli completado instalar',
      'Para scripts, usá --json: la salida en texto puede cambiar.',
      'Repositorio: https://github.com/LcsGrz/arcli · Actualizar: npm install -g arcli@latest',
    ]),
  );
}

function createShortcutSummary(shortcut: VoucherShortcut): string {
  const definition = getVoucherKindByShortcut(shortcut);

  if (!definition) {
    return '';
  }

  const minimal = buildMinimalShortcutExample(definition);

  return [
    section(
      'Comprobante',
      compactList([
        `${definition.displayName}, tipo ARCA ${definition.arcaType}. Es lo mismo que arcli ${definition.family} ${definition.letter}.`,
      ]),
    ),
    '',
    section(
      'Ejemplos',
      compactList([
        `Vista previa: ${minimal}`,
        `Emitir: ${minimal} --emitir`,
        `Desde un JSON: arcli ${shortcut} --cargar ./voucher.json --json`,
        'Más ejemplos: arcli ejemplos',
      ]),
    ),
  ].join('\n');
}

function createFamilySummary(family: VoucherFamily): string {
  const [a, b, c] = FAMILY_SHORTCUTS[family];

  return [
    section(
      'Familia',
      compactList([`${FAMILY_LABELS[family]}, letras A, B y C: arcli ${family} <a|b|c>. Atajos: ${a}, ${b} y ${c}.`]),
    ),
    '',
    section(
      'Ejemplos',
      compactList([
        ...VOUCHER_LETTERS.flatMap((letter) => {
          const definition = getVoucherKindByFamilyAndLetter(family, letter);

          return definition ? [`Letra ${letter.toUpperCase()}: ${buildMinimalFamilyExample(definition)}`] : [];
        }),
        `Desde un JSON: arcli ${family} c --cargar ./voucher.json --json`,
      ]),
    ),
  ].join('\n');
}

const BOOLEAN_CONFIG_VALUES = 'true/false, si/no o 1/0';

/** Valores de las claves que el asistente no edita o que, siendo booleanas, aceptan mas formas que si/no. */
const CONFIG_VALUE_OVERRIDES: Partial<Record<ConfigPublicKey, string>> = {
  alicuota: 'general, reducida, incrementada, cero o el número: 0, 2.5, 5, 10.5, 21, 27; por defecto 21',
  bruto: BOOLEAN_CONFIG_VALUES,
  consultarPadron: `${BOOLEAN_CONFIG_VALUES}; por defecto si`,
  emitir: BOOLEAN_CONFIG_VALUES,
  json: BOOLEAN_CONFIG_VALUES,
  verificarFce: BOOLEAN_CONFIG_VALUES,
};

function describeConfigValues(key: ConfigPublicKey): string | undefined {
  const override = CONFIG_VALUE_OVERRIDES[key];

  if (override) {
    return override;
  }

  const field = CONFIG_FIELDS.find((candidate) => candidate.key === key);

  if (!field) {
    return undefined;
  }

  if (field.choices) {
    return field.choices.join(', ');
  }

  return field.path ? 'ruta' : field.hint;
}

/** Todas las claves publicas, por seccion, con su nombre y valores: sale de la misma tabla que `arcli config`. */
function createConfigKeysSection(): string {
  const lines = CONFIG_SECTIONS.flatMap((configSection) => [
    `  ${configSection.label}`,
    ...configSection.keys.map((key) => {
      const values = describeConfigValues(key);

      return `    - ${key}: ${CONFIG_LABELS[key]}${values ? ` (${values})` : ''}`;
    }),
  ]);

  return section(
    'Claves',
    [...lines, '  Guardar: arcli config establecer <clave> <valor>. Borrar: arcli config eliminar <clave>.'].join('\n'),
  );
}

export function createConfigSetHelp(): string {
  return ['', createConfigKeysSection(), '', section('Ejemplo', '  - arcli config establecer puntoVenta 3'), ''].join(
    '\n',
  );
}

export function createConfigHelp(): string {
  return [
    '',
    section(
      'Para que sirve',
      [
        '  - Guardar defaults del CLI para no repetir flags en cada corrida.',
        '  - Definir rutas de certificados y claves por entorno.',
        '  - Revisar si el entorno está listo antes de emitir.',
      ].join('\n'),
    ),
    '',
    section(
      'Casos comunes',
      [
        '  - Guardar defaults para no repetir flags como puntoVenta, concepto o IVA receptor.',
        '  - Revisar si testing o producción tienen credenciales y contexto válidos.',
        '  - Debuggear por que un comando pide datos que pensabas tener guardados.',
      ].join('\n'),
    ),
    '',
    section(
      'Comandos más usados',
      [
        '  - Ver config actual: arcli config',
        '  - Revisar entorno: arcli config revisar',
        '  - Ver ruta del archivo: arcli config ruta',
        '  - Guardar un default: arcli config establecer puntoVenta 3',
        '  - Guardar una credencial: arcli config establecer cert.testing /ruta/cert.crt',
      ].join('\n'),
    ),
    '',
    createConfigKeysSection(),
    '',
    section(
      'Ejemplos',
      [
        '  - arcli config establecer cuit 20409509763',
        '  - arcli config establecer entorno produccion',
        '  - arcli config establecer ivaReceptor consumidor-final',
        '  - arcli config establecer key.produccion /ruta/clave.key',
        '  - arcli config establecer ticketPath /ruta/tickets',
        '  - arcli config eliminar json',
      ].join('\n'),
    ),
    '',
    section(
      'Errores frecuentes',
      [
        '  - Faltan cert.testing o key.testing: corré arcli config revisar.',
        '  - Punto de venta no configurado: guardá puntoVenta o pasalo por flag.',
        '  - Emitir por defecto activado sin querer: revisá el valor de emitir.',
      ].join('\n'),
    ),
    '',
    section(
      'No tenés certificado todavía?',
      ['  - Guía paso a paso (testing y producción), con capturas de ARCA:', `    ${CERTIFICATE_GUIDE_URL}`].join('\n'),
    ),
    '',
  ].join('\n');
}

export function createStorybookHelp(): string {
  return [
    '',
    section(
      'Escenas disponibles',
      [
        '  - arcli storybook',
        '  - arcli storybook bordes',
        '  - arcli storybook colores',
        '  - arcli storybook componentes',
        '  - arcli storybook comprobantes',
        '  - arcli storybook configuracion',
        '  - arcli storybook errores',
        '  - arcli storybook json',
      ].join('\n'),
    ),
    '',
    section(
      'Cuando usarlo',
      [
        '  - Revisar la UI del CLI sin pegarle a ARCA.',
        '  - Probar escenas visuales mientras ajusta paneles, colores o contratos JSON.',
      ].join('\n'),
    ),
    '',
  ].join('\n');
}

export function createExamplesHelp(): string {
  return [
    '',
    section(
      'Para que sirve',
      [
        '  - Mostrar ejemplos seguros y listos para copiar de todos los comprobantes soportados.',
        '  - Comparar la forma larga y la forma corta del mismo comando.',
        '  - Ver rápido que cambia entre una variante mínima y una full.',
      ].join('\n'),
    ),
    '',
    section(
      'Como leer la salida',
      [
        '  - Mínima: datos esenciales del comprobante.',
        '  - Full: más campos explicitados para el mismo flujo.',
        '  - Larga: comando largo y flags descriptivos.',
        '  - Corta: shortcut y aliases practicos.',
      ].join('\n'),
    ),
    '',
    section(
      'Seguridad',
      [
        '  - Todos los ejemplos usan --previsualizar para evitar emisiones reales por error.',
        '  - Si querés emitir, reemplaza --previsualizar por --emitir.',
      ].join('\n'),
    ),
    '',
  ].join('\n');
}

export function createFceObligationHelp(): string {
  return [
    '',
    section(
      'Para que sirve',
      [
        '  - Saber si a un receptor le corresponde factura comun o Factura de Crédito Electrónica (FCE).',
        '  - ARCA informa si está obligado a recibir FCE y desde que monto.',
      ].join('\n'),
    ),
    '',
    section(
      'Ejemplos',
      ['  - arcli fce-obligado 30546689979', '  - arcli fce-obligado 30546689979 --fecha 15/10 --json'].join('\n'),
    ),
    '',
    section(
      'Requisitos',
      [
        '  - El certificado tiene que estar autorizado para el servicio wsfecred en ARCA.',
        '  - Para chequearlo en cada factura: arcli config establecer verificarFce true',
      ].join('\n'),
    ),
    '',
  ].join('\n');
}

export function createPadronHelp(): string {
  return [
    '',
    section(
      'Para que sirve',
      [
        '  - Ver razón social, domicilio fiscal, condición IVA, impuestos y actividad de un CUIT.',
        '  - Al facturar con --cuit, arcli usa el mismo dato para completar el IVA receptor si no pasa --ir.',
      ].join('\n'),
    ),
    '',
    section('Ejemplos', ['  - arcli padron 20201797064', '  - arcli padron 20201797064 --json'].join('\n')),
    '',
    section(
      'Requisitos',
      [
        '  - El certificado tiene que estar autorizado para el servicio ws_sr_constancia_inscripcion en ARCA.',
        '  - Para no consultarlo al facturar: arcli config establecer consultarPadron false',
      ].join('\n'),
    ),
    '',
  ].join('\n');
}

export function createCompletionHelp(): string {
  return [
    '',
    section(
      'Para que sirve',
      compactList([
        'Completar con Tab comandos, flags y valores: arcli f<Tab>, arcli fc --ir<Tab>, arcli config establecer <Tab>.',
        'La lista sale de la versión instalada: después de actualizar arcli no hay que reinstalar nada.',
      ]),
    ),
    '',
    section(
      'Uso',
      compactList([
        'Instalar: arcli completado instalar (usa el shell de $SHELL; o arcli completado instalar zsh)',
        'Ver si está instalado: arcli completado',
        'Desinstalar: arcli completado desinstalar',
        'Ver el script sin instalarlo: arcli completado zsh',
        'Después de instalar, abrí una terminal nueva.',
      ]),
    ),
    '',
  ].join('\n');
}

export function createVoucherQueryHelp(): string {
  return [
    '',
    section(
      'Ejemplos',
      [
        '  - arcli ultimos fb                  ultimas 15 facturas B del punto de venta configurado',
        '  - arcli ultimos nca --cantidad 25   ultimas 25 notas de credito A',
        '  - arcli consultar fb 14             detalle de la factura B numero 14',
        '  - arcli consultar fb 14 --json      lo mismo, en JSON',
      ].join('\n'),
    ),
    '',
    section(
      'Detalles',
      [
        '  - El tipo es el atajo del comprobante: fa, fb, fc, nca, ndb, fcea, etc.',
        '  - Sin --pv usa el punto de venta de la config.',
        '  - Solo consulta: no emite ni modifica nada.',
      ].join('\n'),
    ),
    '',
  ].join('\n');
}

export function createShortcutHelp(shortcut: VoucherShortcut): string {
  const definition = getVoucherKindByShortcut(shortcut);

  if (!definition) {
    return '';
  }

  return [
    '',
    createShortcutSummary(shortcut),
    '',
    createRules({
      isElectronicCredit: definition.isElectronicCredit,
      isNote: definition.requiresAssociatedVoucher,
      letters: [definition.letter],
    }),
    '',
  ].join('\n');
}

export function createFamilyHelp(family: VoucherFamily): string {
  return [
    '',
    createFamilySummary(family),
    '',
    createRules({
      isElectronicCredit: family.includes('electronica'),
      isNote: family.includes('nota'),
      letters: VOUCHER_LETTERS,
    }),
    '',
  ].join('\n');
}

export function createProgramHelp(): string {
  return ['', createProgramVoucherTable(), '', createProgramQuickStart(), '', createProgramMore(), ''].join('\n');
}

/** Lo que commander escribe en ingles en la ayuda. */
const HELP_TITLES: Readonly<Record<string, string>> = {
  'Arguments:': 'Argumentos:',
  'Commands:': 'Comandos:',
  'Global Options:': 'Opciones globales:',
  'Options:': 'Opciones:',
  'Usage:': 'Uso:',
};

const HELP_TERMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\[options\]/g, '[opciones]'],
  [/\[command\]/g, '[comando]'],
];

function translateHelpTerms(text: string): string {
  return HELP_TERMS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

const defaultHelp = new Help();

export function configureSpanishHelp(command: Command): void {
  command.configureHelp({
    commandUsage: (cmd) => translateHelpTerms(defaultHelp.commandUsage(cmd)),
    styleTitle: (title) => HELP_TITLES[title] ?? title,
    subcommandTerm: (cmd) => translateHelpTerms(defaultHelp.subcommandTerm(cmd)),
  });
  command.helpCommand(false);
  command.helpOption('--ayuda', 'mostrar ayuda');
  command.showHelpAfterError('(usa "ayuda" para ver ejemplos y opciones)');
}

export function createProgramHeader(): string {
  return renderLogo(CLI_VERSION);
}
