import type { ParametersGateway } from './parameters';

/**
 * Estado general de ARCA para la barra del modo interactivo. Sale de FEDummy, que no pide autenticacion:
 * - funcionando: app, db y auth en OK y respuesta rapida
 * - con-demoras: los tres en OK, pero tardo mas de `slowMs`
 * - con-problemas: alguno de los tres no esta en OK
 * - sin-respuesta: error de red o no contesto en `timeoutMs`
 */
export type ArcaHealth = 'con-demoras' | 'con-problemas' | 'funcionando' | 'sin-respuesta';

export const ARCA_SLOW_MS = 3000;
export const ARCA_TIMEOUT_MS = 5000;

const SERVER_OK = 'OK';

export async function checkArcaHealth(options: {
  readonly gateway: Pick<ParametersGateway, 'getServerStatus'>;
  readonly now?: () => number;
  readonly slowMs?: number;
  readonly timeoutMs?: number;
}): Promise<ArcaHealth> {
  const { gateway, now = Date.now, slowMs = ARCA_SLOW_MS, timeoutMs = ARCA_TIMEOUT_MS } = options;
  const start = now();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
    timer.unref();
  });

  try {
    const servers = await Promise.race([gateway.getServerStatus(), timeout]);

    if (!servers) {
      return 'sin-respuesta';
    }

    if (![servers.app, servers.db, servers.auth].every((value) => value === SERVER_OK)) {
      return 'con-problemas';
    }

    return now() - start > slowMs ? 'con-demoras' : 'funcionando';
  } catch {
    return 'sin-respuesta';
  } finally {
    clearTimeout(timer);
  }
}
