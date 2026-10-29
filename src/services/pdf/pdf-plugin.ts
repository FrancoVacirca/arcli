import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { PDF_INSTALL_SUGGESTION, PdfError } from '../../modules/pdf/pdf.errors';
import type { InvoicePdfData, InvoicePdfOptions } from '../../modules/pdf/pdf.types';

import { findDownloadedBrowser, findSystemBrowser } from './pdf-browser';

export const PDF_PLUGIN_PACKAGE = '@arcasdk/pdf';
/** Version probada con arcli. Se sube a mano despues de revisar los PDFs que genera. */
export const PDF_PLUGIN_VERSION = '0.2.1';

export type PdfBrowserSource = 'config' | 'descargado' | 'entorno' | 'sistema';

export interface PdfPluginStatus {
  readonly browser?: string;
  readonly browserSource?: PdfBrowserSource;
  readonly installed: boolean;
  /** Version instalada, aunque no sea la que espera arcli. */
  readonly installedVersion?: string;
  readonly path: string;
  readonly version: string;
}

export interface ProcessResult {
  readonly code: number | null;
  readonly output: string;
  /** Se corto por `timeoutMs`. */
  readonly timedOut?: boolean;
}

export type ProcessRunner = (
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly timeoutMs: number },
) => Promise<ProcessResult>;

/** Limites de la instalacion: con un proxy colgado, npm o la descarga no terminan nunca. */
export const NPM_INSTALL_TIMEOUT_MS = 5 * 60_000;
export const BROWSER_DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

export interface PdfRenderer {
  render(data: InvoicePdfData, options: InvoicePdfOptions): Promise<Uint8Array>;
}

interface InvoicePdfGeneratorModule {
  readonly InvoicePdfGenerator: new (options?: InvoicePdfOptions) => {
    generate(data: InvoicePdfData): Promise<Uint8Array>;
  };
}

export interface PdfPluginOptions {
  /** Ruta de `pdfNavegador` en la config. */
  readonly configuredBrowser?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly findSystemBrowser?: () => string | undefined;
  /** Carpeta del plugin: `<carpeta de config>/plugins/pdf`. */
  readonly path: string;
  readonly runProcess?: ProcessRunner;
}

export const runProcessWithSpawn: ProcessRunner = (command, args, options) =>
  new Promise((resolve) => {
    // En Windows npm es un .cmd y necesita shell.
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: process.platform === 'win32' });
    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      // Con shell, el kill no llega a los nietos y sus pipes mantendrian vivo el proceso: se sueltan.
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      resolve({ code: null, output, timedOut: true });
    }, options.timeoutMs);
    const finish = (result: ProcessResult) => {
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', (error) => finish({ code: 1, output: `${output}${error.message}` }));
    child.on('close', (code) => finish({ code, output }));
  });

function describeTimeout(timeoutMs: number): string {
  return `no termino en ${timeoutMs / 60_000} minutos y se corto`;
}

function lastLines(output: string, count = 5): string {
  return output.trim().split('\n').slice(-count).join('\n');
}

export class PdfPlugin {
  private readonly env: NodeJS.ProcessEnv;
  private readonly findSystemBrowser: () => string | undefined;
  private readonly runProcess: ProcessRunner;

  public constructor(private readonly options: PdfPluginOptions) {
    this.env = options.env ?? process.env;
    this.findSystemBrowser = options.findSystemBrowser ?? (() => findSystemBrowser());
    this.runProcess = options.runProcess ?? runProcessWithSpawn;
  }

  private get browsersPath(): string {
    return join(this.options.path, 'browsers');
  }

