import { describe, expect, it, vi } from 'vitest';

import { InputValidationError } from '../../../lib/errors/app-error';
import { BatchEmissionError, BatchValidationError } from '../../../modules/billing/billing.batch';
import { EmissionUncertainError } from '../../../modules/billing/billing.errors';
import { emitBatch, prepareBatch } from '../billing.command.batch';

const batch = (total: number, invalidItems: Array<{ index: number; message: string }> = []) => ({
  inputIndexes: Array.from({ length: total - invalidItems.length }, (_, position) => position + 1),
  invalidItems,
  isBatch: total > 1,
  total,
});
const oneItemBatch = { inputIndexes: [1], invalidItems: [], isBatch: true, total: 1 };

describe('prepareBatch', () => {
  it('con un solo comprobante deja pasar el error de la consulta como siempre', async () => {
    const original = new Error('El padrón no responde');

    await expect(
      prepareBatch({
        inputs: ['a'],
        plan: batch(1),
        resolve: async () => {
          throw original;
        },
        validate: vi.fn(),
      }),
    ).rejects.toBe(original);
  });

  it('junta los fallos de las consultas con los de validacion, con su indice, sin cortar en el primero', async () => {
    const plan = {
      inputIndexes: [1, 2, 4, 5],
      invalidItems: [{ index: 3, message: 'Falta monto.' }],
      isBatch: true,
      total: 5,
    };
    const resolve = vi.fn(async (input: string) => {
      if (input === 'sin-cotizacion') {
        throw new Error('ARCA no devolvió la cotización de DOL.');
      }

      return `${input}-resuelto`;
    });
    const validate = (input: string) => {
      if (input === 'invalido-resuelto') {
        throw new InputValidationError('La factura a no admite IVA receptor "consumidor-final".');
      }
    };

    const run = prepareBatch({ inputs: ['ok', 'sin-cotizacion', 'invalido', 'ok'], plan, resolve, validate });

    await expect(run).rejects.toThrow(BatchValidationError);
    await run.catch((error: BatchValidationError) => {
      expect(error.message).toContain('3 de 5 comprobantes del lote tienen errores. No se emitió ninguno.');
      expect(error.message).toContain('#2: ARCA no devolvió la cotización de DOL.');
      expect(error.details).toEqual({
        comprobantes: [
          { error: 'ARCA no devolvió la cotización de DOL.', indice: 2 },
          { error: 'Falta monto.', indice: 3 },
          { error: 'La factura a no admite IVA receptor "consumidor-final".', indice: 4 },
        ],
      });
    });
    expect(resolve).toHaveBeenCalledTimes(4);
  });

  it('devuelve lo resuelto, en orden, si todo es valido', async () => {
    const validate = vi.fn();

    await expect(
      prepareBatch({
        inputs: ['a', 'b'],
        plan: batch(2),
        resolve: async (input: string) => input.toUpperCase(),
        validate,
      }),
    ).resolves.toEqual(['A', 'B']);
    expect(validate).toHaveBeenCalledWith('A');
    expect(validate).toHaveBeenCalledWith('B');
  });
  it('en un lote de un solo comprobante informa el fallo con su indice', async () => {
    const run = prepareBatch({
      inputs: ['a'],
      plan: oneItemBatch,
      resolve: async () => {
        throw new Error('El padrón no responde');
      },
      validate: vi.fn(),
    });

    await expect(run).rejects.toThrow(BatchValidationError);
    await expect(run).rejects.toMatchObject({
      details: { comprobantes: [{ error: 'El padrón no responde', indice: 1 }] },
    });
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

  it('si falla a mitad antes de emitir, entrega lo ya procesado y deja el que fallo para reintentar', async () => {
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
      expect(error.message).toContain('El lote se interrumpió en el comprobante #3: Transacción Activa');
      expect(error.message).toContain('Procesados: 2 de 4. Sin procesar: #3, #4.');
      expect(error.details).toEqual({ fallo: 3, procesados: 2, sinProcesar: [3, 4], total: 4 });
    });
    expect(onPartialResults).toHaveBeenCalledWith(['CAE-a', 'CAE-b']);
  });

  it('espera a que se entreguen los parciales (con sus PDFs) antes de cortar', async () => {
    const delivered: string[][] = [];
    const run = emitBatch({
      emit: async (input: string) => {
        if (input === 'b') {
          throw new Error('boom');
        }

        return `CAE-${input}`;
      },
      inputs: ['a', 'b'],
      onPartialResults: async (partial) => {
        await Promise.resolve();
        delivered.push(partial);
      },
      plan: batch(2),
    });

    await expect(run).rejects.toThrow(BatchEmissionError);
    expect(delivered).toEqual([['CAE-a']]);
  });

  it('si falla la entrega de los parciales, igual sale el error de emision', async () => {
    const run = emitBatch({
      emit: async (input: string) => {
        if (input === 'b') {
          throw new Error('Transacción Activa');
        }

        return `CAE-${input}`;
      },
      inputs: ['a', 'b'],
      onPartialResults: async () => {
        throw new Error('No se pudo generar el PDF');
      },
      plan: batch(2),
    });

    await expect(run).rejects.toThrow('El lote se interrumpió en el comprobante #2: Transacción Activa');
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

  it('en un lote de un solo comprobante corta con BATCH_EMISSION_ERROR', async () => {
    const run = emitBatch({
      emit: async () => {
        throw new Error('boom');
      },
      inputs: ['a'],
      onPartialResults: vi.fn(),
      plan: oneItemBatch,
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
