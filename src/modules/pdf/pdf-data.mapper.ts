import type { IIva } from '@arcasdk/core/lib/domain/types/voucher.types';

import { resolveIvaRateLabel } from '../billing/billing.amounts';
import { formatIvaConditionLabel } from '../billing/billing.labels';
import type { BillingExecutionResult } from '../billing/billing.types.internal';

import { PdfError } from './pdf.errors';
import type { InvoicePdfData, InvoicePdfIssuer, InvoicePdfItem, InvoicePdfIva, PdfVoucherExtras } from './pdf.types';
import { buildPdfLegends } from './pdf-legends';

export const DEFAULT_ITEM_DESCRIPTION = 'Segun detalle';

// Mismos nombres que usa la plantilla del SDK para calcular el tipo de documento del QR.
const DOCUMENT_TYPE_NAMES: Readonly<Record<number, string>> = {
  80: 'CUIT',
  86: 'CUIL',
  96: 'DNI',
};

const CURRENCY_CODES: Readonly<Record<string, string>> = { PES: 'PES', DOL: 'DOL' };

const EMPTY_TEXT = '- -';

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function capitalizeWords(value: string): string {
  return value.replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => `${space}${letter.toUpperCase()}`);
}

/** "10,5%" -> 10.5 */
function resolveIvaRateNumber(aliquotId: number): number | undefined {
  const label = resolveIvaRateLabel(aliquotId);

  return label ? Number(label.replace('%', '').replace(',', '.')) : undefined;
}

// La plantilla busca cada alicuota por este texto exacto ("10.5%", con punto).
function buildIvaEntries(iva: readonly IIva[] | undefined): InvoicePdfIva[] {
  return (iva ?? []).map((entry) => ({
    baseImponible: entry.BaseImp,
    descripcion: `${resolveIvaRateNumber(entry.Id) ?? entry.Id}%`,
    id: entry.Id,
    importe: entry.Importe,
  }));
}

/**
 * wsfe no guarda items: se arma un renglon por alicuota con la descripcion del usuario, o uno solo con
 * el total cuando no se discrimina IVA (letra C). Exento y no gravado van en renglones aparte.
 */
function buildItems(result: BillingExecutionResult, description: string): InvoicePdfItem[] {
  const { payload, voucherKind } = result;
  const line = (subtotal: number, alicuotaIva?: number, suffix = ''): InvoicePdfItem => ({
    alicuotaIva,
    cantidad: 1,
    descripcion: `${description}${suffix}`,
    precioUnitario: subtotal,
    subtotal,
    unidadMedida: 'unidad',
  });

  if (voucherKind.letter === 'c') {
    return [line(payload.ImpTotal)];
  }

  // La B no discrimina IVA: cada renglon va con el IVA incluido, como lo ve el cliente.
  const includesIva = voucherKind.letter === 'b';
  const items = (payload.Iva ?? []).map((entry) =>
    includesIva ? line(round(entry.BaseImp + entry.Importe)) : line(entry.BaseImp, resolveIvaRateNumber(entry.Id)),
  );

  if (payload.ImpOpEx > 0) {
    items.push(line(payload.ImpOpEx, undefined, ' (exento)'));
  }

  if (payload.ImpTotConc > 0) {
    items.push(line(payload.ImpTotConc, undefined, ' (no gravado)'));
  }

  return items.length > 0 ? items : [line(payload.ImpTotal)];
}

/** ARCA asigna el numero al emitir: sale de la respuesta, no del payload. */
function resolveVoucherNumber(result: BillingExecutionResult): number {
  const number = result.response.raw?.response?.FeDetResp?.FECAEDetResponse?.[0]?.CbteDesde ?? result.payload.CbteDesde;

  if (!number) {
    throw new PdfError('PDF_GENERATION_ERROR', 'La respuesta de ARCA no trae el numero del comprobante.');
  }

  return number;
}

export function mapBillingResultToPdfData(
  result: BillingExecutionResult,
  issuer: InvoicePdfIssuer,
  extras: PdfVoucherExtras = {},
): InvoicePdfData {
  const { payload, response, voucherKind } = result;

  if (!response.cae || !response.caeVencimiento) {
    throw new PdfError('PDF_GENERATION_ERROR', 'El comprobante no tiene CAE: no se puede generar el PDF.');
  }

  const number = resolveVoucherNumber(result);
  const isConsumer = payload.DocTipo === 99;
  const isUnidentified = isConsumer && !payload.DocNro;
  const iva = voucherKind.letter === 'c' ? [] : buildIvaEntries(payload.Iva);

  return {
    cae: response.cae,
    caeFechaVencimiento: response.caeVencimiento,
    cbteDesde: number,
    cbteFecha: payload.CbteFch,
    cbteHasta: number,
    cbteLetra: voucherKind.letter.toUpperCase(),
    cbteTipo: voucherKind.arcaType,
    cbtesAsociados: payload.CbtesAsoc?.map((voucher) => ({
      cuit: voucher.Cuit,
      fecha: voucher.CbteFch,
      numero: voucher.Nro,
      puntoVenta: voucher.PtoVta,
      tipo: voucher.Tipo,
    })),
    concepto: payload.Concepto,
    cotizacion: payload.MonCotiz,
    emisor: issuer,
    fechaServicioDesde: payload.FchServDesde,
    fechaServicioHasta: payload.FchServHasta,
    fechaVtoPago: payload.FchVtoPago,
    importeExento: payload.ImpOpEx || undefined,
    importeIva: voucherKind.letter === 'c' ? 0 : payload.ImpIVA,
    // La plantilla muestra este importe como "Subtotal" en la B y como neto gravado en la A.
    importeNetoGravado:
      voucherKind.letter === 'c'
        ? payload.ImpTotal
        : voucherKind.letter === 'b'
          ? round(payload.ImpTotal - payload.ImpTrib)
          : payload.ImpNeto,
    importeNetoNoGravado: payload.ImpTotConc || undefined,
    importeTotal: round(payload.ImpTotal),
    items: buildItems(result, extras.descripcion?.trim() || DEFAULT_ITEM_DESCRIPTION),
    iva: iva.length > 0 ? iva : undefined,
    // La plantilla del SDK solo conoce pesos y dolares; el resto se muestra con su codigo ARCA.
    moneda: CURRENCY_CODES[payload.MonId] ?? payload.MonId,
    observaciones: buildPdfLegends(result),
    puntoVenta: payload.PtoVta,
    receptor: {
      condicionIva: capitalizeWords(formatIvaConditionLabel(payload.CondicionIVAReceptorId)),
      // Consumidor final sin documento: el QR igual sale con tipo 99 y numero 0 (el SDK usa `Number(nro) || 0`).
      documentoNro: isUnidentified ? EMPTY_TEXT : String(payload.DocNro),
      documentoTipo: isUnidentified ? 'Documento' : (DOCUMENT_TYPE_NAMES[payload.DocTipo] ?? String(payload.DocTipo)),
      domicilio: extras.receptorDomicilio?.trim() || undefined,
      razonSocial: extras.receptorNombre?.trim() || (isConsumer ? 'Consumidor Final' : EMPTY_TEXT),
    },
  };
}
