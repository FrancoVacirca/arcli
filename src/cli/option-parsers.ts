import { InputValidationError } from '../lib/errors/app-error';
import { parseCuit } from '../lib/identity/cuit';
import { parseArgentineAmount } from '../lib/numbers/argentine-amount';
import { parseDocumentNumber, parseStrictInteger } from '../lib/numbers/strict-integer';

/** Montos como en Argentina: punto para miles y coma para decimales. */
export function amountOption(flag: string, maxDecimals?: number): (value: string) => number {
  return (value) => {
    const result = parseArgentineAmount(value, { maxDecimals });

    if (!result.ok) {
      throw new InputValidationError(`${flag} "${value}" no es válido: ${result.reason}.`);
    }

    return result.value;
  };
}

/** Entero solo con digitos: `--pv 3a` es un error, no un 3. */
export function integerOption(flag: string): (value: string) => number {
  return (value) => {
    const parsed = parseStrictInteger(value);

    if (parsed === undefined) {
      throw new InputValidationError(`${flag} "${value}" no es válido: tiene que ser un número entero.`);
    }

    return parsed;
  };
}

/** CUIT o CUIL: acepta guiones y puntos (`20-33333333-4`) y chequea el digito verificador. */
export function cuitOption(flag: string): (value: string) => string {
  return (value) => {
    const result = parseCuit(value);

    if (!result.ok) {
      throw new InputValidationError(`${flag} "${value}" no es válido: ${result.reason}.`);
    }

    return result.value;
  };
}

/** CUIT, CUIL o DNI: acepta guiones y puntos (`20-11111111-2`). */
export function documentNumberOption(flag: string): (value: string) => number {
  return (value) => {
    const parsed = parseDocumentNumber(value);

    if (parsed === undefined) {
      throw new InputValidationError(`${flag} "${value}" no es válido: usá solo números, con o sin guiones.`);
    }

    return parsed;
  };
}
