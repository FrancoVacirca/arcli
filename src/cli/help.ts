import type { Command } from 'commander';

import { CERTIFICATE_GUIDE_URL } from '../lib/links';
import type { VoucherFamily, VoucherShortcut } from '../modules/billing/billing.types';
import {
  getVoucherKindByFamilyAndLetter,
  getVoucherKindByShortcut,
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
  'factura-credito-electronica': 'Factura de credito electronica',
  'nota-credito': 'Nota de credito',
  'nota-credito-electronica': 'Nota de credito electronica',
  'nota-debito': 'Nota de debito',
  'nota-debito-electronica': 'Nota de debito electronica',
};

const FAMILY_SHORTCUTS: Record<VoucherFamily, readonly [VoucherShortcut, VoucherShortcut, VoucherShortcut]> = {
  factura: ['fa', 'fb', 'fc'],
  'factura-credito-electronica': ['fcea', 'fceb', 'fcec'],
  'nota-credito': ['nca', 'ncb', 'ncc'],
  'nota-credito-electronica': ['ncea', 'nceb', 'ncec'],
  'nota-debito': ['nda', 'ndb', 'ndc'],
  'nota-debito-electronica': ['ndea', 'ndeb', 'ndec'],
};

const AVAILABLE_GENERAL_OPTIONS = [
  '  - --monto <number> | todas | importe total del comprobante',
  '  - --punto-venta <number> | --pv <number> | todas | punto de venta emisor',
  '  - --fecha <fecha> | todas | fecha del comprobante; si falta usa hoy',
  '  - --concepto <tipo> | -c | todas | productos, servicios o productos-servicios',
  '  - --cs | --cp | --csp | todas | atajos para concepto',
  '  - --moneda <codigo> | --mda <codigo> | todas | codigo de moneda, por ejemplo ARS o USD',
  '  - --cotizacion-moneda <number> | --cm <number> | todas | cotizacion de la moneda elegida; obligatoria en moneda extranjera',
  '  - --misma-moneda | todas | el pago se cancela en la moneda extranjera; usa la cotizacion oficial de ARCA',
  '  - --cargar <path> | todas | cargar un comprobante o lote desde JSON',
  '  - --alicuota <tasa> | letras A y B | general (21), reducida (10.5), incrementada (27), cero (0), 5 o 2.5; por defecto config alicuota o 21',
  '  - --alicuota <tasa>:<monto> | letras A y B | repetible para varias alicuotas; el monto lleva IVA incluido y --monto pasa a ser opcional',
  '  - --exento <number> | letras A y B | parte exenta del monto total',
  '  - --nogravado <number> | letras A y B | parte no gravada del monto total',
].join('\n');

const AVAILABLE_IDENTITY_OPTIONS = [
  '  - --cuit <number> | todas | CUIT del receptor',
  '  - --cuil <number> | todas | CUIL del receptor',
  '  - --dni <number> | todas | DNI del receptor',
  '  - --consumidor-final | --cfinal | todas | consumidor final con documento 0',
  '  - --iva-receptor <tipo> | --ir <tipo> | todas | condicion IVA del receptor',
  '  - --ir-* | todas | atajos para IVA receptor, por ejemplo --ir-cf o --ir-ri',
].join('\n');

const AVAILABLE_SERVICE_OPTIONS = [
  '  - -d, --dia <1-31> | servicios o productos-servicios | dia de vencimiento o referencia de servicio',
  '  - --servicio-desde <fecha> | --sd <fecha> | servicios o productos-servicios | inicio del servicio',
  '  - --servicio-hasta <fecha> | --sh <fecha> | servicios o productos-servicios | fin del servicio',
  '  - --vencimiento <fecha> | --vto <fecha> | servicios, productos-servicios y facturas FCE | vencimiento del pago; por defecto el fin del servicio',
].join('\n');

