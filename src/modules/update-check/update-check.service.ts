import Conf from 'conf';

const PACKAGE_NAME = 'arcli';
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;

interface UpdateCheckCache {
  readonly lastCheckedAt: number;
  readonly latestVersion: string;
}

const CACHE_DEFAULTS: UpdateCheckCache = {
  lastCheckedAt: 0,
  latestVersion: '',
};

export interface UpdateCheckResult {
  readonly currentVersion: string;
  readonly latestVersion: string;
}

function isUpdateCheckDisabled(): boolean {
  return Boolean(process.env.CI) || Boolean(process.env.NO_UPDATE_NOTIFIER) || process.stderr.isTTY !== true;
}

export function isNewerVersion(latestVersion: string, currentVersion: string): boolean {
  const parse = (version: string) => version.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const [latestMajor, latestMinor, latestPatch] = parse(latestVersion);
  const [currentMajor, currentMinor, currentPatch] = parse(currentVersion);

  if (latestMajor !== currentMajor) {
    return latestMajor > currentMajor;
  }

  if (latestMinor !== currentMinor) {
    return latestMinor > currentMinor;
  }

  return latestPatch > currentPatch;
}

async function fetchLatestVersion(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(REGISTRY_URL, { signal: controller.signal });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { version?: string };

    return payload.version ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function createCacheStore(cwd?: string): Conf<UpdateCheckCache> {
  return new Conf<UpdateCheckCache>({
    configName: 'update-cache',
    cwd,
    defaults: CACHE_DEFAULTS,
    projectName: PACKAGE_NAME,
    projectSuffix: '',
  });
}

export interface CheckForUpdateOptions {
  readonly cwd?: string;
  /** Cada cuanto se consulta el registry; por defecto, una vez por dia. */
  readonly maxAgeMs?: number;
}

export async function checkForUpdate(
  currentVersion: string,
  options: CheckForUpdateOptions = {},
): Promise<UpdateCheckResult | null> {
  if (isUpdateCheckDisabled()) {
    return null;
  }

  const cache = createCacheStore(options.cwd);
  const isCacheStale = Date.now() - cache.get('lastCheckedAt') > (options.maxAgeMs ?? CHECK_INTERVAL_MS);
  let latestVersion = cache.get('latestVersion');

  if (isCacheStale) {
    const fetchedVersion = await fetchLatestVersion();

    if (fetchedVersion) {
      latestVersion = fetchedVersion;
      cache.set('latestVersion', fetchedVersion);
    }

    cache.set('lastCheckedAt', Date.now());
  }

  if (!latestVersion || !isNewerVersion(latestVersion, currentVersion)) {
    return null;
  }

  return { currentVersion, latestVersion };
}
