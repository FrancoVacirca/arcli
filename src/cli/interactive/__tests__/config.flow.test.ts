import { Separator } from '@inquirer/select';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BACK } from '../../../modules/interactive/wizard';
import { stripAnsi } from '../../../ui';
import { runConfigMenu, runGuidedSetup } from '../config.flow';
import { askTextStep, chooseOne, chooseStep, confirm } from '../prompts';

import { onlyChoices } from './script';

vi.mock('../prompts', () => ({
  askTextStep: vi.fn(),
  chooseOne: vi.fn(),
  chooseStep: vi.fn(),
  confirm: vi.fn(),
  fitPageSize: () => 12,
}));

const store: Record<string, string> = {};
const install = vi.fn(async () => ({ installed: true }));
const uninstall = vi.fn();

vi.mock('../../../modules/config/config.service', () => ({
  ConfigService: class {
    public close() {}
    public ensureInitialized() {}
    public getConfig() {
      return {
        cert: { testing: store['cert.testing'] },
        conceptoPorDefecto: store.concepto,
        cuit: store.cuit,
        emisor: { razonSocial: store['emisor.razonSocial'] },
        entornoPorDefecto: 'testing',
        ivaReceptorPorDefecto: store.ivaReceptor,
        key: { testing: store['key.testing'] },
        output: {},
        puntoVentaPorDefecto: store.puntoVenta ? Number(store.puntoVenta) : undefined,
      };
    }
    public getPluginsPath() {
      return '/tmp/plugins';
    }
    public resolvePaths() {
      return { pdfFolder: '/tmp/pdf', ticketPath: '/tmp/tickets' };
    }
    public setValue(key: string, value: string) {
      store[key] = value;
    }
    public unsetValue(key: string) {
      delete store[key];
    }
  },
  // La validacion real lee los PEM; aca solo se rechaza un CUIT mal formado.
  validateConfigValue: (key: string, value: string) => {
    if (key === 'cuit' && !/^\d{11}$/.test(value)) {
      throw new Error('El CUIT debe tener 11 digitos');
    }
  },
}));
vi.mock('../../../services/pdf/pdf-plugin', () => ({
  PdfPlugin: class {
    public getStatus() {
      return { installed: false, path: '/tmp/plugins/pdf', version: '0.2.1' };
    }
    public install = install;
    public uninstall = uninstall;
  },
}));
vi.mock('../../spinner', () => ({ startSpinner: () => null }));

const askTextMock = vi.mocked(askTextStep);
const chooseStepMock = vi.mocked(chooseStep);

