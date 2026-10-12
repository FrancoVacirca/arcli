import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BACK } from '../../../modules/interactive/wizard';
import { fetchChangelog } from '../../../modules/update-check/changelog';
import { copyToClipboard } from '../../../services/clipboard/clipboard';
import { stripAnsi } from '../../../ui';
import { chooseStep } from '../prompts';
import { runUpdateFlow } from '../update.flow';

vi.mock('../prompts', () => ({ chooseStep: vi.fn() }));
vi.mock('../../../services/clipboard/clipboard', () => ({ copyToClipboard: vi.fn(() => true) }));
vi.mock('../../../modules/update-check/changelog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../modules/update-check/changelog')>()),
  fetchChangelog: vi.fn(),
}));

const UPDATE = { currentVersion: '1.8.0', latestVersion: '1.9.0' };
const CHANGELOG = `## [1.9.0] - 2026-10-12

Estado de ARCA en la barra.

### Agregado

- **Barra con el estado de ARCA:** funcionando, con demoras o con problemas.

## [1.8.0] - 2026-10-09
`;

describe('runUpdateFlow', () => {
  let output = '';

  beforeEach(() => {
    output = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('muestra las dos versiones y las novedades, y "Volver" no copia nada', async () => {
    vi.mocked(fetchChangelog).mockResolvedValueOnce(CHANGELOG);
    vi.mocked(chooseStep).mockResolvedValueOnce(BACK);

    await expect(runUpdateFlow(UPDATE)).resolves.toBe(false);

    const text = stripAnsi(output);

    expect(text).toMatch(/Tu version\s+1\.8\.0/);
    expect(text).toMatch(/Nueva version\s+1\.9\.0/);
    expect(text).toMatch(/nuevo\s+Barra con el estado de ARCA/);
    expect(text).toContain('12/10/2026');
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('"Cerrar para actualizar" copia el comando y pide cerrar', async () => {
    vi.mocked(fetchChangelog).mockResolvedValueOnce(undefined);
    vi.mocked(chooseStep).mockResolvedValueOnce('cerrar');

    await expect(runUpdateFlow(UPDATE)).resolves.toBe(true);

    expect(copyToClipboard).toHaveBeenCalledWith('npm install -g arcli@latest');
    expect(stripAnsi(output)).toContain('No se pudieron cargar las novedades');
    expect(stripAnsi(output)).toContain('Comando copiado');
  });

  it('si no se puede copiar, muestra el comando para escribirlo', async () => {
    vi.mocked(fetchChangelog).mockResolvedValueOnce(undefined);
    vi.mocked(copyToClipboard).mockReturnValueOnce(false);
    vi.mocked(chooseStep).mockResolvedValueOnce('cerrar');

    await runUpdateFlow(UPDATE);

    expect(stripAnsi(output)).toContain('No se pudo copiar el comando');
  });
});
