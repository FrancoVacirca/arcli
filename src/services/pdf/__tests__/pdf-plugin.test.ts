import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BillingExecutionResult } from '../../../modules/billing/billing.types.internal';
import { getVoucherKindByShortcut } from '../../../modules/billing/voucher-kind-map';
import { findDownloadedBrowser } from '../pdf-browser';
import { exportBillingPdf, TESTING_FOOTER, toPdfFailure } from '../pdf-exporter';
import { PDF_PLUGIN_VERSION, PdfPlugin, type ProcessRunner } from '../pdf-plugin';

const temporaryDirectories: string[] = [];

function createTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'arcli-pdf-plugin-'));

  temporaryDirectories.push(directory);

  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

/** Simula lo que deja `npm install` en la carpeta del plugin. */
function fakeNpmInstall(root: string, version = PDF_PLUGIN_VERSION): void {
  const sdk = join(root, 'node_modules', '@arcasdk', 'pdf');
  const puppeteer = join(root, 'node_modules', 'puppeteer');

  mkdirSync(sdk, { recursive: true });
  mkdirSync(puppeteer, { recursive: true });
  writeFileSync(join(sdk, 'package.json'), JSON.stringify({ main: 'index.js', name: '@arcasdk/pdf', version }));
  writeFileSync(
    join(sdk, 'index.js'),
    'exports.InvoicePdfGenerator = class { constructor(o) { this.o = o; } async generate(d) { return Buffer.from(JSON.stringify({ d, o: this.o })); } };',
  );
  writeFileSync(join(puppeteer, 'package.json'), JSON.stringify({ name: 'puppeteer', version: '25.0.0' }));
}

function fakeBrowserDownload(cacheDir: string): void {
  const folder = join(cacheDir, 'chrome-headless-shell', 'mac_arm-1', 'chrome-headless-shell-mac-arm64');

  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell'), '');
}

describe('PdfPlugin', () => {
  it('reports missing until the package and a browser are there', () => {
    const path = join(createTempDir(), 'pdf');
    const plugin = new PdfPlugin({ env: {}, findSystemBrowser: () => undefined, path });

    expect(plugin.getStatus()).toMatchObject({ installed: false, version: PDF_PLUGIN_VERSION });
    expect(() => plugin.load()).toThrow(/falta instalar el plugin/);

    fakeNpmInstall(path);

    expect(plugin.getStatus().installed).toBe(false);
    expect(() => plugin.load()).toThrow(/No se encontro un navegador/);
  });

  it('installs with npm ignoring scripts and skips the browser download when the system has one', async () => {
    const path = join(createTempDir(), 'pdf');
    const runProcess = vi.fn<ProcessRunner>(async (_command, _args, options) => {
      fakeNpmInstall(options.cwd);

      return { code: 0, output: '' };
    });
    const plugin = new PdfPlugin({ env: {}, findSystemBrowser: () => '/Applications/Chrome', path, runProcess });

    const status = await plugin.install();

    expect(runProcess).toHaveBeenCalledTimes(1);
    expect(runProcess.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['--ignore-scripts', `@arcasdk/pdf@${PDF_PLUGIN_VERSION}`]),
    );
    expect(JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))).toMatchObject({ private: true });
    expect(status).toMatchObject({ browser: '/Applications/Chrome', browserSource: 'sistema', installed: true });
  });

  it('downloads chrome-headless-shell into the plugin folder when there is no browser', async () => {
    const path = join(createTempDir(), 'pdf');
    const runProcess = vi.fn<ProcessRunner>(async (_command, args, options) => {
      if (args[0] === 'install') {
        fakeNpmInstall(options.cwd);
      } else {
        fakeBrowserDownload(options.env.PUPPETEER_CACHE_DIR ?? '');
      }

      return { code: 0, output: '' };
    });
    const plugin = new PdfPlugin({ env: {}, findSystemBrowser: () => undefined, path, runProcess });

    const status = await plugin.install();

    expect(runProcess).toHaveBeenCalledTimes(2);
    expect(runProcess.mock.calls[1][1]).toEqual(
      expect.arrayContaining(['browsers', 'install', 'chrome-headless-shell']),
    );
    expect(status).toMatchObject({ browserSource: 'descargado', installed: true });
    expect(findDownloadedBrowser(join(path, 'browsers'))).toBeDefined();
  });

  it('turns an npm failure into PDF_PLUGIN_INSTALL_ERROR with the last lines of output', async () => {
    const plugin = new PdfPlugin({
      env: {},
      findSystemBrowser: () => undefined,
      path: join(createTempDir(), 'pdf'),
      runProcess: async () => ({ code: 1, output: 'npm error code ECONNREFUSED' }),
    });

    await expect(plugin.install()).rejects.toMatchObject({
      code: 'PDF_PLUGIN_INSTALL_ERROR',
      details: { salida: 'npm error code ECONNREFUSED' },
    });
  });

  it('treats another installed version as missing', () => {
    const path = join(createTempDir(), 'pdf');

    fakeNpmInstall(path, '0.1.0');

    const plugin = new PdfPlugin({ env: {}, findSystemBrowser: () => '/chrome', path });

    expect(plugin.getStatus()).toMatchObject({ installed: false, installedVersion: '0.1.0' });
    expect(() => plugin.load()).toThrow(/version 0.1.0/);
  });

  it('prefers the configured browser and removes everything on uninstall', () => {
    const path = join(createTempDir(), 'pdf');

    fakeNpmInstall(path);

    const plugin = new PdfPlugin({
      configuredBrowser: '/mi/chrome',
      env: {},
      findSystemBrowser: () => '/chrome',
      path,
    });

    expect(plugin.getStatus()).toMatchObject({ browser: '/mi/chrome', browserSource: 'config' });

    plugin.uninstall();

    expect(existsSync(path)).toBe(false);
  });
});

