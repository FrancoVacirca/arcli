/** CUIT o CUIL con guiones, como lo muestra ARCA: `20333333334` → `20-33333333-4`. Si no tiene 11 digitos, sin cambios. */
export function formatCuit(value: number | string): string {
  const digits = String(value);

  return /^\d{11}$/.test(digits) ? `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}` : digits;
}