const AVAILABLE_ASSOCIATED_OPTIONS = [
  '  - --ac <shortcut> | notas | shortcut del comprobante asociado',
  '  - --at <number> | notas | tipo ARCA del comprobante asociado',
  '  - --asociado-punto-venta <number> | --apv <number> | notas | punto de venta del asociado',
  '  - --ar <number> | notas | numero del comprobante asociado',
  '  - --acuit <number> | notas | CUIT del comprobante asociado; en NC/ND FCE por defecto el CUIT emisor',
  '  - --afecha <fecha> | notas | fecha del comprobante asociado; obligatoria en NC/ND FCE',
  '  - --periodo-desde <fecha> | --pd <fecha> | notas comunes | inicio del periodo asociado; alternativa a --ac',
  '  - --periodo-hasta <fecha> | --ph <fecha> | notas comunes | fin del periodo asociado',
].join('\n');

const AVAILABLE_FCE_INVOICE_OPTIONS = [
  '  - --cbu <22 digitos> | facturas FCE | CBU del emisor; obligatorio (o config cbu)',
  '  - --alias <alias> | facturas FCE | alias del CBU (o config aliasCbu)',
  '  - --transferencia <sca|adc> | facturas FCE | modalidad de transferencia; por defecto sca',
].join('\n');

const AVAILABLE_FCE_NOTE_OPTIONS = [
  '  - --anulacion | NC/ND FCE | la nota anula una factura rechazada por el comprador',
].join('\n');

function resolveFceOptions(isElectronicCredit: boolean, isNote: boolean): string {
  if (!isElectronicCredit) {
    return '  - No aplica para este comprobante.';
  }

  return isNote ? AVAILABLE_FCE_NOTE_OPTIONS : AVAILABLE_FCE_INVOICE_OPTIONS;
}

const AVAILABLE_EXECUTION_OPTIONS = [
  '  - --previsualizar | todas | muestra el payload antes de hablar con ARCA',
  '  - --emitir | todas | emite realmente el comprobante',
  '  - --testing | todas | fuerza entorno testing en esta corrida',
  '  - --produccion | todas | fuerza entorno produccion en esta corrida',
  '  - --json | todas | salida estructurada para scripts',
  '  - --bruto | todas | agrega respuesta cruda de ARCA cuando exista',
].join('\n');

const CORE_RULES = [
  '  - ARCLI arma datos desde flags, JSON cargado, config y defaults internos.',
  '  - Si no pasa fecha, usa hoy.',
  '  - Use --emitir o --previsualizar, pero no ambos.',
  '  - Use una sola identidad de receptor: --consumidor-final o --cfinal, o bien --cuit, --cuil o --dni.',
  '  - Use --iva-receptor, --ir o un solo flag --ir-*, pero no varios a la vez.',
  '  - Use --concepto o un solo flag entre --cs, --cp y --csp, pero no ambos.',
].join('\n');

function section(title: string, body: string): string {
  return [title, body].join('\n');
}

function compactList(values: readonly string[]): string {
  return values.map((value) => `  - ${value}`).join('\n');
}

function formatFamilyShortcuts(family: VoucherFamily): string {
  const [a, b, c] = FAMILY_SHORTCUTS[family];

  return compactList([`A -> ${a}`, `B -> ${b}`, `C -> ${c}`]);
}

function createProgramQuickStart(): string {
  return [
    'Uso minimo',
    '  - TL;DR: arcli fc -m 300000 --cs --consumidor-final --ir-cf',
    '  - Ese ejemplo asume que ya resolviste CUIT emisor, credenciales y punto de venta.',
    '  - Si todavía no lo hiciste, empezá por: arcli config revisar',
    '  - Emitir de verdad: arcli fa -m 1 --cs --cuit 20168598204 --ir-ri --emitir --bruto',
  ].join('\n');
}

function createProgramMentalModel(): string {
  return [
    'Como pensar rapido un comando',
    '  - 1. Elegí el comprobante: fc, fa, nca, ndeb, fcec.',
    '  - 2. Definí el monto: --monto.',
    '  - 3. Elegí el concepto: --cs, --cp, --csp o --concepto.',
    '  - 4. Definí la identidad: --cuit, --cuil, --dni o --consumidor-final.',
    '  - 5. Definí el IVA receptor: --ir-*, --ir o --iva-receptor.',
  ].join('\n');
}

