/**
 * Copia de los tipos de entrada de `@arcasdk/pdf` (0.2.x), solo con los campos que usa arcli.
 * No se importan del paquete porque es un plugin que puede no estar instalado.
 */
export interface InvoicePdfIssuer {
  readonly condicionIva: string;
  readonly cuit: string;
  readonly domicilioComercial: string;
  /** yyyymmdd */
  readonly fechaInicioActividades: string;
  readonly iibb: string;
  readonly razonSocial: string;
}

export interface InvoicePdfReceiver {
  readonly condicionIva: string;
  readonly documentoNro: string;
  /** "CUIT", "CUIL", "DNI" u "Otro". */
  readonly documentoTipo: string;
  readonly domicilio?: string;
  readonly razonSocial: string;
}

export interface InvoicePdfItem {
  readonly alicuotaIva?: number;
  readonly cantidad: number;
  readonly descripcion: string;
  readonly precioUnitario: number;
  readonly subtotal: number;
  readonly unidadMedida: string;
}

export interface InvoicePdfIva {
  readonly baseImponible: number;
  readonly descripcion: string;
  readonly id: number;
  readonly importe: number;
}

export interface InvoicePdfAssociatedVoucher {
  readonly cuit?: string;
  readonly fecha?: string;
  readonly numero: number;
  readonly puntoVenta: number;
  readonly tipo: number;
}

export interface InvoicePdfData {
  readonly cae: string;
  /** yyyymmdd */
  readonly caeFechaVencimiento: string;
  readonly cbteDesde: number;
  /** yyyymmdd */
  readonly cbteFecha: string;
  readonly cbteHasta: number;
  readonly cbteLetra: string;
  readonly cbteTipo: number;
  readonly cbtesAsociados?: readonly InvoicePdfAssociatedVoucher[];
  readonly concepto: number;
  readonly cotizacion?: number;
  readonly emisor: InvoicePdfIssuer;
  readonly fechaServicioDesde?: string;
  readonly fechaServicioHasta?: string;
  readonly fechaVtoPago?: string;
  readonly importeExento?: number;
  readonly importeIva: number;
  readonly importeNetoGravado: number;
  readonly importeNetoNoGravado?: number;
  readonly importeTotal: number;
  readonly items: readonly InvoicePdfItem[];
  readonly iva?: readonly InvoicePdfIva[];
  readonly moneda?: string;
  /** La plantilla lo muestra debajo del CAE, como "Observaciones". */
  readonly observaciones?: string;
  readonly puntoVenta: number;
  readonly receptor: InvoicePdfReceiver;
}

export interface InvoicePdfOptions {
  readonly footerText?: string;
  /** Data URL de la imagen. */
  readonly logo?: string;
}

/** Datos que no estan en ARCA y se pasan por flag o en el JSON de --cargar. Solo se usan en el PDF. */
export interface PdfVoucherExtras {
  readonly descripcion?: string;
  readonly receptorDomicilio?: string;
  readonly receptorNombre?: string;
}

/** Resultado de generar el PDF de un comprobante: la ruta del archivo o el error, que no frena la emision. */
export type PdfOutcome =
  | { readonly path: string }
  | { readonly error: { readonly code: string; readonly message: string; readonly suggestion?: string } };
