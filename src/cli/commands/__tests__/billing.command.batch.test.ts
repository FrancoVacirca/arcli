import { describe, expect, it, vi } from 'vitest';

import { InputValidationError } from '../../../lib/errors/app-error';
import { BatchEmissionError, BatchValidationError } from '../../../modules/billing/billing.batch';
import { EmissionUncertainError } from '../../../modules/billing/billing.errors';
import { emitBatch, validateBatchBeforeEmitting } from '../billing.command.batch';

const batch = (total: number, invalidItems: Array<{ index: number; message: string }> = []) => ({
  inputIndexes: Array.from({ length: total - invalidItems.length }, (_, position) => position + 1),
  invalidItems,
  total,
});

describe('validateBatchBeforeEmitting', () => {
  it('no hace nada con un solo comprobante: el error sale como siempre', () => {
    const validate = vi.fn();

    validateBatchBeforeEmitting(batch(1), ['a'], validate);

    expect(validate).not.toHaveBeenCalled();
  });

  it('junta los errores de lectura y de negocio, ordenados por indice', () => {
    const plan = { inputIndexes: [1, 3, 4], invalidItems: [{ index: 2, message: 'Falta monto.' }], total: 4 };
    const validate = (input: string) => {
      if (input === 'fa-cf') {
        throw new InputValidationError('La factura a no admite IVA receptor "consumidor-final".');
      }
    };

    expect(() => validateBatchBeforeEmitting(plan, ['ok', 'fa-cf', 'ok'], validate)).toThrow(BatchValidationError);

    try {
      validateBatchBeforeEmitting(plan, ['ok', 'fa-cf', 'ok'], validate);
    } catch (error) {
      const batchError = error as BatchValidationError;

      expect(batchError.message).toContain('2 de 4 comprobantes del lote tienen errores. No se emitio ninguno.');
      expect(batchError.message).toContain('#2: Falta monto.');
      expect(batchError.message).toContain('#3: La factura a no admite');
      expect(batchError.details).toEqual({
        comprobantes: [
          { error: 'Falta monto.', indice: 2 },
          { error: 'La factura a no admite IVA receptor "consumidor-final".', indice: 3 },
        ],
      });
    }
  });

  it('deja pasar el lote si todo es valido', () => {
    expect(() => validateBatchBeforeEmitting(batch(3), ['a', 'b', 'c'], () => undefined)).not.toThrow();
  });
});

describe('emitBatch', () => {
  it('emite todo en orden', async () => {
    const results = await emitBatch({
      emit: async (input: string) => `CAE-${input}`,
      inputs: ['a', 'b'],
      onPartialResults: vi.fn(),
      plan: batch(2),
    });

    expect(results).toEqual(['CAE-a', 'CAE-b']);
  });

  it('si falla a mitad, entrega lo ya procesado y avisa que quedo sin procesar', async () => {
    const onPartialResults = vi.fn();
    const emit = async (input: string) => {
      if (input === 'c') {
        throw new Error('Transacción Activa');
      }

      return `CAE-${input}`;
    };

    const run = emitBatch({ emit, inputs: ['a', 'b', 'c', 'd'], onPartialResults, plan: batch(4) });

    await expect(run).rejects.toThrow(BatchEmissionError);
    await run.catch((error: BatchEmissionError) => {
      expect(error.message).toContain('El lote se interrumpio en el comprobante #3: Transacción Activa');
      expect(error.message).toContain('Procesados: 2 de 4. Sin procesar: #4.');
      expect(error.details).toEqual({ fallo: 3, procesados: 2, sinProcesar: [4], total: 4 });
    });
    expect(onPartialResults).toHaveBeenCalledWith(['CAE-a', 'CAE-b']);
  });

  it('si la emision quedo sin confirmar, pide verificar el que fallo', async () => {
    const cause = new EmissionUncertainError({ cause: new Error('timeout'), pointOfSale: 3, shortcut: 'fc' });
    const run = emitBatch({
      emit: async (input: string) => {
        if (input === 'b') {
          throw cause;
        }

        return `CAE-${input}`;
      },
      inputs: ['a', 'b', 'c'],
      onPartialResults: vi.fn(),
      plan: batch(3),
    });

    await run.catch((error: BatchEmissionError) => {
      expect(error.message).toContain('El #2 puede haberse emitido');
      expect(error.details).toMatchObject({ fallo: 2, sinConfirmar: 2, sinProcesar: [3] });
    });
    await expect(run).rejects.toThrow(BatchEmissionError);
  });

  it('con un solo comprobante deja pasar el error original', async () => {
    const original = new Error('boom');

    await expect(
      emitBatch({
        emit: async () => {
          throw original;
        },
        inputs: ['a'],
        onPartialResults: vi.fn(),
        plan: batch(1),
      }),
    ).rejects.toBe(original);
  });
});
