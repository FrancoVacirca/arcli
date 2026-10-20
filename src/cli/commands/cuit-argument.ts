import { InputValidationError } from '../../lib/errors/app-error';

/** CUIT de un argumento posicional: 11 digitos, sin guiones. */
export function parseCuitArgument(value: string): number {
  const normalizedValue = value.trim();

  if (!/^\d{11}$/.test(normalizedValue)) {
    throw new InputValidationError(`El CUIT "${value}" no es valido: debe tener 11 digitos.`);
  }

  return Number(normalizedValue);
}
