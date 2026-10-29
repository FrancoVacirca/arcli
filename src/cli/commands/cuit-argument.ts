import { InputValidationError } from '../../lib/errors/app-error';
import { parseCuit } from '../../lib/identity/cuit';

/** CUIT de un argumento posicional, con o sin guiones. */
export function parseCuitArgument(value: string): number {
  const result = parseCuit(value);

  if (!result.ok) {
    throw new InputValidationError(`El CUIT "${value}" no es valido: ${result.reason}.`);
  }

  return Number(result.value);
}
