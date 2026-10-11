import { InputValidationError } from '../lib/errors/app-error';
import { parseArgentineAmount } from '../lib/numbers/argentine-amount';
import { parseDocumentNumber, parseStrictInteger } from '../lib/numbers/strict-integer';

/** Montos como en Argentina: punto para miles y coma para decimales. */
export function amountOption(flag: string, maxDecimals?: number): (value: string) => number {
  return (value) => {
    const result = parseArgentineAmount(value, { maxDecimals });

    if (!result.ok) {
      throw new InputValidationError(`${flag} "${value}" no es valido: ${result.reason}.`);
    }

    return result.value;
  };
}

/** Entero solo con digitos: `--pv 3a` es un error, no un 3. */
export function integerOption(flag: string): (value: string) => number {
  return (value) => {
    const parsed = parseStrictInteger(value);

    if (parsed === undefined) {
      throw new InputValidationError(`${flag} "${value}" no es valido: tiene que ser un numero entero.`);
    }

    return parsed;
  };
}

/** CUIT, CUIL o DNI: acepta guiones y puntos (`20-11111111-2`). */
export function documentNumberOption(flag: string): (value: string) => number {
  return (value) => {
    const parsed = parseDocumentNumber(value);

    if (parsed === undefined) {
      throw new InputValidationError(`${flag} "${value}" no es valido: use solo numeros, con o sin guiones.`);
    }

    return parsed;
  };
}
