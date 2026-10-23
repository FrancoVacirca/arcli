import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createSelfSignedCertificate,
  removeSelfSignedCertificates,
} from '../../../lib/security/__tests__/self-signed-certificate';
import { ConfigService } from '../../../modules/config/config.service';
import { ArcaContextResolver } from '../arca-context.resolver';

const temporaryDirectories: string[] = [];

function createTempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'arcli-arca-context-'));

  temporaryDirectories.push(directory);

  return directory;
}

function createConfigService(cwd: string): ConfigService {
  return new ConfigService({
    cwd,
    projectName: 'arcli-test',
  });
}

function writePemFile(cwd: string, filename: string, content: string): string {
  const fullPath = join(cwd, filename);

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

function writeRawConfig(
  cwd: string,
  content: {
    readonly cert?: { readonly produccion?: string; readonly testing?: string };
    readonly cuit?: string;
    readonly entornoPorDefecto?: 'produccion' | 'testing';
    readonly key?: { readonly produccion?: string; readonly testing?: string };
    readonly output?: {
      readonly emitirPorDefecto?: boolean;
      readonly jsonPorDefecto?: boolean;
      readonly brutoPorDefecto?: boolean;
    };
    readonly puntoVentaPorDefecto?: number;
  },
): string {
  const configPath = join(cwd, 'config.json');

  writeFileSync(configPath, JSON.stringify(content, null, 2), 'utf8');

  return configPath;
}

afterEach(() => {
  removeSelfSignedCertificates();

  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('arca-context.resolver', () => {
  it('resolves context from persisted config using testing as default environment', () => {
    const cwd = createTempDirectory();
    const certPath = writePemFile(cwd, 'cert-testing.pem', certificatePem('CERT-TESTING'));
    const keyPath = writePemFile(cwd, 'key-testing.pem', privateKeyPem('KEY-TESTING'));
    const configService = createConfigService(cwd);

    configService.setValue('cuit', '20123456789');
    configService.setValue('cert.testing', certPath);
    configService.setValue('key.testing', keyPath);
    configService.setValue('puntoVenta', '7');
    configService.setValue('bruto', 'si');
    try {
      const runtime = new ArcaContextResolver({ configService }).resolve();

      expect(runtime.environment).toBe('testing');
      expect(runtime.outputRaw).toBe(true);
      expect(runtime.pointOfSale).toBe(7);
      expect(runtime.context).toMatchObject({
        cert: certificatePem('CERT-TESTING'),
        cuit: 20123456789,
        key: privateKeyPem('KEY-TESTING'),
        production: false,
      });
    } finally {
      configService.close();
    }
  });

  it('prefers testing flag over persisted default environment', () => {
    const cwd = createTempDirectory();
    const productionCertPath = writePemFile(cwd, 'cert-production.pem', certificatePem('CERT-PRODUCTION'));
    const productionKeyPath = writePemFile(cwd, 'key-production.pem', privateKeyPem('KEY-PRODUCTION'));
    const testingCertPath = writePemFile(cwd, 'cert-testing.pem', certificatePem('CERT-TESTING'));
    const testingKeyPath = writePemFile(cwd, 'key-testing.pem', privateKeyPem('KEY-TESTING'));
    const configService = createConfigService(cwd);

    configService.setValue('cuit', '20123456789');
    configService.setValue('entorno', 'produccion');
    configService.setValue('cert.produccion', productionCertPath);
    configService.setValue('key.produccion', productionKeyPath);
    configService.setValue('cert.testing', testingCertPath);
    configService.setValue('key.testing', testingKeyPath);
    try {
      const runtime = new ArcaContextResolver({
        configService,
        options: { testing: true },
      }).resolve();

      expect(runtime.environment).toBe('testing');
      expect(runtime.outputJson).toBe(false);
      expect(runtime.outputRaw).toBe(false);
      expect(runtime.pointOfSale).toBeUndefined();
      expect(runtime.context).toMatchObject({
        cert: certificatePem('CERT-TESTING'),
        cuit: 20123456789,
        key: privateKeyPem('KEY-TESTING'),
        production: false,
      });
    } finally {
      configService.close();
    }
  });

  it('uses produccion when the user passes --produccion', () => {
    const cwd = createTempDirectory();
    const testingCertPath = writePemFile(cwd, 'cert-testing.pem', certificatePem('CERT-TESTING'));
    const testingKeyPath = writePemFile(cwd, 'key-testing.pem', privateKeyPem('KEY-TESTING'));
    const productionCertPath = writePemFile(cwd, 'cert-production.pem', certificatePem('CERT-PRODUCTION'));
    const productionKeyPath = writePemFile(cwd, 'key-production.pem', privateKeyPem('KEY-PRODUCTION'));
    const configService = createConfigService(cwd);

    configService.setValue('cuit', '20123456789');
    configService.setValue('cert.testing', testingCertPath);
    configService.setValue('key.testing', testingKeyPath);
    configService.setValue('cert.produccion', productionCertPath);
    configService.setValue('key.produccion', productionKeyPath);
    try {
      const runtime = new ArcaContextResolver({
        configService,
        options: { produccion: true },
      }).resolve();

      expect(runtime.environment).toBe('produccion');
      expect(runtime.context.production).toBe(true);
      expect(runtime.context.cert).toBe(certificatePem('CERT-PRODUCTION'));
      expect(runtime.context.key).toBe(privateKeyPem('KEY-PRODUCTION'));
    } finally {
      configService.close();
    }
  });

  it('rejects using testing and production flags together', () => {
    const cwd = createTempDirectory();
    const configService = createConfigService(cwd);

    configService.setValue('cuit', '20123456789');
    try {
      expect(() =>
        new ArcaContextResolver({
          configService,
          options: {
            produccion: true,
            testing: true,
          },
        }).validate(),
      ).toThrow(/Use --testing o --produccion/);
    } finally {
      configService.close();
    }
  });

  it('fails when required values are missing', () => {
    const cwd = createTempDirectory();

    const configService = createConfigService(cwd);

    try {
      expect(() => new ArcaContextResolver({ configService }).resolve()).toThrow(/Falta el CUIT/);
    } finally {
      configService.close();
    }
  });

  it('masks missing file paths in configuration errors', () => {
    const cwd = createTempDirectory();
    writeRawConfig(cwd, {
      cert: {
        testing: join(cwd, 'missing-cert.pem'),
      },
      cuit: '20123456789',
      entornoPorDefecto: 'testing',
      key: {
        testing: join(cwd, 'missing-key.pem'),
      },
      output: {
        emitirPorDefecto: false,
        jsonPorDefecto: false,
        brutoPorDefecto: false,
      },
    });
    const configService = createConfigService(cwd);

    try {
      expect(() => new ArcaContextResolver({ configService }).validate()).toThrow(/\.{3}\/.*missing-cert\.pem/);
    } finally {
      configService.close();
    }
  });

  it('fails with a clear message when certificate content is not valid pem', () => {
    const cwd = createTempDirectory();
    const certPath = writePemFile(cwd, 'cert-testing.pem', 'CERT-TESTING');
    const keyPath = writePemFile(cwd, 'key-testing.pem', privateKeyPem('KEY-TESTING'));
    writeRawConfig(cwd, {
      cert: {
        testing: certPath,
      },
      cuit: '20123456789',
      entornoPorDefecto: 'testing',
      key: {
        testing: keyPath,
      },
      output: {
        emitirPorDefecto: false,
        jsonPorDefecto: false,
        brutoPorDefecto: false,
      },
    });
    const configService = createConfigService(cwd);

    try {
      expect(() => new ArcaContextResolver({ configService }).resolve()).toThrow(/formato PEM invalido/);
    } finally {
      configService.close();
    }
  });

  it('validates runtime data without contacting ARCA', () => {
    const cwd = createTempDirectory();
    const certPath = writePemFile(cwd, 'cert-testing.pem', certificatePem('CERT-TESTING'));
    const keyPath = writePemFile(cwd, 'key-testing.pem', privateKeyPem('KEY-TESTING'));
    const configService = createConfigService(cwd);

    configService.setValue('cuit', '20123456789');
    configService.setValue('cert.testing', certPath);
    configService.setValue('key.testing', keyPath);
    try {
      const validation = new ArcaContextResolver({ configService }).validate();

      expect(validation).toMatchObject({
        certPath,
        cuit: 20123456789,
        environment: 'testing',
        keyPath,
        outputRaw: false,
      });
    } finally {
      configService.close();
    }
  });

  it('defaults the WSAA ticket path to a tickets folder next to the config file', () => {
    const cwd = createTempDirectory();
    const certPath = writePemFile(cwd, 'cert-testing.pem', certificatePem('CERT-TESTING'));
    const keyPath = writePemFile(cwd, 'key-testing.pem', privateKeyPem('KEY-TESTING'));
    const configService = createConfigService(cwd);

    configService.setValue('cuit', '20123456789');
    configService.setValue('cert.testing', certPath);
    configService.setValue('key.testing', keyPath);
    try {
      const runtime = new ArcaContextResolver({ configService }).resolve();

      expect(runtime.context.ticketPath).toBe(configService.getDefaultTicketPath());
    } finally {
      configService.close();
    }
  });

  it('uses a configured ticketPath instead of the default', () => {
    const cwd = createTempDirectory();
    const certPath = writePemFile(cwd, 'cert-testing.pem', certificatePem('CERT-TESTING'));
    const keyPath = writePemFile(cwd, 'key-testing.pem', privateKeyPem('KEY-TESTING'));
    const customTicketPath = join(cwd, 'tickets-personalizados');
    const configService = createConfigService(cwd);

    configService.setValue('cuit', '20123456789');
    configService.setValue('cert.testing', certPath);
    configService.setValue('key.testing', keyPath);
    configService.setValue('ticketPath', customTicketPath);
    try {
      const runtime = new ArcaContextResolver({ configService }).resolve();

      expect(runtime.context.ticketPath).toBe(customTicketPath);
    } finally {
      configService.close();
    }
  });

  describe('certificate expiry', () => {
    const DAY = 24 * 60 * 60 * 1000;

    function resolveWithCertificate(days: number, now?: Date) {
      const cwd = createTempDirectory();
      const certificate = createSelfSignedCertificate(days);
      const configService = createConfigService(cwd);

      configService.setValue('cuit', '20123456789');
      configService.setValue('cert.testing', certificate.certPath);
      configService.setValue('key.testing', certificate.keyPath);

      try {
        return new ArcaContextResolver({ configService, now }).resolve();
      } finally {
        configService.close();
      }
    }

    it('flags a certificate that expires within 30 days', () => {
      expect(resolveWithCertificate(10).certificateExpiry).toMatchObject({
        environment: 'testing',
        expired: false,
        message: expect.stringMatching(/^El certificado de testing vence el \d{2}\/\d{2}\/\d{4} \(en (9|10) días\)/),
      });
    }, 10_000);

    it('flags an expired certificate without failing to resolve', () => {
      const runtime = resolveWithCertificate(10, new Date(Date.now() + 20 * DAY));

      expect(runtime.certificateExpiry).toMatchObject({ environment: 'testing', expired: true });
    }, 10_000);

    it('stays silent for a certificate far from expiring', () => {
      const runtime = resolveWithCertificate(365);

      expect(runtime.certificateExpiry).toBeUndefined();
      expect(runtime.certificateNotices).toEqual([]);
    }, 10_000);

    it('also warns about the production certificate while working in testing', () => {
      const cwd = createTempDirectory();
      const testing = createSelfSignedCertificate(365);
      const production = createSelfSignedCertificate(10);
      const configService = createConfigService(cwd);

      configService.setValue('cuit', '20123456789');
      configService.setValue('cert.testing', testing.certPath);
      configService.setValue('key.testing', testing.keyPath);
      configService.setValue('cert.produccion', production.certPath);

      try {
        const runtime = new ArcaContextResolver({ configService }).resolve();

        expect(runtime.environment).toBe('testing');
        expect(runtime.certificateExpiry).toBeUndefined();
        expect(runtime.certificateNotices).toEqual([
          expect.objectContaining({ environment: 'produccion', expired: false }),
        ]);
      } finally {
        configService.close();
      }
    }, 10_000);

    it('does not invent a notice when the certificate cannot be parsed', () => {
      const cwd = createTempDirectory();
      const configService = createConfigService(cwd);

      configService.setValue('cuit', '20123456789');
      configService.setValue('cert.testing', writePemFile(cwd, 'cert.pem', certificatePem('CERT-TESTING')));
      configService.setValue('key.testing', writePemFile(cwd, 'key.pem', privateKeyPem('KEY-TESTING')));

      try {
        expect(new ArcaContextResolver({ configService }).resolve().certificateExpiry).toBeUndefined();
      } finally {
        configService.close();
      }
    });
  });
});
