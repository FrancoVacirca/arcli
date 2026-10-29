import { z } from 'zod';

import { InputValidationError } from '../../lib/errors/app-error';

import type { BillingCommandInput } from './billing.schemas';

/**
 * Forma del JSON de `--cargar`, campo por campo. Solo valida tipos y claves: los valores (montos positivos,
 * alicuotas, conceptos...) los revisa despues `billingCommandSchema`, igual que si vinieran por flags.
 * Es `.strict()`: una clave que no esta aca es un error, para que un typo no se ignore en silencio.
 */
const ivaRateJsonSchema = z.union([z.string(), z.number()], {
  error: 'tiene que ser un texto ("general", "10.5") o un número (10.5)',
});

const associatedVoucherJsonSchema = z
  .object({
    atajo: z.string().optional(),
    cuit: z.string().optional(),
    fecha: z.string().optional(),
    numero: z.number().optional(),
    puntoVenta: z.number().optional(),
    tipo: z.number().optional(),
  })
  .strict();

const associatedPeriodJsonSchema = z
  .object({
    desde: z.string().optional(),
    hasta: z.string().optional(),
  })
  .strict();

const ivaRateAmountJsonSchema = z
  .object({
    monto: z.number(),
    tasa: ivaRateJsonSchema,
  })
  .strict();

export const billingJsonInputSchema = z
  .object({
    aliasCbu: z.string().optional(),
    alicuotaIva: ivaRateJsonSchema.optional(),
    alicuotas: z.array(ivaRateAmountJsonSchema).optional(),
    anulacion: z.boolean().optional(),
    cbu: z.string().optional(),
    codigoMoneda: z.string().optional(),
    comprobanteAsociado: associatedVoucherJsonSchema.optional(),
    concepto: z.string().optional(),
    cotizacionMoneda: z.number().optional(),
    descripcion: z.string().optional(),
    dia: z.number().optional(),
    emitir: z.boolean().optional(),
    fechaComprobante: z.string().optional(),
    importeExento: z.number().optional(),
    importeNoGravado: z.number().optional(),
    ivaReceptor: z.string().optional(),
    mismaMoneda: z.boolean().optional(),
    montoTotal: z.number().optional(),
    numeroDocumento: z.number().optional(),
    pdf: z.boolean().optional(),
    periodoAsociado: associatedPeriodJsonSchema.optional(),
    previsualizar: z.boolean().optional(),
    puntoVenta: z.number().optional(),
    receptorDomicilio: z.string().optional(),
    receptorNombre: z.string().optional(),
    servicioDesde: z.string().optional(),
    servicioHasta: z.string().optional(),
    tipoDocumento: z.string().optional(),
    transferencia: z.string().optional(),
    vencimientoPago: z.string().optional(),
  })
  .strict();

export type BillingJsonInput = z.infer<typeof billingJsonInputSchema>;

type BillingJsonKey = keyof typeof billingJsonInputSchema.shape;

/**
 * Campo de `BillingCommandInput` que alimenta cada clave del JSON; `null` si no tiene uno solo
 * (`emitir` y `previsualizar` deciden juntos `emit` y `dryRun`). El tipo obliga a cubrir todas las claves.
 */
const BILLING_JSON_INTERNAL_KEYS = {
  aliasCbu: 'cbuAlias',
  alicuotaIva: 'ivaRate',
  alicuotas: 'ivaRateAmounts',
  anulacion: 'cancellation',
  cbu: 'cbu',
  codigoMoneda: 'currencyCode',
  comprobanteAsociado: 'associatedVoucher',
  concepto: 'concept',
  cotizacionMoneda: 'exchangeRate',
  descripcion: 'pdfDescription',
  dia: 'dueDay',
  emitir: null,
  fechaComprobante: 'billingDate',
  importeExento: 'exemptAmount',
  importeNoGravado: 'untaxedAmount',
  ivaReceptor: 'ivaCondition',
  mismaMoneda: 'sameCurrency',
  montoTotal: 'totalAmount',
  numeroDocumento: 'documentNumber',
  pdf: 'pdf',
  periodoAsociado: 'associatedPeriod',
  previsualizar: null,
  puntoVenta: 'pointOfSale',
  receptorDomicilio: 'receiverAddress',
  receptorNombre: 'receiverName',
  servicioDesde: 'serviceStartDate',
  servicioHasta: 'serviceEndDate',
  tipoDocumento: 'documentType',
  transferencia: 'transferMode',
  vencimientoPago: 'paymentDueDate',
} as const satisfies Record<BillingJsonKey, keyof BillingCommandInput | null>;

