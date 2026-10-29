import { describe, expect, it } from 'vitest';

import { deriveIvaCondition, PADRON_TAX_IDS } from '../padron';
import { formatPadronAsJson, formatPadronAsText } from '../padron.presenter';

const tax = (id: number, active = true) => ({ active, description: String(id), id });

describe('deriveIvaCondition', () => {
  it('monotributo gana sobre el resto', () => {
    expect(deriveIvaCondition({ monotributo: true, taxes: [tax(PADRON_TAX_IDS.iva)] })).toBe('responsable-monotributo');
    expect(deriveIvaCondition({ monotributo: false, taxes: [tax(PADRON_TAX_IDS.monotributo)] })).toBe(
      'responsable-monotributo',
    );
  });

  it('IVA activo es responsable inscripto; IVA exento, sujeto exento', () => {
    expect(deriveIvaCondition({ monotributo: false, taxes: [tax(11), tax(PADRON_TAX_IDS.iva)] })).toBe(
      'responsable-inscripto',
    );
    expect(deriveIvaCondition({ monotributo: false, taxes: [tax(PADRON_TAX_IDS.ivaExento)] })).toBe('sujeto-exento');
  });

  it('sin impuestos que alcancen, o con IVA dado de baja, no adivina', () => {
    expect(deriveIvaCondition({ monotributo: false, taxes: [] })).toBeNull();
    expect(deriveIvaCondition({ monotributo: false, taxes: [tax(PADRON_TAX_IDS.iva, false)] })).toBeNull();
  });
});

describe('padron presenter', () => {
  const taxpayer = {
    activities: [
      { description: 'ALQUILER', id: 439100 },
      { description: 'INMOBILIARIA', id: 681098 },
    ],
    address: 'LARREA 1, CP 1030',
    cuit: 20201797064,
    ivaCondition: 'responsable-inscripto' as const,
    keyStatus: 'ACTIVO',
    monotributoCategory: null,
    name: 'VICTORIA CAROLINA DARIO',
    notices: [],
    personType: 'fisica' as const,
    taxes: [tax(30)],
  };

  it('el JSON usa claves en castellano y la condicion IVA del CLI', () => {
    expect(JSON.parse(formatPadronAsJson({ environment: 'testing', taxpayer }))).toMatchObject({
      actividades: [
        { descripcion: 'ALQUILER', id: 439100 },
        { descripcion: 'INMOBILIARIA', id: 681098 },
      ],
      condicionIva: 'responsable-inscripto',
      cuit: 20201797064,
      entorno: 'testing',
      nombre: 'VICTORIA CAROLINA DARIO',
      tipoPersona: 'fisica',
    });
  });

  it('en texto muestra la actividad principal y cuantas mas hay', () => {
    const text = formatPadronAsText({ environment: 'testing', taxpayer });

    expect(text).toContain('ALQUILER (y 1 más)');
    expect(text).toContain('Responsable Inscripto');
  });

  it('sin condicion IVA pide indicarla con --ir', () => {
    expect(formatPadronAsText({ environment: 'testing', taxpayer: { ...taxpayer, ivaCondition: null } })).toContain(
      'indicala con --ir',
    );
  });
});
