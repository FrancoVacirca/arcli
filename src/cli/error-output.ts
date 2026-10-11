import { ConfigService } from '../modules/config/config.service';

function readJsonDefault(): boolean {
  const service = new ConfigService();

  try {
    return service.getConfig().output.jsonPorDefecto;
  } finally {
    service.close();
  }
}

/**
 * Los errores salen en JSON con `--json` o, sin el flag, si la config tiene `json=true`, igual que los
 * resultados. La config se lee recien al fallar; si tambien falla (config invalida), sale en texto.
 */
export function shouldPrintErrorAsJson(argv: readonly string[], readDefault = readJsonDefault): boolean {
  if (argv.includes('--json')) {
    return true;
  }

  try {
    return readDefault();
  } catch {
    return false;
  }
}