/** Clave publica del JSON para cada campo interno; sirve para traducir las rutas de los errores de zod. */
export const BILLING_JSON_KEY_BY_INTERNAL_KEY: Readonly<Record<string, BillingJsonKey>> = Object.fromEntries(
  Object.entries(BILLING_JSON_INTERNAL_KEYS)
    .filter(([, internalKey]) => internalKey !== null)
    .map(([jsonKey, internalKey]) => [internalKey, jsonKey as BillingJsonKey]),
);

/** Claves validas en cada objeto del JSON; las de un array (`alicuotas`) van sin indice. */
const KEYS_BY_PARENT: Readonly<Record<string, readonly string[]>> = {
  '': Object.keys(billingJsonInputSchema.shape),
  alicuotas: Object.keys(ivaRateAmountJsonSchema.shape),
  comprobanteAsociado: Object.keys(associatedVoucherJsonSchema.shape),
  periodoAsociado: Object.keys(associatedPeriodJsonSchema.shape),
};

/**
 * Nombres de flags (sin guiones) que alguien puede escribir en el JSON pensando que valen igual.
 * Solo los que no se parecen a su clave: el resto lo encuentra la comparacion por parecido.
 */
const FLAG_NAME_HINTS: Readonly<Record<string, string>> = {
  ac: 'comprobanteAsociado.atajo',
  acuit: 'comprobanteAsociado.cuit',
  afecha: 'comprobanteAsociado.fecha',
  alias: 'aliasCbu',
  alicuota: 'alicuotaIva',
  apv: 'comprobanteAsociado.puntoVenta',
  ar: 'comprobanteAsociado.numero',
  at: 'comprobanteAsociado.tipo',
  cm: 'cotizacionMoneda',
  cuil: 'tipoDocumento": "cuil" con "numeroDocumento',
  cuit: 'tipoDocumento": "cuit" con "numeroDocumento',
  dni: 'tipoDocumento": "dni" con "numeroDocumento',
  exento: 'importeExento',
  exportarpdf: 'pdf',
  fecha: 'fechaComprobante',
  ir: 'ivaReceptor',
  mda: 'codigoMoneda',
  moneda: 'codigoMoneda',
  monto: 'montoTotal',
  nogravado: 'importeNoGravado',
  pd: 'periodoAsociado.desde',
  periododesde: 'periodoAsociado.desde',
  periodohasta: 'periodoAsociado.hasta',
  ph: 'periodoAsociado.hasta',
  pv: 'puntoVenta',
  sd: 'servicioDesde',
  sh: 'servicioHasta',
  sinpdf: 'pdf',
  vencimiento: 'vencimientoPago',
  vto: 'vencimientoPago',
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, '');
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }

    previous = current;
  }

  return previous[b.length] ?? 0;
}

/** La clave valida mas parecida, o el nombre de flag conocido; `undefined` si ninguna se parece. */
function suggestKey(unknownKey: string, parent: string): string | undefined {
  const normalized = normalizeKey(unknownKey);
  const validKeys = KEYS_BY_PARENT[parent] ?? [];

  if (parent === '' && FLAG_NAME_HINTS[normalized]) {
    return FLAG_NAME_HINTS[normalized];
  }

  const ranked = validKeys
    .map((key) => ({ distance: editDistance(normalized, normalizeKey(key)), key }))
    .sort((left, right) => left.distance - right.distance);
  const best = ranked[0];

  return best && best.distance <= Math.max(1, Math.floor(normalized.length / 4)) ? best.key : undefined;
}

