import { existsSync, readFileSync } from 'node:fs';

import { InputValidationError } from '../errors/app-error';

export function readJsonFile<T>(filePath: string): T {
  if (!existsSync(filePath)) {
    throw new InputValidationError(`La ruta del archivo JSON no existe: ${filePath}`, {
      path: filePath,
    });
  }

  const rawContent = readFileSync(filePath, 'utf8');

  try {
    return JSON.parse(rawContent) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON inválido';

    throw new InputValidationError(`No se pudo leer el archivo JSON "${filePath}": ${message}`, {
      cause: error instanceof Error ? error.message : 'JSON inválido',
      path: filePath,
    });
  }
}
