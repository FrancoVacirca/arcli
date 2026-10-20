import {
  BatchEmissionError,
  type BatchItemError,
  BatchValidationError,
  describeBatchItemError,
} from '../../modules/billing/billing.batch';

interface BatchPlan {
  readonly inputIndexes: readonly number[];
  readonly invalidItems: readonly BatchItemError[];
  /** Entro un array: se trata como lote aunque tenga un solo item. */
  readonly isBatch: boolean;
  readonly total: number;
}

/**
 * Prepara un lote antes de emitir: `resolve` completa cada item con lo que hay que consultar en ARCA (IVA
 * receptor del padron, cotizacion) y `validate` aplica las reglas de negocio sobre lo resuelto. En un lote
 * no corta en el primer fallo: junta todos, con su indice, en un solo `BatchValidationError`, y no se emite
 * ninguno. Con un comprobante suelto (no un array) el error sale tal cual, como siempre.
 */
export async function prepareBatch<T, R>(options: {
  readonly inputs: readonly T[];
  readonly plan: BatchPlan;
  readonly resolve: (input: T, position: number) => Promise<R>;
  readonly validate: (resolved: R) => void;
}): Promise<R[]> {
  const { inputs, plan, resolve, validate } = options;
  const resolved: R[] = [];

  if (!plan.isBatch) {
    // Secuencial a proposito: cada servicio de ARCA reutiliza su ticket WSAA.
    for (const [position, input] of inputs.entries()) {
      resolved.push(await resolve(input, position));
    }

    return resolved;
  }

  const errors: BatchItemError[] = [...plan.invalidItems];

  for (const [position, input] of inputs.entries()) {
    try {
      const item = await resolve(input, position);

      validate(item);
      resolved.push(item);
    } catch (error) {
      errors.push({ index: plan.inputIndexes[position] ?? position + 1, message: describeBatchItemError(error) });
    }
  }

  if (errors.length > 0) {
    throw new BatchValidationError(
      [...errors].sort((left, right) => left.index - right.index),
      plan.total,
    );
  }

  return resolved;
}

/**
 * Emite los items en orden. Si uno falla a mitad del lote, entrega lo ya procesado a `onPartialResults`
 * antes de cortar: si no se mostrara, alguien volveria a correr el lote y duplicaria comprobantes. Se
 * espera a que termine (puede generar los PDFs de los ya emitidos), y si falla no tapa el error de emision.
 */
export async function emitBatch<T, R>(options: {
  readonly emit: (input: T, position: number) => Promise<R>;
  readonly inputs: readonly T[];
  readonly onPartialResults: (results: R[]) => Promise<void> | void;
  readonly plan: BatchPlan;
}): Promise<R[]> {
  const { emit, inputs, onPartialResults, plan } = options;
  const results: R[] = [];

  for (const [position, input] of inputs.entries()) {
    try {
      results.push(await emit(input, position));
    } catch (error) {
      if (!plan.isBatch) {
        throw error;
      }

      if (results.length > 0) {
        try {
          await onPartialResults(results);
        } catch {
          // Lo importante es el error de emision: los ya emitidos se pueden ver con "arcli ultimos".
        }
      }

      throw new BatchEmissionError({
        cause: error,
        emitted: results.length,
        failedIndex: plan.inputIndexes[position] ?? position + 1,
        total: plan.total,
      });
    }
  }

  return results;
}