  private readInstalledVersion(): string | undefined {
    const manifest = join(this.options.path, 'node_modules', ...PDF_PLUGIN_PACKAGE.split('/'), 'package.json');

    if (!existsSync(manifest)) {
      return undefined;
    }

    return (JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string }).version;
  }

  /** Orden: config, variable de entorno de Puppeteer, navegador del sistema y, por ultimo, el descargado. */
  private resolveBrowser(): { readonly path: string; readonly source: PdfBrowserSource } | undefined {
    if (this.options.configuredBrowser) {
      return { path: this.options.configuredBrowser, source: 'config' };
    }

    if (this.env.PUPPETEER_EXECUTABLE_PATH) {
      return { path: this.env.PUPPETEER_EXECUTABLE_PATH, source: 'entorno' };
    }

    const system = this.findSystemBrowser();

    if (system) {
      return { path: system, source: 'sistema' };
    }

    const downloaded = findDownloadedBrowser(this.browsersPath);

    return downloaded ? { path: downloaded, source: 'descargado' } : undefined;
  }

  public getStatus(): PdfPluginStatus {
    const installedVersion = this.readInstalledVersion();
    const browser = this.resolveBrowser();

    return {
      browser: browser?.path,
      browserSource: browser?.source,
      installed: installedVersion === PDF_PLUGIN_VERSION && Boolean(browser),
      installedVersion,
      path: this.options.path,
      version: PDF_PLUGIN_VERSION,
    };
  }

  /** Instala el paquete y, si no hay un navegador para usar, descarga chrome-headless-shell. */
  public async install(onStep: (message: string) => void = () => undefined): Promise<PdfPluginStatus> {
    mkdirSync(this.options.path, { recursive: true });

    const manifest = join(this.options.path, 'package.json');

    if (!existsSync(manifest)) {
      writeFileSync(manifest, `${JSON.stringify({ description: 'Plugin de PDF de arcli', private: true }, null, 2)}\n`);
    }

    if (this.readInstalledVersion() !== PDF_PLUGIN_VERSION) {
      onStep(`Descargando ${PDF_PLUGIN_PACKAGE}@${PDF_PLUGIN_VERSION}...`);

      // --ignore-scripts: npm 12 ya los bloquea; asi se comporta igual con cualquier version y el navegador lo
      // resolvemos nosotros.
      const result = await this.runProcess(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        [
          'install',
          `${PDF_PLUGIN_PACKAGE}@${PDF_PLUGIN_VERSION}`,
          '--omit=dev',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--save-exact',
        ],
        { cwd: this.options.path, env: this.env, timeoutMs: NPM_INSTALL_TIMEOUT_MS },
      );

      if (result.code !== 0) {
        const message = result.timedOut
          ? `La instalacion de ${PDF_PLUGIN_PACKAGE} ${describeTimeout(NPM_INSTALL_TIMEOUT_MS)}.`
          : `npm no pudo instalar ${PDF_PLUGIN_PACKAGE}.`;

        throw new PdfError('PDF_PLUGIN_INSTALL_ERROR', message, {
          details: { salida: lastLines(result.output) },
          suggestion: 'Revise la conexion a internet o el proxy de npm y vuelva a correr `arcli pdf instalar`.',
        });
      }
    }

    if (!this.resolveBrowser()) {
      onStep('Descargando el navegador para generar PDFs (unos 200 MB)...');

      const require = createRequire(join(this.options.path, 'package.json'));
      const puppeteerCli = join(require.resolve('puppeteer/package.json'), '..', 'lib', 'puppeteer', 'node', 'cli.js');
      const result = await this.runProcess(
        process.execPath,
        [puppeteerCli, 'browsers', 'install', 'chrome-headless-shell'],
        {
          cwd: this.options.path,
          env: { ...this.env, PUPPETEER_CACHE_DIR: this.browsersPath },
          timeoutMs: BROWSER_DOWNLOAD_TIMEOUT_MS,
        },
      );

      if (result.code !== 0 || !findDownloadedBrowser(this.browsersPath)) {
        const message = result.timedOut
          ? `La descarga del navegador para generar PDFs ${describeTimeout(BROWSER_DOWNLOAD_TIMEOUT_MS)}.`
          : 'No se pudo descargar el navegador para generar PDFs.';

        throw new PdfError('PDF_PLUGIN_INSTALL_ERROR', message, {
          details: { salida: lastLines(result.output) },
          suggestion:
            'Si ya tiene Chrome, Chromium o Edge, indique su ruta con `arcli config establecer pdfNavegador <ruta>`.',
        });
      }
    }

    return this.getStatus();
  }

  public uninstall(): void {
    rmSync(this.options.path, { force: true, recursive: true });
  }

  public load(): PdfRenderer {
    const installedVersion = this.readInstalledVersion();

    if (installedVersion !== PDF_PLUGIN_VERSION) {
      throw new PdfError(
        'PDF_PLUGIN_MISSING',
        installedVersion
          ? `El plugin de PDF esta en la version ${installedVersion} y arcli usa la ${PDF_PLUGIN_VERSION}.`
          : 'Para generar PDFs falta instalar el plugin de PDF.',
        { suggestion: PDF_INSTALL_SUGGESTION },
      );
    }

    const browser = this.resolveBrowser();

    if (!browser) {
      throw new PdfError('PDF_PLUGIN_MISSING', 'No se encontro un navegador para generar PDFs.', {
        suggestion: `${PDF_INSTALL_SUGGESTION} Descarga uno, o indique Chrome con \`arcli config establecer pdfNavegador <ruta>\`.`,
      });
    }

    // El SDK no deja elegir el ejecutable; Puppeteer lo toma de esta variable.
    process.env.PUPPETEER_EXECUTABLE_PATH = browser.path;

    const require = createRequire(join(this.options.path, 'package.json'));
    const sdk = require(PDF_PLUGIN_PACKAGE) as InvoicePdfGeneratorModule;

    return {
      render: async (data, options) => {
        try {
          return await new sdk.InvoicePdfGenerator(options).generate(data);
        } catch (error) {
          throw new PdfError(
            'PDF_GENERATION_ERROR',
            `No se pudo generar el PDF: ${error instanceof Error ? error.message : String(error)}`,
            { suggestion: 'Si el navegador falla, pruebe con otro: `arcli config establecer pdfNavegador <ruta>`.' },
          );
        }
      },
    };
  }
}