function createProgramFamilies(): string {
  return section(
    'Familias y shortcuts',
    [
      '  - factura -> fa, fb, fc',
      '  - nota-credito -> nca, ncb, ncc',
      '  - nota-debito -> nda, ndb, ndc',
      '  - factura-credito-electronica -> fcea, fceb, fcec',
      '  - nota-credito-electronica -> ncea, nceb, ncec',
      '  - nota-debito-electronica -> ndea, ndeb, ndec',
    ].join('\n'),
  );
}

function createProgramCommands(): string {
  return section(
    'Comandos importantes',
    [
      '  - Emitir comprobantes por shortcut: arcli fc ...',
      '  - Emitir por familia y letra: arcli factura c ...',
      '  - Ver y guardar config: arcli config',
      '  - Revisar entorno y credenciales: arcli config revisar',
      '  - Ver ejemplos listos para copiar: arcli ejemplos',
      '  - Consultar si un receptor esta obligado a FCE: arcli fce-obligado <cuit>',
      '  - Ver nombre, domicilio y condicion IVA de un CUIT: arcli padron <cuit>',
      '  - Asistente paso a paso: arcli (sin argumentos) o arcli interactivo',
      '  - Ver los ultimos comprobantes emitidos: arcli ultimos fb',
      '  - Ver el detalle de un comprobante: arcli consultar fb 14',
      '  - Ver si ARCA responde y el punto de venta esta habilitado: arcli estado',
      '  - Ver tablas de ARCA (puntos de venta, alicuotas, cotizacion): arcli parametros',
      '  - Generar el PDF al emitir: arcli fc ... --emitir --exportar-pdf (plugin: arcli pdf instalar)',
      '  - Ver escenas de UI: arcli storybook',
    ].join('\n'),
  );
}

function createProgramExamples(): string {
  return section(
    'Ejemplos utiles',
    [
      '  - Basico: arcli fc -m 300000 --cs --consumidor-final --ir-cf',
      '  - Con CUIT: arcli fa -m 1 --cs --cuit 20168598204 --ir-ri',
      '  - Nota: arcli nca -m 1 --cs --cuit 20168598204 --ir-ri --ac fa --apv 3 --ar 6 --acuit 20409509763',
    ].join('\n'),
  );
}

function createProgramSafety(): string {
  return section(
    'Ejecucion y seguridad',
    [
      '  - --previsualizar muestra la solicitud antes de emitir.',
      '  - --emitir habla de verdad con ARCA.',
      '  - --produccion cambia al entorno real.',
      '  - Sin --emitir, en una terminal pregunta antes de emitir (salvo emitir=true en la config).',
      '  - Para scripts o pipelines, usá --json y evitá automatizar sobre salida humana.',
    ].join('\n'),
  );
}

function createProgramProject(): string {
  return section(
    'Proyecto y actualizaciones',
    [
      '  - Repositorio: https://github.com/LcsGrz/arcli',
      '  - Actualizar a la ultima version: npm install -g arcli@latest',
      '  - Ver la version instalada: arcli --version',
    ].join('\n'),
  );
}

function createProgramDiscovery(): string {
  return section(
    'Descubrimiento',
    [
      '  - Ayuda general: arcli ayuda',
      '  - Ayuda de un shortcut: arcli fc ayuda',
      '  - Ayuda de una familia: arcli factura ayuda',
      '  - Ayuda de config: arcli config ayuda',
      '  - Ayuda de ejemplos: arcli ejemplos ayuda',
      '  - Ayuda de storybook: arcli storybook ayuda',
    ].join('\n'),
  );
}

function createProgramFrequentErrors(): string {
  return section(
    'Errores frecuentes',
    [
      '  - Identidad duplicada: no uses --cuit y --consumidor-final juntos.',
      '  - Falta IVA receptor: elegí --ir-* o --iva-receptor.',
      '  - Flags incompatibles: no mezcles --emitir y --previsualizar.',
      '  - JSON invalido o incompleto: revisá el archivo pasado a --cargar.',
    ].join('\n'),
  );
}

