import type { ConfigPublicKey } from './config.schemas';

export type ConfigSectionId = 'certificados' | 'cuenta' | 'emisor' | 'facturacion' | 'fce' | 'pdf' | 'salida';

export interface ConfigSection {
  readonly id: ConfigSectionId;
  readonly keys: readonly ConfigPublicKey[];
  readonly label: string;
}

/**
 * Secciones y orden de la configuracion. Las usan `arcli config` y "Modificar configuracion" del modo
 * interactivo, asi los dos muestran lo mismo en el mismo lugar. Cada clave publica aparece una sola vez.
 */
export const CONFIG_SECTIONS: readonly ConfigSection[] = [
  { id: 'cuenta', keys: ['cuit', 'puntoVenta', 'entorno'], label: 'Cuenta' },
  {
    id: 'certificados',
    keys: ['cert.testing', 'key.testing', 'cert.produccion', 'key.produccion', 'ticketPath'],
    label: 'Certificados',
  },
  {
    id: 'facturacion',
    keys: ['concepto', 'ivaReceptor', 'consultarPadron', 'alicuota', 'moneda', 'cotizacion'],
    label: 'Al facturar',
  },
  { id: 'fce', keys: ['cbu', 'aliasCbu', 'verificarFce'], label: 'Factura de crédito electrónica (FCE)' },
  {
    id: 'emisor',
    keys: [
      'emisor.razonSocial',
      'emisor.domicilio',
      'emisor.inicioActividades',
      'emisor.iibb',
      'emisor.condicionIva',
      'emisor.logo',
    ],
    label: 'Datos del emisor (PDF)',
  },
  { id: 'pdf', keys: ['pdf', 'pdfCarpeta', 'pdfNavegador'], label: 'PDF' },
  { id: 'salida', keys: ['comprobantesPorLista', 'emitir', 'json', 'bruto'], label: 'Salida y listados' },
];

/** Nombre de cada dato, igual en `arcli config` y en el modo interactivo. */
export const CONFIG_LABELS: Record<ConfigPublicKey, string> = {
  alicuota: 'Alícuota de IVA (A y B)',
  aliasCbu: 'Alias del CBU',
  bruto: 'Salida bruta',
  cbu: 'CBU',
  'cert.produccion': 'Certificado de producción',
  'cert.testing': 'Certificado de testing',
  comprobantesPorLista: 'Comprobantes por lista',
  concepto: 'Concepto',
  cotizacion: 'Cotización',
  cuit: 'CUIT del emisor',
  'emisor.condicionIva': 'Condición de IVA',
  'emisor.domicilio': 'Domicilio comercial',
  'emisor.iibb': 'Ingresos Brutos',
  'emisor.inicioActividades': 'Inicio de actividades',
  'emisor.logo': 'Logo (PNG o JPG)',
  'emisor.razonSocial': 'Razón social',
  emitir: 'Emitir sin --emitir',
  entorno: 'Entorno',
  ivaReceptor: 'IVA del receptor',
  json: 'Salida JSON',
  'key.produccion': 'Clave privada de producción',
  'key.testing': 'Clave privada de testing',
  moneda: 'Moneda',
  pdf: 'Cuando generar el PDF',
  pdfCarpeta: 'Carpeta de PDFs',
  pdfNavegador: 'Navegador para PDFs',
  puntoVenta: 'Punto de venta',
  ticketPath: 'Carpeta de tickets WSAA',
  verificarFce: 'Verificar régimen FCE del receptor',
  consultarPadron: 'IVA del receptor desde el padrón',
};
