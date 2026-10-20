import { writeFileSync } from 'node:fs';
import { extname } from 'node:path';

const MAX_ATTEMPTS = 1000;

function withSuffix(path: string, attempt: number): string {
  if (attempt === 1) {
    return path;
  }

  const extension = extname(path);

  return `${path.slice(0, path.length - extension.length)}-${attempt}${extension}`;
}

/**
 * Escribe sin pisar nunca un archivo existente: si `factura.pdf` ya esta, prueba `factura-2.pdf`, `factura-3.pdf`...
 * Usa `wx`, asi que tampoco pisa un archivo creado entre el chequeo y la escritura. Devuelve la ruta usada.
 */
export function writeNewFile(path: string, data: Uint8Array): string {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const candidate = withSuffix(path, attempt);

    try {
      writeFileSync(candidate, data, { flag: 'wx' });

      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  throw new Error(`No se pudo guardar ${path}: ya existen ${MAX_ATTEMPTS} archivos con ese nombre.`);
}