beforeEach(() => {
  for (const key of Object.keys(store)) {
    delete store[key];
  }

  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('runGuidedSetup', () => {
  it('pide lo obligatorio, los defaults y opcionalmente los datos del PDF, y guarda cada respuesta', async () => {
    askTextMock
      .mockResolvedValueOnce('20123456786')
      .mockResolvedValueOnce('/certs/testing.crt')
      .mockResolvedValueOnce('/certs/testing.key')
      .mockResolvedValueOnce('3')
      .mockResolvedValueOnce('Ana Gomez')
      .mockResolvedValueOnce('Calle 123')
      .mockResolvedValueOnce('1/03/2020')
      .mockResolvedValueOnce('Exento');
    chooseStepMock.mockResolvedValueOnce('servicios').mockResolvedValueOnce('consumidor-final');
    vi.mocked(confirm).mockResolvedValueOnce(true);

    await runGuidedSetup();

    expect(store).toMatchObject({
      'cert.testing': '/certs/testing.crt',
      concepto: 'servicios',
      cuit: '20123456786',
      'emisor.domicilio': 'Calle 123',
      'emisor.iibb': 'Exento',
      'emisor.inicioActividades': '1/03/2020',
      'emisor.razonSocial': 'Ana Gomez',
      ivaReceptor: 'consumidor-final',
      'key.testing': '/certs/testing.key',
      puntoVenta: '3',
    });
  });

  it('valida con las mismas reglas que config establecer y no deja vacio lo obligatorio', async () => {
    askTextMock.mockImplementationOnce(async (_message, options) => {
      expect(options?.validate?.('123')).toMatch(/11 digitos/);
      expect(options?.validate?.('')).toMatch(/obligatorio/);

      return BACK;
    });

    await runGuidedSetup();

    expect(store).toEqual({});
  });
});

describe('runConfigMenu', () => {
  it('cambia un dato de una lista de opciones', async () => {
    vi.mocked(chooseOne).mockResolvedValueOnce('cambiar').mockResolvedValueOnce('volver');
    chooseStepMock
      .mockImplementationOnce(
        async (_message, choices) => onlyChoices(choices).find((choice) => choice.name === 'Concepto')?.value,
      )
      .mockResolvedValueOnce('productos')
      // Despues de guardar vuelve a la lista; "Volver" sale.
      .mockResolvedValueOnce(BACK);

    await runConfigMenu();

    expect(store.concepto).toBe('productos');

    // Los datos van agrupados: un titulo por seccion, en orden.
    const headers = (chooseStepMock.mock.calls[0]?.[1] ?? [])
      .filter((item) => Separator.isSeparator(item) && item.separator.trim())
      .map((item) => stripAnsi((item as Separator).separator));

    expect(headers).toEqual([
      'Cuenta',
      'Certificados',
      'Al facturar',
      'Factura de crédito electrónica (FCE)',
      'Datos del emisor (PDF)',
      'PDF',
      'Salida y listados',
    ]);
  });

  it('muestra toda la configuracion', async () => {
    store.cuit = '20333333334';
    vi.mocked(chooseOne).mockResolvedValueOnce('ver').mockResolvedValueOnce('volver');

    let printed = '';

    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      printed += String(chunk);
      return true;
    });

    await runConfigMenu();

    expect(stripAnsi(printed)).toContain('20333333334');
    expect(stripAnsi(printed)).toContain('Comprobantes por lista');
  });

  it('borra un dato de texto con "-"', async () => {
    store['emisor.razonSocial'] = 'Viejo';
    vi.mocked(chooseOne).mockResolvedValueOnce('cambiar').mockResolvedValueOnce('volver');
    chooseStepMock
      .mockImplementationOnce(
        async (_message, choices) => onlyChoices(choices).find((choice) => choice.name === 'Razón social')?.value,
      )
      .mockResolvedValueOnce(BACK);
    askTextMock.mockImplementationOnce(async (message, options) => {
      expect(message).toContain('"-" para borrar');
      expect(options?.defaultValue).toBe('Viejo');

      return '-';
    });

    await runConfigMenu();

    expect(store['emisor.razonSocial']).toBeUndefined();
  });

  it('instala el plugin de PDF desde configuracion', async () => {
    vi.mocked(chooseOne).mockResolvedValueOnce('pdf').mockResolvedValueOnce('volver');
    chooseStepMock.mockResolvedValueOnce('instalar');

    await runConfigMenu();

    expect(install).toHaveBeenCalledTimes(1);
    expect(uninstall).not.toHaveBeenCalled();
  });

  it('instala y desinstala el autocompletado desde configuracion', async () => {
    const shell = process.env.SHELL;
    const rc = join(process.env.HOME ?? '', '.zshrc');

    process.env.SHELL = '/bin/zsh';

    try {
      vi.mocked(chooseOne).mockResolvedValueOnce('completado').mockResolvedValueOnce('volver');
      chooseStepMock.mockResolvedValueOnce('instalar');
      await runConfigMenu();

      expect(readFileSync(rc, 'utf8')).toContain('eval "$(arcli completado zsh)"');

      vi.mocked(chooseOne).mockResolvedValueOnce('completado').mockResolvedValueOnce('volver');
      chooseStepMock.mockResolvedValueOnce('desinstalar');
      await runConfigMenu();

      expect(readFileSync(rc, 'utf8')).not.toContain('arcli completado');
    } finally {
      process.env.SHELL = shell;
    }
  });
});