function createVoucherSummary(shortcut: VoucherShortcut): string {
  const definition = getVoucherKindByShortcut(shortcut);

  if (!definition) {
    return '';
  }

  const whenToUse = definition.requiresAssociatedVoucher
    ? 'Use este shortcut cuando ya sabe el comprobante exacto y necesita informar un asociado compatible.'
    : 'Use este shortcut cuando ya sabe exactamente que comprobante quiere emitir y quiere escribir menos.';

  return section(
    'Resumen',
    [
      `  - Comprobante: ${definition.displayName}`,
      `  - Shortcut: arcli ${shortcut}`,
      `  - Comando largo: arcli ${definition.family} ${definition.letter}`,
      `  - Tipo ARCA: ${definition.arcaType}`,
      `  - Cuando usarlo: ${whenToUse}`,
    ].join('\n'),
  );
}

function createShortcutMinimum(shortcut: VoucherShortcut): string {
  const definition = getVoucherKindByShortcut(shortcut);

  if (!definition) {
    return '';
  }

  const example = `  - Ejemplo minimo: ${buildMinimalShortcutExample(definition)}`;

  return section(
    'Para empezar',
    [
      example,
      definition.requiresAssociatedVoucher
        ? '  - Ademas de la estructura base, este comprobante siempre necesita asociado.'
        : '  - Con eso ya tenés una base funcional para previsualizar o emitir.',
    ].join('\n'),
  );
}

function createShortcutExamples(shortcut: VoucherShortcut): string {
  const definition = getVoucherKindByShortcut(shortcut);

  if (!definition) {
    return '';
  }

  const minimal = buildMinimalShortcutExample(definition);
  const examples = [
    `  - Previsualizar: ${minimal} --previsualizar`,
    `  - Emitir: ${minimal} --emitir --bruto`,
    `  - JSON: arcli ${shortcut} --cargar ./voucher.json --json`,
  ];

  return section('Ejemplos', examples.join('\n'));
}

function createShortcutImportantFlags(shortcut: VoucherShortcut): string {
  const definition = getVoucherKindByShortcut(shortcut);

  if (!definition) {
    return '';
  }

  return section(
    'Flags importantes',
    [
      '  - Estructura base: --monto, --concepto/--cs/--cp/--csp, identidad y IVA receptor.',
      '  - Datos comunes: --pv, --fecha, --moneda, --cm, --cargar.',
      '  - Servicio: --dia, --sd y --sh cuando el concepto usa servicios.',
      definition.requiresAssociatedVoucher
        ? definition.isElectronicCredit
          ? '  - Asociado: --ac o --at, mas --apv, --ar y --afecha.'
          : '  - Asociado: --ac o --at, mas --apv, --ar y --acuit; o un periodo con --pd y --ph.'
        : '  - Asociado: no aplica para este comprobante.',
      ...(definition.isElectronicCredit
        ? [
            definition.requiresAssociatedVoucher
              ? '  - FCE: --afecha obligatoria y --anulacion si anula una factura rechazada.'
              : '  - FCE: --cbu obligatorio (o config cbu), --alias y --transferencia sca|adc.',
          ]
        : []),
      '  - Salida y ejecucion: --previsualizar, --emitir, --json, --bruto, --testing, --produccion.',
    ].join('\n'),
  );
}

function createShortcutAvailableFlags(shortcut: VoucherShortcut): string {
  const definition = getVoucherKindByShortcut(shortcut);

  if (!definition) {
    return '';
  }

  return section(
    'Mas parametros disponibles',
    [
      'Generales',
      AVAILABLE_GENERAL_OPTIONS,
      '',
      'Receptor e IVA',
      AVAILABLE_IDENTITY_OPTIONS,
      '',
      'Servicio',
      AVAILABLE_SERVICE_OPTIONS,
      '',
      'Comprobante asociado',
      definition.requiresAssociatedVoucher ? AVAILABLE_ASSOCIATED_OPTIONS : '  - No aplica para este comprobante.',
      '',
      'Credito electronico (FCE)',
      resolveFceOptions(definition.isElectronicCredit, definition.requiresAssociatedVoucher),
      '',
      'Ejecucion y salida',
      AVAILABLE_EXECUTION_OPTIONS,
    ].join('\n'),
  );
}

