import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ConfigurationError } from '../../../lib/errors/app-error';
import { ConfigService } from '../config.service';

const temporaryDirectories: string[] = [];

function createService(): ConfigService {
  const cwd = mkdtempSync(join(tmpdir(), 'arcli-config-test-'));

  temporaryDirectories.push(cwd);

  return new ConfigService({
    cwd,
    projectName: 'arcli-test',
  });
}

function writePemFile(directory: string, filename: string, content: string): string {
  const fullPath = join(directory, filename);

  writeFileSync(fullPath, content, 'utf8');

  return fullPath;
}

function certificatePem(label: string): string {
  return `-----BEGIN CERTIFICATE-----
${label}
-----END CERTIFICATE-----`;
}

function privateKeyPem(label: string): string {
  return `-----BEGIN PRIVATE KEY-----
${label}
-----END PRIVATE KEY-----`;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('config.service', () => {
  it('initializes config with defaults', () => {
    const service = createService();

    try {
      expect(service.initialize()).toEqual({
        cert: {},
        cotizacionPorDefecto: 1,
        emisor: {},
        entornoPorDefecto: 'testing',
        key: {},
        monedaPorDefecto: 'PES',
        output: {
          emitirPorDefecto: false,
          jsonPorDefecto: false,
          brutoPorDefecto: false,
        },
      });
    } finally {
      service.close();
    }
  });

  it('does not save an invalid value, so the CLI keeps working', () => {
    const service = createService();

    try {
      service.setValue('cuit', '20123456786');

      expect(() => service.setValue('cuit', 'abc')).toThrow();
      expect(service.getConfig().cuit).toBe('20123456786');
      expect(JSON.parse(readFileSync(service.getPath(), 'utf8')).cuit).toBe('20123456786');
    } finally {
      service.close();
    }
  });

  it('fixes a config that was already broken by setting or deleting the bad key', () => {
    const service = createService();

    try {
      writeFileSync(service.getPath(), JSON.stringify({ cuit: 'abc', puntoVentaPorDefecto: 3 }));

      expect(() => service.getConfig()).toThrow();
      expect(service.unsetValue('cuit').puntoVentaPorDefecto).toBe(3);

      writeFileSync(service.getPath(), JSON.stringify({ cuit: 'abc' }));

      expect(service.setValue('cuit', '20123456786').cuit).toBe('20123456786');
    } finally {
      service.close();
    }
  });

  it('sets and deletes nested keys', () => {
    const service = createService();

    try {
      service.setValue('emitir', 'si');

      expect(service.getConfig().output.emitirPorDefecto).toBe(true);
      expect(service.unsetValue('emitir').output.emitirPorDefecto).toBe(false);
    } finally {
      service.close();
    }
  });

  it('stores scalar values with public aliases', () => {
    const service = createService();

    try {
      service.setValue('entorno', 'produccion');
      service.setValue('puntoVenta', '3');
      service.setValue('cuit', '20123456786');
      service.setValue('concepto', 'servicios');
      service.setValue('moneda', 'usd');
      service.setValue('cotizacion', '1.234,5');
      service.setValue('ivaReceptor', 'consumidor-final');
      service.setValue('emitir', 'si');
      service.setValue('json', 'si');
      service.setValue('bruto', 'si');

      expect(service.getConfig()).toEqual({
        cert: {},
        conceptoPorDefecto: 'servicios',
        cotizacionPorDefecto: 1234.5,
        cuit: '20123456786',
        emisor: {},
        entornoPorDefecto: 'produccion',
        ivaReceptorPorDefecto: 'consumidor-final',
        key: {},
        monedaPorDefecto: 'USD',
        output: {
          emitirPorDefecto: true,
          jsonPorDefecto: true,
          brutoPorDefecto: true,
        },
        puntoVentaPorDefecto: 3,
      });
    } finally {
      service.close();
    }
  });

  it('stores nested paths for certificates and keys', () => {
    const service = createService();
    const cwd = temporaryDirectories[temporaryDirectories.length - 1]!;
    const testingCertPath = writePemFile(cwd, 'testing-cert.pem', certificatePem('TESTING-CERT'));
    const productionKeyPath = writePemFile(cwd, 'production-key.pem', privateKeyPem('PRODUCTION-KEY'));

    try {
      service.setValue('cert.testing', testingCertPath);
      service.setValue('key.produccion', productionKeyPath);

      expect(service.getConfig()).toEqual({
        cert: {
          testing: testingCertPath,
        },
        cotizacionPorDefecto: 1,
        emisor: {},
        entornoPorDefecto: 'testing',
        key: {
          produccion: productionKeyPath,
        },
        monedaPorDefecto: 'PES',
        output: {
          emitirPorDefecto: false,
          jsonPorDefecto: false,
          brutoPorDefecto: false,
        },
      });
    } finally {
      service.close();
    }
  });

  it('unsets values and preserves defaults', () => {
    const service = createService();

    try {
      service.setValue('entorno', 'produccion');
      service.unsetValue('entorno');

      expect(service.getConfig().entornoPorDefecto).toBe('testing');
    } finally {
      service.close();
    }
  });

  it('returns the config path', () => {
    const service = createService();

    try {
      expect(service.getPath()).toContain('config.json');
    } finally {
      service.close();
    }
  });

  it('defaults the ticket path to a tickets folder next to the config file', () => {
    const service = createService();

    try {
      expect(service.getDefaultTicketPath()).toBe(join(dirname(service.getPath()), 'tickets'));
      expect(service.resolveTicketPath(service.getConfig())).toBe(service.getDefaultTicketPath());
    } finally {
      service.close();
    }
  });

  it('lets the user override the ticket path', () => {
    const service = createService();

    try {
      const cwd = temporaryDirectories[temporaryDirectories.length - 1]!;
      const customTicketPath = join(cwd, 'tickets-personalizados');

      service.setValue('ticketPath', customTicketPath);

      expect(service.resolveTicketPath(service.getConfig())).toBe(customTicketPath);
    } finally {
      service.close();
    }
  });

  it('rejects invalid values', () => {
    const service = createService();
    const cwd = temporaryDirectories[temporaryDirectories.length - 1]!;
    const invalidPemPath = writePemFile(cwd, 'invalid-testing.key', 'NOT-A-PEM');

    try {
      expect(() => service.setValue('entorno', 'demo')).toThrow();
      expect(() => service.setValue('concepto', 'cosas')).toThrow();
      expect(() => service.setValue('ivaReceptor', 'algo-raro')).toThrow();
      expect(() => service.setValue('cotizacion', '0')).toThrow();
      expect(() => service.setValue('puntoVenta', '0')).toThrow();
      expect(() => service.setValue('emitir', 'tal-vez')).toThrow();
      expect(() => service.setValue('json', 'tal-vez')).toThrow();
      expect(() => service.setValue('cuit', '123')).toThrow();
      expect(() => service.setValue('key.testing', invalidPemPath)).toThrow(/formato PEM invalido/);
    } finally {
      service.close();
    }
  });

  it('reports a corrupt config file as a configuration error with its path, without touching it', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'arcli-config-test-'));
    const configPath = join(cwd, 'config.json');
    const corruptContent = '{ "cuit": "20123456786", ';

    temporaryDirectories.push(cwd);
    writeFileSync(configPath, corruptContent, 'utf8');

    let thrown: unknown;

    try {
      new ConfigService({ cwd, projectName: 'arcli-test' }).close();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConfigurationError);
    expect((thrown as ConfigurationError).message).toMatch(/JSON invalido/);
    expect((thrown as ConfigurationError).details).toEqual({ path: configPath });
    expect((thrown as ConfigurationError).suggestion).toMatch(/arcli config/);
    expect(readFileSync(configPath, 'utf8')).toBe(corruptContent);
  });
});
