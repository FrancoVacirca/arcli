import type { Context } from '@arcasdk/core';
import { dirname } from 'node:path';

import type { GlobalCliOptions } from '../../cli/types';
import { ConfigurationError } from '../../lib/errors/app-error';
import { restrictFolderToOwner } from '../../lib/files/restrict-to-owner';
import { ensurePathExists, readPemFile } from '../../lib/security/pem';
import { type CertificateExpiryNotice, inspectConfiguredCertificates } from '../../modules/config/certificate-expiry';
import type { ArcliConfig, ArcliEnvironment } from '../../modules/config/config.schemas';
import { ConfigService } from '../../modules/config/config.service';

export interface ResolveArcaContextOptions {
  readonly configService?: ConfigService;
  /** Reloj para el vencimiento del certificado; solo lo cambian los tests. */
  readonly now?: Date;
  readonly options?: GlobalCliOptions;
}

export interface ResolvedArcaRuntime {
  /**
   * El del entorno activo, solo si vence en menos de 30 dias o ya vencio: vencido, corta antes de ir a ARCA. Se
   * calcula con el PEM ya leido para el contexto, sin red.
   */
  readonly certificateExpiry?: CertificateExpiryNotice;
  /** Los avisos de todos los certificados configurados, el del entorno activo primero: los que se muestran. */
  readonly certificateNotices: readonly CertificateExpiryNotice[];
  readonly config: ArcliConfig;
  readonly context: Context;
  readonly environment: ArcliEnvironment;
  readonly outputJson: boolean;
  readonly outputRaw: boolean;
  readonly pointOfSale?: number;
}

export interface ArcaRuntimeValidation {
  readonly certPath: string;
  readonly cuit: number;
  readonly environment: ArcliEnvironment;
  readonly keyPath: string;
  readonly outputJson: boolean;
  readonly outputRaw: boolean;
  readonly pointOfSale?: number;
  readonly ticketPath: string;
}

export class ArcaContextResolver {
  private readonly configService?: ConfigService;
  private readonly now?: Date;
  private readonly options: GlobalCliOptions;

  public constructor(options: ResolveArcaContextOptions = {}) {
    this.configService = options.configService;
    this.now = options.now;
    this.options = options.options ?? {};
  }

  public resolve(): ResolvedArcaRuntime {
    const validation = this.validate();
    const cert = this.readRequiredFile(validation.certPath, 'certificado');
    const certificateNotices = inspectConfiguredCertificates(validation.config.cert, {
      activeEnvironment: validation.environment,
      activePem: cert,
      now: this.now,
    });

    return {
      certificateExpiry: certificateNotices.find((notice) => notice.environment === validation.environment),
      certificateNotices,
      config: validation.config,
      context: {
        cert,
        cuit: validation.cuit,
        key: this.readRequiredFile(validation.keyPath, 'clave privada'),
        production: validation.environment === 'produccion',
        ticketPath: validation.ticketPath,
      },
      environment: validation.environment,
      outputJson: validation.outputJson,
      outputRaw: validation.outputRaw,
      pointOfSale: validation.pointOfSale,
    };
  }

  public validate(): ArcaRuntimeValidation & { readonly config: ArcliConfig } {
    const service = this.configService ?? new ConfigService();
    const shouldCloseService = !this.configService;

    try {
      const config = service.getConfig();
      const environment = this.resolveEnvironment(config);
      const cuit = this.resolveCuit(config);
      const certPath = this.resolveCertificatePath(config, environment);
      const keyPath = this.resolveKeyPath(config, environment);
      const pointOfSale = this.resolvePointOfSale(config);
      const outputJson = this.resolveOutputJson(config);
      const outputRaw = this.resolveOutputRaw(config);
      const ticketPath = service.resolveTicketPath(config);

      // Los tickets dan acceso a ARCA como este CUIT por unas horas: carpetas de versiones viejas pasan a 0700.
      restrictFolderToOwner(dirname(service.getPath()));
      restrictFolderToOwner(ticketPath);

      this.ensurePathExists(certPath, 'certificado');
      this.ensurePathExists(keyPath, 'clave privada');

      return {
        certPath,
        config,
        cuit,
        environment,
        keyPath,
        outputJson,
        outputRaw,
        pointOfSale,
        ticketPath,
      };
    } finally {
      if (shouldCloseService) {
        service.close();
      }
    }
  }

  private readRequiredFile(filePath: string, label: string): string {
    return readPemFile(filePath, label as 'certificado' | 'clave privada');
  }

  private ensurePathExists(filePath: string, label: string): void {
    ensurePathExists(filePath, label as 'certificado' | 'clave privada');
  }

  private resolveCuit(config: ArcliConfig): number {
    const rawValue = config.cuit;

    if (!rawValue) {
      throw new ConfigurationError(
        'Falta el CUIT. Configuralo con "arcli config establecer cuit <valor>". Si querés una guía rápida, usá "arcli config revisar".',
      );
    }

    const parsedValue = Number.parseInt(rawValue, 10);

    if (!Number.isInteger(parsedValue) || rawValue.length !== 11) {
      throw new ConfigurationError(`El CUIT "${rawValue}" no es válido. Debe tener 11 digitos.`);
    }

    return parsedValue;
  }

  private resolveEnvironment(config: ArcliConfig): ArcliEnvironment {
    if (this.options.testing && this.options.produccion) {
      throw new ConfigurationError('Usá --testing o --produccion, pero no ambos a la vez.');
    }

    if (this.options.testing) {
      return 'testing';
    }

    if (this.options.produccion) {
      return 'produccion';
    }

    return config.entornoPorDefecto;
  }

  private resolveOutputJson(config: ArcliConfig): boolean {
    if (typeof this.options.json === 'boolean') {
      return this.options.json;
    }

    return config.output.jsonPorDefecto;
  }

  private resolvePointOfSale(config: ArcliConfig): number | undefined {
    return config.puntoVentaPorDefecto;
  }

  private resolveOutputRaw(config: ArcliConfig): boolean {
    if (typeof this.options.bruto === 'boolean') {
      return this.options.bruto;
    }

    return config.output.brutoPorDefecto;
  }

  private resolveCertificatePath(config: ArcliConfig, environment: ArcliEnvironment): string {
    const filePath = config.cert[environment];

    if (!filePath) {
      throw new ConfigurationError(
        `Falta la ruta del certificado para ${environment}. Configurá "cert.${environment}". Si necesitás ayuda, probá "arcli config revisar".`,
      );
    }

    return filePath;
  }

  private resolveKeyPath(config: ArcliConfig, environment: ArcliEnvironment): string {
    const filePath = config.key[environment];

    if (!filePath) {
      throw new ConfigurationError(
        `Falta la ruta de la clave privada para ${environment}. Configurá "key.${environment}". Si necesitás ayuda, probá "arcli config revisar".`,
      );
    }

    return filePath;
  }
}
