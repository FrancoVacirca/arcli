import type { INextVoucher } from '@arcasdk/core/lib/domain/types/voucher.types';
import { describe, expect, it } from 'vitest';

import type { BillingExecutionResult } from '../../billing/billing.types.internal';
import { getVoucherKindByShortcut } from '../../billing/voucher-kind-map';
import { PdfError } from '../pdf.errors';
import { mapBillingResultToPdfData } from '../pdf-data.mapper';
import { canHavePdf, resolvePdfDecision } from '../pdf-decision';
import { buildPdfFileName } from '../pdf-file-name';
import { listMissingIssuerKeys, resolvePdfIssuer } from '../pdf-issuer';

const ISSUER_CONFIG = {
  cuit: '20123456786',
  emisor: { domicilio: 'Calle 123, CABA', inicioActividades: '20200301', razonSocial: 'Lucas Gerez' },
};

function createResult(
  shortcut: string,
  payload: Partial<INextVoucher>,
  overrides: Partial<BillingExecutionResult> = {},
): BillingExecutionResult {
  const voucherKind = getVoucherKindByShortcut(shortcut);

  if (!voucherKind) {
    throw new Error(`Atajo desconocido: ${shortcut}`);
  }

  return {
    dryRun: false,
    environment: 'testing',
    payload: {
      CantReg: 1,
      CbteFch: '20261003',
      CbteTipo: voucherKind.arcaType,
      Concepto: 2,
      CondicionIVAReceptorId: 5,
      DocNro: 0,
      DocTipo: 99,
      ImpIVA: 0,
      ImpNeto: 0,
      ImpOpEx: 0,
      ImpTotConc: 0,
      ImpTotal: 0,
      ImpTrib: 0,
      MonCotiz: 1,
      MonId: 'PES',
      PtoVta: 3,
      ...payload,
    },
    response: {
      cae: '76123456789012',
      caeVencimiento: '20261013',
      errors: [],
      events: [],
      observaciones: [],
      observacion: null,
      raw: {
        cae: '76123456789012',
        caeFchVto: '20261013',
        response: { FeDetResp: { FECAEDetResponse: [{ CbteDesde: 125 }] } },
      },
      resultado: 'A',
      suggestions: [],
      status: 'aprobado',
    },
    voucherKind,
    ...overrides,
  };
}

describe('resolvePdfDecision', () => {
  it('lets the flag win over the config', () => {
    expect(resolvePdfDecision({ flag: true, interactive: false, mode: 'nunca' })).toBe('generar');
    expect(resolvePdfDecision({ flag: false, interactive: true, mode: 'siempre' })).toBe('omitir');
  });

  it('asks only when someone can answer', () => {
    expect(resolvePdfDecision({ interactive: true })).toBe('preguntar');
    expect(resolvePdfDecision({ interactive: false })).toBe('omitir');
    expect(resolvePdfDecision({ interactive: false, mode: 'siempre' })).toBe('generar');
    expect(resolvePdfDecision({ interactive: true, mode: 'nunca' })).toBe('omitir');
  });
});

describe('canHavePdf', () => {
  it('requires a real emission with CAE', () => {
    expect(canHavePdf(createResult('fc', {}))).toBe(true);
    expect(canHavePdf(createResult('fc', {}, { dryRun: true }))).toBe(false);

    const rejected = createResult('fc', {});

    expect(canHavePdf({ ...rejected, response: { ...rejected.response, cae: null, status: 'rechazado' } })).toBe(false);
  });
});

describe('buildPdfFileName', () => {
  it('pads point of sale and number', () => {
    const kind = getVoucherKindByShortcut('fc');
    const note = getVoucherKindByShortcut('ncea');

    expect(kind && buildPdfFileName(kind, 3, 125)).toBe('factura-c_0003-00000125.pdf');
    expect(note && buildPdfFileName(note, 12, 7)).toBe('nota-credito-electronica-a_0012-00000007.pdf');
  });
});

describe('resolvePdfIssuer', () => {
  it('lists the missing keys with the commands to set them', () => {
    expect(listMissingIssuerKeys({ emisor: {} })).toEqual([
      'cuit',
      'emisor.razonSocial',
      'emisor.domicilio',
      'emisor.inicioActividades',
    ]);

    try {
      resolvePdfIssuer({ cuit: '20123456786', emisor: { razonSocial: 'X' } }, 'c');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PdfError);
      expect((error as PdfError).code).toBe('PDF_ISSUER_INCOMPLETE');
      expect((error as PdfError).suggestion).toContain('arcli config establecer emisor.domicilio');
    }
  });

  it('derives the IVA condition from the letter and leaves IIBB blank when missing', () => {
    expect(resolvePdfIssuer(ISSUER_CONFIG, 'c')).toMatchObject({
      condicionIva: 'Responsable Monotributo',
      iibb: '-',
    });
    expect(resolvePdfIssuer({ ...ISSUER_CONFIG, emisor: { ...ISSUER_CONFIG.emisor, iibb: 'Exento' } }, 'c').iibb).toBe(
      'Exento',
    );
    expect(resolvePdfIssuer(ISSUER_CONFIG, 'a').condicionIva).toBe('Responsable Inscripto');
    expect(
      resolvePdfIssuer({ ...ISSUER_CONFIG, emisor: { ...ISSUER_CONFIG.emisor, condicionIva: 'sujeto-exento' } }, 'c')
        .condicionIva,
    ).toBe('Sujeto Exento');
  });
});

