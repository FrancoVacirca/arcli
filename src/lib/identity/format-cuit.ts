/** CUIT o CUIL con guiones, como lo muestra ARCA: `20409509763` → `20-40950976-3`. Si no tiene 11 digitos, sin cambios. */
export function formatCuit(value: number | string): string {
  const digits = String(value);

  return /^\d{11}$/.test(digits) ? `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}` : digits;
}
