import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArcliConfig } from '../../../modules/config/config.schemas';
import { createProgram } from '../../program';
import { buildRuntimeChecks } from '../config.command';

const validate = vi.fn();
const resolverOptions: unknown[] = [];

vi.mock('../../../services/arca/arca-context.resolver', () => ({
  ArcaContextResolver: class {
    public constructor(options: { options: unknown }) {
      resolverOptions.push(options.options);
    }

    public validate(): unknown {
      return validate();
    }
  },
}));

const CONFIG = {
  cert: { testing: '/certs/testing.pem' },
  cuit: '20123456786',
  emisor: {},
  entornoPorDefecto: 'testing',
  key: { testing: '/certs/testing.key' },
  output: { brutoPorDefecto: false, emitirPorDefecto: false, jsonPorDefecto: false },
} satisfies ArcliConfig;

let storedConfig: ArcliConfig = CONFIG;

vi.mock('../../../modules/config/config.service', () => ({
  ConfigService: class {
    public close(): void {}
    public ensureInitialized(): ArcliConfig {
      return storedConfig;
    }
    public getConfig(): ArcliConfig {
      return storedConfig;
    }
    public resolvePaths(): { pdfFolder: string; ticketPath: string } {
      return { pdfFolder: '/pdfs', ticketPath: '/tickets' };
    }
  },
}));

beforeEach(() => {
  storedConfig = CONFIG;
  validate.mockReset();
  resolverOptions.length = 0;
});

describe('buildRuntimeChecks', () => {
  it('valida solo el entorno por defecto si el otro no tiene credenciales', () => {
    expect(buildRuntimeChecks(CONFIG)).toEqual([{ environment: 'testing' }]);
    expect(resolverOptions).toEqual([{ testing: true }]);
  });

  it('valida los dos entornos cuando produccion tiene credenciales', () => {
    validate
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('No se encontró el certificado.');
      });

    const checks = buildRuntimeChecks({ ...CONFIG, cert: { ...CONFIG.cert, produccion: '/certs/prod.pem' } });

    expect(checks).toEqual([
      { environment: 'testing' },
      { environment: 'produccion', error: 'No se encontró el certificado.' },
    ]);
    expect(resolverOptions).toEqual([{ testing: true }, { produccion: true }]);
  });
});

describe('arcli config', () => {
  it('respeta --json en config revisar aunque lo parsee el programa', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      await createProgram().parseAsync(['node', 'arcli', 'config', 'revisar', '--json']);

      const output = write.mock.calls.map(([chunk]) => String(chunk)).join('');

      expect(JSON.parse(output)).toHaveProperty('chequeos');
      expect(output).toContain('"etiqueta": "Validación testing"');
    } finally {
      write.mockRestore();
    }
  });

  it('sale en JSON con json=true en la config, sin el flag', async () => {
    storedConfig = { ...CONFIG, output: { ...CONFIG.output, jsonPorDefecto: true } };
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      await createProgram().parseAsync(['node', 'arcli', 'config']);

      const output = write.mock.calls.map(([chunk]) => String(chunk)).join('');

      expect(JSON.parse(output)).toHaveProperty('cuit', '20123456786');
    } finally {
      write.mockRestore();
    }
  });

  it('ya no acepta --testing ni --produccion en config revisar como opcion propia', () => {
    const revisar = createProgram()
      .commands.find((command) => command.name() === 'config')
      ?.commands.find((command) => command.name() === 'revisar');

    expect(revisar?.options.map((option) => option.long)).toEqual(['--json']);
  });
});