describe('mapBillingResultToPdfData', () => {
  const issuer = resolvePdfIssuer(ISSUER_CONFIG, 'c');

  it('maps a factura C to a single line with the total', () => {
    const data = mapBillingResultToPdfData(createResult('fc', { ImpNeto: 150000, ImpTotal: 150000 }), issuer, {
      descripcion: 'Servicios de septiembre',
    });

    expect(data).toMatchObject({
      cae: '76123456789012',
      cbteDesde: 125,
      cbteLetra: 'C',
      cbteTipo: 11,
      importeIva: 0,
      importeNetoGravado: 150000,
      importeTotal: 150000,
      items: [{ descripcion: 'Servicios de septiembre', subtotal: 150000 }],
      receptor: { documentoNro: '- -', documentoTipo: 'Documento', razonSocial: 'Consumidor Final' },
    });
    expect(data.iva).toBeUndefined();
  });

  it('maps one line per IVA rate plus exempt in a factura A', () => {
    const data = mapBillingResultToPdfData(
      createResult('fa', {
        CondicionIVAReceptorId: 1,
        DocNro: 30712345671,
        DocTipo: 80,
        ImpIVA: 262.5,
        ImpNeto: 1500,
        ImpOpEx: 100,
        ImpTotal: 1862.5,
        Iva: [
          { BaseImp: 1000, Id: 5, Importe: 210 },
          { BaseImp: 500, Id: 4, Importe: 52.5 },
        ],
      }),
      issuer,
      { receptorDomicilio: 'Calle Falsa 123', receptorNombre: 'Cliente SA' },
    );

    expect(data.items).toEqual([
      expect.objectContaining({ alicuotaIva: 21, descripcion: 'Segun detalle', subtotal: 1000 }),
      expect.objectContaining({ alicuotaIva: 10.5, subtotal: 500 }),
      expect.objectContaining({ descripcion: 'Segun detalle (exento)', subtotal: 100 }),
    ]);
    expect(data.iva).toEqual([
      { baseImponible: 1000, descripcion: '21%', id: 5, importe: 210 },
      { baseImponible: 500, descripcion: '10.5%', id: 4, importe: 52.5 },
    ]);
    expect(data.receptor).toEqual({
      condicionIva: 'Responsable Inscripto',
      documentoNro: '30712345671',
      documentoTipo: 'CUIT',
      domicilio: 'Calle Falsa 123',
      razonSocial: 'Cliente SA',
    });
  });

  it('includes the associated voucher of a credit note', () => {
    const data = mapBillingResultToPdfData(
      createResult('ncc', {
        CbtesAsoc: [{ CbteFch: '20261001', Cuit: '20123456786', Nro: 120, PtoVta: 3, Tipo: 11 }],
        ImpTotal: 500,
      }),
      issuer,
    );

    expect(data.cbtesAsociados).toEqual([
      { cuit: '20123456786', fecha: '20261001', numero: 120, puntoVenta: 3, tipo: 11 },
    ]);
  });

  it('fails without CAE or voucher number', () => {
    const result = createResult('fc', { ImpTotal: 100 });

    expect(() => mapBillingResultToPdfData({ ...result, response: { ...result.response, cae: null } }, issuer)).toThrow(
      /no tiene CAE/,
    );
    expect(() => mapBillingResultToPdfData({ ...result, response: { ...result.response, raw: null } }, issuer)).toThrow(
      /numero del comprobante/,
    );
  });

  it('shows IVA-included amounts in a factura B', () => {
    const data = mapBillingResultToPdfData(
      createResult('fb', {
        ImpIVA: 26250,
        ImpNeto: 125000,
        ImpOpEx: 100,
        ImpTotal: 151350,
        Iva: [{ BaseImp: 125000, Id: 5, Importe: 26250 }],
      }),
      issuer,
    );

    expect(data.items).toEqual([
      expect.objectContaining({ alicuotaIva: undefined, subtotal: 151250 }),
      expect.objectContaining({ descripcion: 'Segun detalle (exento)', subtotal: 100 }),
    ]);
    expect(data.importeNetoGravado).toBe(151350);
  });
});