describe('exportBillingPdf', () => {
  const voucherKind = getVoucherKindByShortcut('fc');

  function createResult(environment: 'produccion' | 'testing'): BillingExecutionResult {
    if (!voucherKind) {
      throw new Error('fc');
    }

    return {
      dryRun: false,
      environment,
      payload: {
        CantReg: 1,
        CbteFch: '20261003',
        CbteTipo: 11,
        Concepto: 2,
        CondicionIVAReceptorId: 5,
        DocNro: 0,
        DocTipo: 99,
        ImpIVA: 0,
        ImpNeto: 1000,
        ImpOpEx: 0,
        ImpTotConc: 0,
        ImpTotal: 1000,
        ImpTrib: 0,
        MonCotiz: 1,
        MonId: 'PES',
        PtoVta: 3,
      },
      response: {
        cae: '76123456789012',
        caeVencimiento: '20261013',
        errors: [],
        events: [],
        observaciones: [],
        observacion: null,
        raw: { cae: '1', caeFchVto: '1', response: { FeDetResp: { FECAEDetResponse: [{ CbteDesde: 125 }] } } },
        resultado: 'A',
        suggestions: [],
        status: 'aprobado',
      },
      voucherKind,
    };
  }

  const config = {
    cuit: '20123456789',
    emisor: { domicilio: 'Calle 123', inicioActividades: '20200301', razonSocial: 'Lucas Gerez' },
  };

  it('writes testing PDFs to a subfolder with the testing footer', async () => {
    const folder = createTempDir();
    const render = vi.fn(async () => new Uint8Array([1, 2, 3]));

    const path = await exportBillingPdf({ config, folder, renderer: { render }, result: createResult('testing') });

    expect(path).toBe(join(folder, 'testing', 'factura-c_0003-00000125.pdf'));
    expect(readFileSync(path)).toEqual(Buffer.from([1, 2, 3]));
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ cbteDesde: 125 }), {
      footerText: TESTING_FOOTER,
      logo: undefined,
    });
  });

  it('escapes HTML in every text before rendering, because the plugin template does not', async () => {
    const render = vi.fn(async () => new Uint8Array([1]));

    await exportBillingPdf({
      config: { ...config, emisor: { ...config.emisor, razonSocial: 'Gerez & Hijos' } },
      extras: { descripcion: '<img src=x onerror=alert(1)>', receptorNombre: 'Cliente "SA"' },
      folder: createTempDir(),
      renderer: { render },
      result: createResult('produccion'),
    });

    const [data] = render.mock.calls[0] as unknown as [
      { emisor: { razonSocial: string }; items: Array<{ descripcion: string }>; receptor: { razonSocial: string } },
    ];

    expect(data.emisor.razonSocial).toBe('Gerez &amp; Hijos');
    expect(data.items[0]?.descripcion).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(data.receptor.razonSocial).toBe('Cliente &quot;SA&quot;');
    expect(JSON.stringify(data)).not.toMatch(/[<>]/);
  });

  it('writes production PDFs to the folder itself with the logo as data URL', async () => {
    const folder = createTempDir();
    const logo = join(folder, 'logo.png');

    writeFileSync(logo, 'png');

    const render = vi.fn(async () => new Uint8Array([1]));
    const path = await exportBillingPdf({
      config: { ...config, emisor: { ...config.emisor, logo } },
      folder,
      renderer: { render },
      result: createResult('produccion'),
    });

    expect(path).toBe(join(folder, 'factura-c_0003-00000125.pdf'));
    expect(render).toHaveBeenCalledWith(expect.anything(), {
      footerText: undefined,
      logo: `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
    });
  });

  it('loads the installed SDK and renders through it', async () => {
    const path = join(createTempDir(), 'pdf');

    fakeNpmInstall(path);

    const renderer = new PdfPlugin({ env: {}, findSystemBrowser: () => '/chrome', path }).load();
    const bytes = await renderer.render({ cbteDesde: 1 } as never, { footerText: 'x' });

    expect(JSON.parse(Buffer.from(bytes).toString())).toEqual({ d: { cbteDesde: 1 }, o: { footerText: 'x' } });
    expect(process.env.PUPPETEER_EXECUTABLE_PATH).toBe('/chrome');

    delete process.env.PUPPETEER_EXECUTABLE_PATH;
  });

  it('describes failures for the output', () => {
    expect(toPdfFailure(new Error('boom'))).toEqual({ error: { code: 'PDF_GENERATION_ERROR', message: 'boom' } });
  });
});
