const CHECK_DIGIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

export type CuitParseResult =
  { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: string };

/** Digito verificador de los primeros 10 digitos (modulo 11). `undefined` si da 10: ARCA no asigna esos. */
function computeCheckDigit(firstTen: string): number | undefined {
  const sum = CHECK_DIGIT_WEIGHTS.reduce((total, weight, index) => total + weight * Number(firstTen[index]), 0);
  const digit = 11 - (sum % 11);

  if (digit === 11) {
    return 0;
  }

  return digit === 10 ? undefined : digit;
}

/**
 * CUIT o CUIL con o sin guiones, puntos o espacios (`20-40950976-3`, `20409509763`).
 * Devuelve los 11 digitos si el formato y el digito verificador son validos, o el motivo si no.
 */
export function parseCuit(raw: number | string): CuitParseResult {
  const value = String(raw)
    .trim()
    .replace(/[-.\s]/g, '');

  if (!/^\d{11}$/.test(value)) {
    return { ok: false, reason: 'debe tener 11 digitos, con o sin guiones' };
  }

  if (computeCheckDigit(value.slice(0, 10)) !== Number(value[10])) {
    return { ok: false, reason: 'el digito verificador no coincide; revisá que esté bien escrito' };
  }

  return { ok: true, value };
}