function createShortcutFrequentErrors(shortcut: VoucherShortcut): string {
  const definition = getVoucherKindByShortcut(shortcut);

  if (!definition) {
    return '';
  }

  const lines = [
    '  - No mezcle identidades del receptor.',
    '  - No mezcle --emitir y --previsualizar.',
    '  - Si usa --cargar, revise que el JSON tenga claves validas.',
  ];

  if (definition.requiresAssociatedVoucher) {
    lines.push('  - Este comprobante exige asociado; complete --ac, --apv, --ar y --acuit cuando corresponda.');
  }

  return section('Errores frecuentes', lines.join('\n'));
}

function createFamilySummary(family: VoucherFamily): string {
  return section(
    'Resumen',
    [
      `  - Familia: ${FAMILY_LABELS[family]}`,
      `  - Uso: arcli ${family} <a|b|c>`,
      '  - Letras validas: a, b, c',
      '  - Use la familia cuando quiera cambiar solo la letra sin aprender todos los shortcuts.',
      '  - Si ya sabés el comprobante exacto, el shortcut suele ser mas rapido.',
    ].join('\n'),
  );
}

function createFamilyExamples(family: VoucherFamily): string {
  return section(
    'Ejemplos por letra',
    [
      ...VOUCHER_LETTERS.map((letter) => {
        const definition = getVoucherKindByFamilyAndLetter(family, letter);

        return definition ? `  - Letra ${letter.toUpperCase()}: ${buildMinimalFamilyExample(definition)}` : '';
      }),
      `  - Con JSON: arcli ${family} c --cargar ./voucher.json --json`,
    ].join('\n'),
  );
}

function createFamilySharedFlags(family: VoucherFamily): string {
  return [
    section('Shortcuts relacionados', formatFamilyShortcuts(family)),
    '',
    section(
      'Flags importantes',
      [
        '  - Base comun: --monto, --concepto/--cs/--cp/--csp, identidad e IVA receptor.',
        '  - Datos comunes: --pv, --fecha, --moneda, --cm, --cargar.',
        '  - Servicio: --dia, --sd y --sh cuando el concepto usa servicios.',
        family.includes('nota')
          ? '  - Asociado: esta familia lo exige; usá --ac o --at, mas --apv, --ar y --acuit.'
          : '  - Asociado: no aplica para esta familia.',
        '  - Ejecucion y salida: --previsualizar, --emitir, --json, --bruto, --testing, --produccion.',
      ].join('\n'),
    ),
    '',
    section(
      'Mas parametros disponibles',
      [
        'Generales',
        AVAILABLE_GENERAL_OPTIONS,
        '',
        'Receptor e IVA',
        AVAILABLE_IDENTITY_OPTIONS,
        '',
        'Servicio',
        AVAILABLE_SERVICE_OPTIONS,
        '',
        'Comprobante asociado',
        family.includes('nota') ? AVAILABLE_ASSOCIATED_OPTIONS : '  - No aplica para esta familia.',
        '',
        'Credito electronico (FCE)',
        resolveFceOptions(family.includes('electronica'), family.includes('nota')),
        '',
        'Ejecucion y salida',
        AVAILABLE_EXECUTION_OPTIONS,
      ].join('\n'),
    ),
  ].join('\n');
}

function createFamilyFrequentErrors(family: VoucherFamily): string {
  const lines = [
    '  - La letra debe ser a, b o c.',
    '  - No mezcle identidades o conceptos incompatibles.',
    '  - Si carga JSON, la letra del comando y el contenido deben representar el mismo comprobante.',
  ];

  if (family.includes('nota')) {
    lines.push('  - Las notas requieren un asociado compatible; sin eso ARCLI no puede armar el payload final.');
  }

  return section('Errores frecuentes', lines.join('\n'));
}

