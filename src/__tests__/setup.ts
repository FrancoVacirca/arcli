import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

// Ningun test toca la config real (Conf la busca desde HOME o APPDATA) ni depende de la terminal de quien corre la
// suite: con FORCE_COLOR o ARCLI_ASCII en el entorno, las salidas esperadas cambian.
const home = mkdtempSync(join(tmpdir(), 'arcli-test-'));

process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.APPDATA = join(home, 'AppData', 'Roaming');
process.env.XDG_CONFIG_HOME = join(home, '.config');

delete process.env.FORCE_COLOR;
delete process.env.NO_COLOR;
delete process.env.ARCLI_ASCII;

afterAll(() => {
  rmSync(home, { force: true, recursive: true });
});
