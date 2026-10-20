import { z } from 'zod';

import { AMOUNT_DECIMALS, EXCHANGE_RATE_DECIMALS, hasAtMostDecimals } from '../../lib/numbers/argentine-amount';

import type { VoucherShortcut } from './billing.types';

const BILLING_CONCEPT_ALIASES = {
  p: 'productos',
  producto: 'productos',
  productos: 'productos',
  ps: 'productos-servicios',
  'productos-y-servicios': 'productos-servicios',
  'productos-servicios': 'productos-servicios',
  s: 'servicios',
  servicio: 'servicios',
  servicios: 'servicios',
} as const;

export const billingConceptSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const normalizedValue = value.trim().toLowerCase();

    return BILLING_CONCEPT_ALIASES[normalizedValue as keyof typeof BILLING_CONCEPT_ALIASES] ?? value;
  },
  z.enum(['productos', 'productos-servicios', 'servicios']),
);
export const billingDocumentTypeSchema = z.enum(['consumidor-final', 'cuil', 'cuit', 'dni']);
export const billingIvaConditionSchema = z.enum([
  'cliente-del-exterior',
  'consumidor-final',
  'iva-liberado',
  'iva-no-alcanzado',
  'monotributista-social',
  'monotributo-trabajador-independiente-promovido',
  'proveedor-del-exterior',
  'responsable-inscripto',
  'responsable-monotributo',
  'sujeto-exento',
  'sujeto-no-categorizado',
]);

const IVA_RATE_VALUES = ['0', '2.5', '5', '10.5', '21', '27'] as const;

/** Nombres con que ARCA llama a las alicuotas mas usadas; se aceptan igual que el numero. */
export const IVA_RATE_ALIASES: Readonly<Record<string, (typeof IVA_RATE_VALUES)[number]>> = {
  cero: '0',
  general: '21',
  incrementada: '27',
  reducida: '10.5',
};

export const IVA_RATE_HINT = 'general (21), reducida (10.5), incrementada (27), cero (0), 5 o 2.5';

/** Acepta el alias o el numero: "reducida", "10,5", "10.5" o "10.5%". */
export function normalizeIvaRateInput(value: unknown): unknown {
  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  return IVA_RATE_ALIASES[normalized] ?? normalized.replace(',', '.').replace(/%$/, '');
}

export const billingIvaRateSchema = z.preprocess(
  normalizeIvaRateInput,
  z.enum(IVA_RATE_VALUES, { message: `La alicuota debe ser ${IVA_RATE_HINT}.` }),
);

/** Importe positivo con los decimales que acepta ARCA: 2 en importes y 6 en la cotizacion. */
function positiveAmountSchema(decimals = AMOUNT_DECIMALS) {
  return z
    .number()
    .positive()
    .refine((value) => hasAtMostDecimals(value, decimals), { message: `Use hasta ${decimals} decimales.` });
}

/** Una alicuota con el importe que le corresponde, IVA incluido (igual que --monto). */
const billingIvaRateAmountSchema = z.object({
  amount: positiveAmountSchema(),
  rate: billingIvaRateSchema,
});

const billingAssociatedVoucherSchema = z
  .object({
    cuit: z
      .string()
      .trim()
      .regex(/^\d{11}$/)
      .optional(),
    fecha: z.string().trim().optional(),
    numero: z.number().int().positive().optional(),
    puntoVenta: z.number().int().positive().optional(),
    shortcut: z.string().trim().min(1).optional(),
    tipo: z.number().int().positive().optional(),
  })
  .optional();

const billingAssociatedPeriodSchema = z
  .object({
    desde: z.string().trim().optional(),
    hasta: z.string().trim().optional(),
  })
  .optional();

export const billingCommandSchema = z.object({
  associatedPeriod: billingAssociatedPeriodSchema,
  associatedVoucher: billingAssociatedVoucherSchema,
  billingDate: z.string().trim().optional(),
  cancellation: z.boolean().default(false),
  cbu: z
    .string()
    .trim()
    .regex(/^\d{22}$/, 'El CBU debe tener 22 digitos')
    .optional(),
  cbuAlias: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9.-]{6,20}$/, 'El alias debe tener entre 6 y 20 caracteres (letras, numeros, punto o guion)')
    .optional(),
  concept: billingConceptSchema,
  currencyCode: z.string().trim().length(3).default('ARS'),
  documentNumber: z.number().int().nonnegative().optional(),
  documentType: billingDocumentTypeSchema.default('consumidor-final'),
  dryRun: z.boolean().default(false),
  emit: z.boolean().default(false),
  exchangeRate: positiveAmountSchema(EXCHANGE_RATE_DECIMALS).optional(),
  exemptAmount: positiveAmountSchema().optional(),
  ivaRate: billingIvaRateSchema.optional(),
  ivaRateAmounts: z.array(billingIvaRateAmountSchema).min(1).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  ivaCondition: billingIvaConditionSchema,
  /**
   * De donde salio `ivaCondition`; sin definir, la indico el usuario (flag, JSON o modo interactivo). Con `default`
   * (la config) o `missing` y un CUIT, se consulta el padron antes de emitir
   * (`BillingService.resolveIvaConditionFromPadron`). `missing` todavia no tiene un valor real: no se puede emitir.
   */
  ivaConditionSource: z.enum(['default', 'missing', 'padron']).optional(),
  paymentDueDate: z.string().trim().optional(),
  /** `true` con --exportar-pdf, `false` con --sin-pdf; sin definir, decide la config. */
  pdf: z.boolean().optional(),
  /** Solo para el PDF: ARCA no guarda descripcion ni datos del receptor. */
  pdfDescription: z.string().trim().min(1).max(200).optional(),
  pointOfSale: z.number().int().positive().optional(),
  receiverAddress: z.string().trim().min(1).max(200).optional(),
  receiverName: z.string().trim().min(1).max(200).optional(),
  sameCurrency: z.boolean().default(false),
  serviceEndDate: z.string().trim().optional(),
  serviceStartDate: z.string().trim().optional(),
  shortcut: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value as VoucherShortcut),
  totalAmount: positiveAmountSchema(),
  untaxedAmount: positiveAmountSchema().optional(),
  transferMode: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(['adc', 'sca']))
    .optional(),
});

export type BillingConcept = z.infer<typeof billingConceptSchema>;
export type BillingDocumentType = z.infer<typeof billingDocumentTypeSchema>;
export type BillingIvaCondition = z.infer<typeof billingIvaConditionSchema>;
export type BillingIvaRate = z.infer<typeof billingIvaRateSchema>;
export type BillingIvaRateAmount = z.infer<typeof billingIvaRateAmountSchema>;
export type BillingCommandInput = z.infer<typeof billingCommandSchema>;
