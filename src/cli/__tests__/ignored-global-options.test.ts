import { describe, expect, it, vi } from 'vitest';

import { formatIgnoredGlobalOptionsWarning } from '../ignored-global-options';
import { createProgram } from '../program';

// Sin tocar la config real del equipo que corre los tests.
vi.mock('../../modules/config/config.service', () => ({
  ConfigService: class {
    public close(): void {}
    public ensureInitialized(): void {}
    public getConfig(): { output: { jsonPorDefecto: boolean } } {
      return { output: { jsonPorDefecto: false } };
    }
    public getPath(): string {
      return '/tmp/arcli/config.json';
    }
  },
}));

async function stderrOf(argv: string[]): Promise<string> {
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

  try {
    await createProgram().parseAsync(['node', 'arcli', ...argv]);

    return write.mock.calls.map(([chunk]) => String(chunk)).join('');
  } finally {
    write.mockRestore();
    stdout.mockRestore();
  }
}

describe('opciones globales que no aplican', () => {
  it('avisa sin cortar la ejecucion cuando el comando no usa la opcion', async () => {
    expect(await stderrOf(['config', 'ruta', '--produccion', '--bruto'])).toContain(
      'Aviso: --produccion, --bruto no aplican a `arcli config ruta`, se ignoran.',
    );
  });

  it('no avisa cuando el comando declara la opcion', async () => {
    expect(await stderrOf(['ejemplos'])).not.toContain('Aviso');
    expect(await stderrOf(['config', 'ruta'])).not.toContain('Aviso');
  });

  it('arma el mensaje en singular', () => {
    expect(formatIgnoredGlobalOptionsWarning(['--bruto'], 'arcli pdf estado')).toBe(
      'Aviso: --bruto no aplica a `arcli pdf estado`, se ignora.',
    );
  });
});