function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((segment, index) =>
      typeof segment === 'number' ? `[${segment}]` : `${index === 0 ? '' : '.'}${String(segment)}`,
    )
    .join('');
}

function describeExpected(expected: string): string {
  switch (expected) {
    case 'number':
      return 'un número';
    case 'string':
      return 'un texto';
    case 'boolean':
      return 'true o false';
    case 'array':
      return 'un array';
    case 'object':
      return 'un objeto';
    default:
      return expected;
  }
}

function describeReceived(input: unknown): string {
  if (input === null) {
    return 'null';
  }

  if (Array.isArray(input)) {
    return 'un array';
  }

  switch (typeof input) {
    case 'string':
      return `el texto ${JSON.stringify(input)}`;
    case 'number':
    case 'boolean':
      return String(input);
    case 'object':
      return 'un objeto';
    default:
      return typeof input;
  }
}

interface JsonFieldIssue {
  readonly mensaje: string;
  readonly ruta: string[];
}

function describeIssue(issue: z.core.$ZodIssue): JsonFieldIssue[] {
  const path = issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment)));
  const pathLabel = formatPath(path);

  if (issue.code === 'unrecognized_keys') {
    const parent = path.filter((segment) => typeof segment === 'string').join('.');

    return issue.keys.map((key) => {
      const fullKey = formatPath([...path, key]);
      const suggestion = suggestKey(key, parent);

      return {
        mensaje: `La clave "${fullKey}" no existe${suggestion ? `: ¿quisiste decir "${suggestion}"?` : '.'}`,
        ruta: [...path.map(String), key],
      };
    });
  }

  if (issue.code === 'invalid_type') {
    if (issue.input === undefined) {
      return [{ mensaje: `Falta "${pathLabel}".`, ruta: path.map(String) }];
    }

    if (path.length === 0) {
      return [
        { mensaje: `Cada comprobante tiene que ser un objeto y llegó ${describeReceived(issue.input)}.`, ruta: [] },
      ];
    }

    const unquote =
      issue.expected === 'number' && typeof issue.input === 'string' && issue.input.trim() !== ''
        ? ' Escribilo sin comillas.'
        : '';

    return [
      {
        mensaje: `"${pathLabel}" tiene que ser ${describeExpected(issue.expected)} y llegó ${describeReceived(issue.input)}.${unquote}`,
        ruta: path.map(String),
      },
    ];
  }

  return [{ mensaje: `"${pathLabel}" ${issue.message}.`, ruta: path.map(String) }];
}

/**
 * Valida un comprobante del JSON de `--cargar`. Un tipo incorrecto o una clave desconocida es un error de
 * entrada que nombra la clave; antes se descartaban sin aviso y se usaba la config.
 */
export function parseBillingJsonInput(value: unknown): BillingJsonInput {
  const result = billingJsonInputSchema.safeParse(value, { reportInput: true });

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues.flatMap((issue) => describeIssue(issue));

  throw new InputValidationError(`En el JSON de --cargar: ${issues.map((issue) => issue.mensaje).join(' ')}`, {
    campos: issues,
  });
}

/** El JSON de `--cargar` es un comprobante (objeto) o un lote (array no vacio). Devuelve los items sin validar. */
export function readBillingJsonItems(source: unknown): unknown[] {
  if (Array.isArray(source)) {
    if (source.length === 0) {
      throw new InputValidationError('El JSON de --cargar es un lote vacío: no hay comprobantes para procesar.');
    }

    return source;
  }

  if (typeof source !== 'object' || source === null) {
    throw new InputValidationError(
      `El JSON de --cargar tiene que ser un objeto o un array de objetos y es ${describeReceived(source)}.`,
    );
  }

  return [source];
}
