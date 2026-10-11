/** Entero positivo escrito solo con digitos: `3` si, `3a`, `3.5` o `-3` no. */
export function parseStrictInteger(raw: string): number | undefined {
  const value = raw.trim();

  return /^\d+$/.test(value) ? Number(value) : undefined;
}

/** Numero de documento (CUIT, CUIL o DNI): acepta guiones, puntos y espacios, como `20-11111111-2` o `30.111.222`. */
export function parseDocumentNumber(raw: string): number | undefined {
  return parseStrictInteger(raw.replace(/[-.\s]/g, ''));
}
