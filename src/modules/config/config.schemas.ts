import { z } from 'zod';

import { billingIvaRateSchema } from '../billing/billing.schemas';
import { MAX_RECENT_VOUCHERS } from '../vouchers/voucher-history';

export const arcliEnvironmentSchema = z.enum(['testing', 'produccion']);
export const arcliDefaultConceptSchema = z.enum(['productos', 'productos-servicios', 'servicios']);
export const arcliDefaultIvaConditionSchema = z.enum([
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
export const arcliDefaultCurrencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

export const arcliPdfModeSchema = z.enum(['siempre', 'preguntar', 'nunca']);

// Misma normalizacion que --alicuota ("10,5", "10.5%").
export const arcliDefaultIvaRateSchema = billingIvaRateSchema;

export const arcliConfigSchema = z.object({
  alicuotaPorDefecto: arcliDefaultIvaRateSchema.optional(),
  cert: z
    .object({
      produccion: z.string().trim().min(1).optional(),
      testing: z.string().trim().min(1).optional(),
    })
    .default({}),
  cuit: z
    .string()
    .trim()
    .regex(/^\d{11}$/, 'El CUIT debe tener 11 digitos')
    .optional(),
  cbu: z
    .string()
    .trim()
    .regex(/^\d{22}$/, 'El CBU debe tener 22 digitos')
    .optional(),
  aliasCbu: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9.-]{6,20}$/, 'El alias debe tener entre 6 y 20 caracteres (letras, numeros, punto o guion)')
    .optional(),
  conceptoPorDefecto: arcliDefaultConceptSchema.optional(),
  ivaReceptorPorDefecto: arcliDefaultIvaConditionSchema.optional(),
  monedaPorDefecto: arcliDefaultCurrencySchema.optional(),
  cotizacionPorDefecto: z.number().positive().optional(),
  /** Datos del emisor que ARCA no guarda y solo se usan en el PDF. */
  emisor: z
    .object({
      condicionIva: arcliDefaultIvaConditionSchema.optional(),
      domicilio: z.string().trim().min(1).optional(),
      iibb: z.string().trim().min(1).optional(),
      /** yyyymmdd */
      inicioActividades: z
        .string()
        .regex(/^\d{8}$/)
        .optional(),
      logo: z.string().trim().min(1).optional(),
      razonSocial: z.string().trim().min(1).optional(),
    })
    .default({}),
  entornoPorDefecto: arcliEnvironmentSchema.default('testing'),
  key: z
    .object({
      produccion: z.string().trim().min(1).optional(),
      testing: z.string().trim().min(1).optional(),
    })
    .default({}),
  output: z
    .object({
      emitirPorDefecto: z.boolean().default(false),
      jsonPorDefecto: z.boolean().default(false),
      brutoPorDefecto: z.boolean().default(false),
    })
    .default({ emitirPorDefecto: false, jsonPorDefecto: false, brutoPorDefecto: false }),
  pdf: arcliPdfModeSchema.optional(),
  pdfCarpeta: z.string().trim().min(1).optional(),
  pdfNavegador: z.string().trim().min(1).optional(),
  /** Cuantos comprobantes muestran `arcli ultimos` y las listas del modo interactivo. */
  comprobantesPorLista: z.number().int().min(1).max(MAX_RECENT_VOUCHERS).optional(),
  puntoVentaPorDefecto: z.number().int().positive().optional(),
  ticketPath: z.string().trim().min(1).optional(),
  /** Completar el IVA receptor desde el padron al facturar con --cuit. Sin definir, si. */
  consultarPadron: z.boolean().optional(),
  verificarFce: z.boolean().optional(),
});

export type ArcliConfig = z.infer<typeof arcliConfigSchema>;
export type ArcliEnvironment = z.infer<typeof arcliEnvironmentSchema>;
export type ArcliPdfMode = z.infer<typeof arcliPdfModeSchema>;

export const CONFIG_DEFAULTS: ArcliConfig = {
  cert: {},
  emisor: {},
  entornoPorDefecto: 'testing',
  key: {},
  monedaPorDefecto: 'PES',
  cotizacionPorDefecto: 1,
  output: {
    emitirPorDefecto: false,
    jsonPorDefecto: false,
    brutoPorDefecto: false,
  },
};

export const configPublicKeySchema = z.enum([
  'alicuota',
  'aliasCbu',
  'comprobantesPorLista',
  'cbu',
  'cert.produccion',
  'cert.testing',
  'concepto',
  'cuit',
  'cotizacion',
  'emisor.condicionIva',
  'emisor.domicilio',
  'emisor.iibb',
  'emisor.inicioActividades',
  'emisor.logo',
  'emisor.razonSocial',
  'entorno',
  'emitir',
  'ivaReceptor',
  'json',
  'key.produccion',
  'key.testing',
  'moneda',
  'bruto',
  'pdf',
  'pdfCarpeta',
  'pdfNavegador',
  'puntoVenta',
  'ticketPath',
  'verificarFce',
  'consultarPadron',
]);

export type ConfigPublicKey = z.infer<typeof configPublicKeySchema>;