const BOOLEAN_CONFIG_VALUES = 'true/false, si/no o 1/0';

/** Valores de las claves que el asistente no edita o que, siendo booleanas, aceptan mas formas que si/no. */
const CONFIG_VALUE_OVERRIDES: Partial<Record<ConfigPublicKey, string>> = {
  alicuota: 'general, reducida, incrementada, cero o el numero: 0, 2.5, 5, 10.5, 21, 27; por defecto 21',
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
        '  - Revisar si el entorno esta listo antes de emitir.',
      ].join('\n'),
    ),
    '',
    section(
      'Casos comunes',
      [
        '  - Guardar defaults para no repetir flags como puntoVenta, concepto o IVA receptor.',
        '  - Revisar si testing o produccion tienen credenciales y contexto validos.',
        '  - Debuggear por que un comando pide datos que pensabas tener guardados.',
      ].join('\n'),
    ),
    '',
    section(
      'Comandos mas usados',
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
        '  - Faltan cert.testing o key.testing: corra arcli config revisar.',
        '  - Punto de venta no configurado: guarde puntoVenta o paselo por flag.',
        '  - Emitir por defecto activado sin querer: revise el valor de emitir.',
      ].join('\n'),
    ),
    '',
    section(
      'No tenes certificado todavia?',
      ['  - Guia paso a paso (testing y produccion), con capturas de ARCA:', `    ${CERTIFICATE_GUIDE_URL}`].join('\n'),
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
        '  - Ver rapido que cambia entre una variante minima y una full.',
      ].join('\n'),
    ),
    '',
    section(
      'Como leer la salida',
      [
        '  - Minima: datos esenciales del comprobante.',
        '  - Full: mas campos explicitados para el mismo flujo.',
        '  - Larga: comando largo y flags descriptivos.',
        '  - Corta: shortcut y aliases practicos.',
      ].join('\n'),
    ),
    '',
    section(
      'Seguridad',
      [
        '  - Todos los ejemplos usan --previsualizar para evitar emisiones reales por error.',
        '  - Si queres emitir, reemplaza --previsualizar por --emitir.',
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
        '  - Saber si a un receptor le corresponde factura comun o Factura de Credito Electronica (FCE).',
        '  - ARCA informa si esta obligado a recibir FCE y desde que monto.',
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
        '  - Ver razon social, domicilio fiscal, condicion IVA, impuestos y actividad de un CUIT.',
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
  return [
    '',
    createVoucherSummary(shortcut),
    '',
    createShortcutMinimum(shortcut),
    '',
    createShortcutImportantFlags(shortcut),
    '',
    createShortcutExamples(shortcut),
    '',
    createShortcutAvailableFlags(shortcut),
    '',
    section('Reglas clave', CORE_RULES),
    '',
    createShortcutFrequentErrors(shortcut),
    '',
  ].join('\n');
}

export function createFamilyHelp(family: VoucherFamily): string {
  return [
    '',
    createFamilySummary(family),
    '',
    createFamilyExamples(family),
    '',
    createFamilySharedFlags(family),
    '',
    section('Reglas clave', CORE_RULES),
    '',
    createFamilyFrequentErrors(family),
    '',
  ].join('\n');
}

export function createProgramHelp(): string {
  return [
    '',
    createProgramQuickStart(),
    '',
    createProgramMentalModel(),
    '',
    createProgramFamilies(),
    '',
    createProgramCommands(),
    '',
    createProgramExamples(),
    '',
    createProgramSafety(),
    '',
    createProgramDiscovery(),
    '',
    createProgramFrequentErrors(),
    '',
    createProgramProject(),
    '',
  ].join('\n');
}

export function configureSpanishHelp(command: Command): void {
  command.helpCommand(false);
  command.helpOption('--ayuda', 'mostrar ayuda');
  command.showHelpAfterError('(usa "ayuda" para ver ejemplos y opciones)');
}

export function createProgramHeader(): string {
  return renderLogo(CLI_VERSION);
}
