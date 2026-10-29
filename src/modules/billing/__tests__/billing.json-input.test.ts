import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { InputValidationError } from '../../../lib/errors/app-error';
import {
  BILLING_JSON_KEY_BY_INTERNAL_KEY,
  billingJsonInputSchema,
  parseBillingJsonInput,
  readBillingJsonItems,
} from '../billing.json-input';

const root = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

function errorOf(action: () => unknown): InputValidationError {
  try {
    action();
  } catch (error) {
    if (error instanceof InputValidationError) {
      return error;
    }

    throw error;
  }

  throw new Error('se esperaba un InputValidationError');
}

/**
 * Bloques ```json de un documento que parecen entradas de `--cargar` (no salidas ni errores). La salida de
 * `arcli config --json` tambien puede traer `concepto`, pero siempre trae `entorno`, que no es una clave de entrada.
 */
function documentedInputs(markdown: string): unknown[] {
  return [...markdown.matchAll(/```json\n([\s\S]*?)```/g)]
    .map((match) => JSON.parse(match[1] ?? '') as unknown)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value === 'object' && value !== null && 'concepto' in value && !('entorno' in value));
}

describe('billing.json-input', () => {
  it('accepts every key the parser used to read', () => {
    const input = {
      aliasCbu: 'mi.alias.cbu',
      alicuotaIva: 'general',
      alicuotas: [{ monto: 1210, tasa: 'general' }],
      anulacion: false,
      cbu: '0000000000000000000000',
      codigoMoneda: 'USD',
      comprobanteAsociado: {
        atajo: 'fc',
        cuit: '20123456786',
        fecha: '01-03-2026',
        numero: 10,
        puntoVenta: 3,
        tipo: 11,
      },
      concepto: 'servicios',
      cotizacionMoneda: 1200.5,
      descripcion: 'Servicios de marzo',
      dia: 10,
      emitir: false,
      fechaComprobante: '18-03-2026',
      importeExento: 10,
      importeNoGravado: 20,
      ivaReceptor: 'consumidor-final',
      mismaMoneda: false,
      montoTotal: 1000,
      numeroDocumento: 0,
      pdf: true,
      periodoAsociado: { desde: '01-03-2026', hasta: '31-03-2026' },
      previsualizar: true,
      puntoVenta: 3,
      receptorDomicilio: 'Calle 1',
      receptorNombre: 'Cliente SA',
      servicioDesde: '01-03-2026',
      servicioHasta: '31-03-2026',
      tipoDocumento: 'consumidor-final',
      transferencia: 'sca',
      vencimientoPago: '10-04-2026',
    };

    expect(parseBillingJsonInput(input)).toEqual(input);
  });

  it('keeps accepting numeric IVA rates, as the parser did', () => {
    expect(parseBillingJsonInput({ alicuotaIva: 10.5, alicuotas: [{ monto: 100, tasa: 21 }] })).toEqual({
      alicuotaIva: 10.5,
      alicuotas: [{ monto: 100, tasa: 21 }],
    });
  });

  it('accepts every documented example in docs/input-output.md and llms.txt', () => {
    const examples = [...documentedInputs(read('docs/input-output.md')), ...documentedInputs(read('llms.txt'))];

    expect(examples.length).toBeGreaterThanOrEqual(4);

    for (const example of examples) {
      expect(() => parseBillingJsonInput(example)).not.toThrow();
    }
  });

  it('documents every JSON key in docs/input-output.md', () => {
    const doc = read('docs/input-output.md');
    const missing = Object.keys(billingJsonInputSchema.shape).filter((key) => !doc.includes(`\`${key}\``));

    expect(missing).toEqual([]);
  });

  it('rejects an unknown key, names it and suggests the closest one', () => {
    const error = errorOf(() => parseBillingJsonInput({ montototal: 1000 }));

    expect(error.code).toBe('INPUT_VALIDATION_ERROR');
    expect(error.message).toContain('"montototal"');
    expect(error.message).toContain('"montoTotal"');
  });

  it('suggests the JSON key when someone uses the flag name', () => {
    expect(errorOf(() => parseBillingJsonInput({ vencimiento: '10-04-2026' })).message).toContain('"vencimientoPago"');
    expect(errorOf(() => parseBillingJsonInput({ moneda: 'USD' })).message).toContain('"codigoMoneda"');
  });

  it('rejects unknown keys inside nested objects', () => {
    const error = errorOf(() => parseBillingJsonInput({ comprobanteAsociado: { atajo: 'fc', numro: 10 } }));

    expect(error.message).toContain('"comprobanteAsociado.numro"');
    expect(error.message).toContain('"numero"');
  });

  it('rejects a number written as text instead of dropping it', () => {
    const error = errorOf(() => parseBillingJsonInput({ puntoVenta: '3' }));

    expect(error.message).toContain('"puntoVenta"');
    expect(error.message).toMatch(/tiene que ser un numero/);
    expect(error.message).toContain('"3"');
  });

  it('rejects wrong types for strings, booleans and nested fields', () => {
    expect(errorOf(() => parseBillingJsonInput({ concepto: 1 })).message).toMatch(/"concepto" tiene que ser un texto/);
    expect(errorOf(() => parseBillingJsonInput({ emitir: 'true' })).message).toMatch(
      /"emitir" tiene que ser true o false/,
    );
    expect(errorOf(() => parseBillingJsonInput({ alicuotas: [{ tasa: 'general' }] })).message).toContain(
      'alicuotas[0].monto',
    );
    expect(errorOf(() => parseBillingJsonInput({ alicuotaIva: true })).message).toContain('"alicuotaIva"');
  });

  it('lists every problem with its public path in the error details', () => {
    const error = errorOf(() => parseBillingJsonInput({ montototal: 1000, puntoVenta: '3' }));

    expect(error.details).toEqual({
      campos: expect.arrayContaining([
        expect.objectContaining({ ruta: ['montototal'] }),
        expect.objectContaining({ ruta: ['puntoVenta'] }),
      ]) as unknown,
    });
  });

  it('rejects an item that is not an object', () => {
    expect(errorOf(() => parseBillingJsonInput('hola')).message).toMatch(/objeto/);
    expect(errorOf(() => parseBillingJsonInput(null)).message).toMatch(/objeto/);
  });

  describe('readBillingJsonItems', () => {
    it('wraps a single object and keeps arrays as they are', () => {
      expect(readBillingJsonItems({ montoTotal: 1 })).toEqual([{ montoTotal: 1 }]);
      expect(readBillingJsonItems([{ montoTotal: 1 }, 2])).toEqual([{ montoTotal: 1 }, 2]);
    });

    it('rejects an empty batch and anything that is not an object or an array', () => {
      expect(errorOf(() => readBillingJsonItems([])).message).toMatch(/vacio/);
      expect(errorOf(() => readBillingJsonItems(null)).message).toMatch(/objeto o un array/);
      expect(errorOf(() => readBillingJsonItems(3)).message).toMatch(/objeto o un array/);
    });
  });

  it('maps every internal field that has a JSON key back to it', () => {
    expect(BILLING_JSON_KEY_BY_INTERNAL_KEY).toMatchObject({
      currencyCode: 'codigoMoneda',
      ivaRateAmounts: 'alicuotas',
      paymentDueDate: 'vencimientoPago',
      pdfDescription: 'descripcion',
      pointOfSale: 'puntoVenta',
      totalAmount: 'montoTotal',
    });
    expect(Object.values(BILLING_JSON_KEY_BY_INTERNAL_KEY)).not.toContain('emitir');
  });
});
