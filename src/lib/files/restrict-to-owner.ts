import { chmodSync, existsSync } from 'node:fs';

/** Permisos solo para el dueno en archivos y carpetas nuevos: tickets de ARCA, config y PDFs. */
export const OWNER_ONLY_UMASK = 0o077;

/**
 * Deja una carpeta existente en 0700. Alcanza para proteger lo de adentro (por ejemplo tickets viejos en 0644):
 * sin permiso de la carpeta, nadie mas llega a los archivos. Si no es nuestra o el sistema no lo soporta, sigue.
 */
export function restrictFolderToOwner(path: string): void {
  if (process.platform === 'win32' || !existsSync(path)) {
    return;
  }

  try {
    chmodSync(path, 0o700);
  } catch {
    // Carpeta de otro usuario o sistema de archivos sin permisos POSIX: no es motivo para frenar el comando.
  }
}
