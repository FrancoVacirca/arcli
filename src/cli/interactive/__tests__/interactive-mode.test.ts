import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CERTIFICATE_GUIDE_URL } from '../../../lib/links';
import { CertificateExpiredError, type CertificateExpiryNotice } from '../../../modules/config/certificate-expiry';
import { listMissingSetupKeys } from '../../../modules/interactive/config-fields';
import { checkArcaHealth } from '../../../modules/parameters/health';
import { checkForUpdate } from '../../../modules/update-check/update-check.service';
import { stripAnsi } from '../../../ui';
import { CLI_VERSION } from '../../version';
import { runConfigMenu, runGuidedSetup } from '../config.flow';
import { runHistoryFlow } from '../history.flow';
import { runInteractiveMode } from '../interactive-mode';
import { runInvoiceFlow } from '../invoice.flow';
import { chooseOne, confirm } from '../prompts';
import { runRepeatFlow } from '../repeat.flow';
import { createInteractiveSession } from '../session';
import { runUpdateFlow } from '../update.flow';

vi.mock('../prompts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../prompts')>()),
  chooseOne: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('../../../modules/interactive/config-fields', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../modules/interactive/config-fields')>()),
  listMissingSetupKeys: vi.fn(() => []),
}));
vi.mock('../../../modules/config/config.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../modules/config/config.service')>()),
  ConfigService: class {
    public close(): void {}
    public ensureInitialized(): void {}
    public getConfig(): object {
      return {};
    }
  },
}));
vi.mock('../config.flow', () => ({ runConfigMenu: vi.fn(), runGuidedSetup: vi.fn() }));
vi.mock('../repeat.flow', () => ({ runRepeatFlow: vi.fn() }));
vi.mock('../status.flow', () => ({ runStatusFlow: vi.fn() }));
vi.mock('../invoice.flow', () => ({ runInvoiceFlow: vi.fn() }));
vi.mock('../note.flow', () => ({ runNoteFlow: vi.fn() }));
vi.mock('../history.flow', () => ({ runHistoryFlow: vi.fn() }));
vi.mock('../update.flow', () => ({ runUpdateFlow: vi.fn() }));
vi.mock('../../../modules/parameters/health', () => ({ checkArcaHealth: vi.fn(async () => 'funcionando') }));
vi.mock('../../../modules/update-check/update-check.service', () => ({ checkForUpdate: vi.fn(async () => null) }));
const runtime = {
  certificateNotices: [],
  config: {},
  context: { cuit: 20409509763 },
  environment: 'testing',
  pointOfSale: 3,
};

vi.mock('../session', () => ({
  createInteractiveSession: vi.fn(() => ({ runtime })),
}));

const chooseOneMock = vi.mocked(chooseOne);

function certificateNotice(expired: boolean): CertificateExpiryNotice {
  const summary = expired
    ? 'El certificado de produccion venció el 20/11/2026.'
    : 'El certificado de produccion vence el 20/11/2026 (en 10 días).';

  return {
    daysRemaining: expired ? -1 : 10,
    environment: 'produccion',
    expired,
    expiresOn: '20/11/2026',
    message: `${summary} Renovalo: ${CERTIFICATE_GUIDE_URL}`,
    summary,
  };
}
const cancellation = () => Object.assign(new Error('cancelado'), { name: 'ExitPromptError' });

describe('runInteractiveMode', () => {
  let output = '';

  beforeEach(() => {
    output = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('muestra la barra de estado y sale con "Salir"', async () => {
    chooseOneMock.mockResolvedValueOnce('salir');

    await runInteractiveMode();

    expect(output).toContain('ARCA FUNCIONANDO');
    expect(stripAnsi(output)).toMatch(/━━ 20-40950976-3 · PV 3 ━+ ARCA FUNCIONANDO ━ TESTING ━━/);
    expect(stripAnsi(output)).toContain(`v${CLI_VERSION}`);
    expect(output).toContain('¡Hasta la proxima!');
  });

  it('con razon social configurada, la barra la muestra en lugar del CUIT', async () => {
    vi.mocked(createInteractiveSession).mockReturnValueOnce({
      runtime: { ...runtime, config: { emisor: { razonSocial: 'GZSOFT SRL' } } },
    } as never);
    chooseOneMock.mockResolvedValueOnce('salir');

    await runInteractiveMode();

    expect(stripAnsi(output)).toContain('━━ GZSOFT SRL · PV 3 ━');
  });

  it('shows a certificate box right below the status bar when the certificate is about to expire', async () => {
    vi.mocked(createInteractiveSession).mockReturnValueOnce({
      runtime: {
        ...runtime,
        certificateExpiry: certificateNotice(false),
        certificateNotices: [certificateNotice(false)],
        environment: 'produccion',
      },
    } as never);
    chooseOneMock.mockResolvedValueOnce('salir');

    await runInteractiveMode();

    const plain = stripAnsi(output);
    const barIndex = plain.search(/━━ 20-40950976-3 · PV 3 ━+ ARCA FUNCIONANDO ━ PRODUCCION ━━/);
    const boxIndex = plain.indexOf('El certificado de produccion vence el 20/11/2026 (en 10 días).');

    expect(barIndex).toBeGreaterThanOrEqual(0);
    expect(boxIndex).toBeGreaterThan(barIndex);
    expect(plain).toContain(`Renovalo: ${CERTIFICATE_GUIDE_URL}`);
    expect(plain.slice(barIndex, boxIndex)).toMatch(/┌/);
  });

  it('shows the production certificate box while working in testing', async () => {
    vi.mocked(createInteractiveSession).mockReturnValueOnce({
      runtime: { ...runtime, certificateNotices: [certificateNotice(false)] },
    } as never);
    chooseOneMock.mockResolvedValueOnce('salir');

    await runInteractiveMode();

    const plain = stripAnsi(output);

    expect(plain).toMatch(/━━ 20-40950976-3 · PV 3 ━+ ARCA FUNCIONANDO ━ TESTING ━━/);
    expect(plain).toContain('El certificado de produccion vence el 20/11/2026 (en 10 días).');
  });

  it('shows no certificate box when the certificate is fine', async () => {
    chooseOneMock.mockResolvedValueOnce('salir');

    await runInteractiveMode();

    expect(output).not.toContain('El certificado');
  });

  it('with an expired certificate, skips ARCA and explains it in the header', async () => {
    vi.mocked(createInteractiveSession).mockImplementationOnce(() => {
      throw new CertificateExpiredError(certificateNotice(true));
    });
    chooseOneMock.mockResolvedValueOnce('salir');

    await runInteractiveMode();

    const plain = stripAnsi(output);

    expect(checkArcaHealth).not.toHaveBeenCalled();
    expect(plain).toMatch(/━━ certificado vencido ━+ ARCA SIN VERIFICAR ━ PRODUCCION ━━/);
    expect(plain).toContain('El certificado de produccion venció el 20/11/2026.');
    expect(plain).toContain(`Renovalo: ${CERTIFICATE_GUIDE_URL}`);
  });

  it('la barra muestra si ARCA anda con demoras', async () => {
    vi.mocked(checkArcaHealth).mockResolvedValueOnce('con-demoras');
    chooseOneMock.mockResolvedValueOnce('salir');

    await runInteractiveMode();

    expect(output).toContain('ARCA CON DEMORAS');
  });

  it('sin version nueva no ofrece actualizar', async () => {
    chooseOneMock.mockResolvedValueOnce('salir');

    await runInteractiveMode();

    expect(chooseOneMock.mock.calls[0][1]).not.toContainEqual(expect.objectContaining({ value: 'actualizar' }));
  });

  it('con version nueva, actualizar es la primera opcion y "Cerrar para actualizar" sale', async () => {
    vi.mocked(checkForUpdate).mockResolvedValueOnce({ currentVersion: '1.8.0', latestVersion: '1.9.0' });
    vi.mocked(runUpdateFlow).mockResolvedValueOnce(true);
    chooseOneMock.mockResolvedValueOnce('actualizar');

    await runInteractiveMode();

    expect(chooseOneMock.mock.calls[0][1][0]).toMatchObject({
      short: 'Actualizar a la version 1.9.0',
      value: 'actualizar',
    });
    expect(runUpdateFlow).toHaveBeenCalledWith({ currentVersion: '1.8.0', latestVersion: '1.9.0' });
    expect(chooseOneMock).toHaveBeenCalledTimes(1);
    expect(output).not.toContain('¡Hasta la proxima!');
  });

  it('"Volver" en actualizar vuelve al menu', async () => {
    vi.mocked(checkForUpdate).mockResolvedValueOnce({ currentVersion: '1.8.0', latestVersion: '1.9.0' });
    vi.mocked(runUpdateFlow).mockResolvedValueOnce(false);
    chooseOneMock.mockResolvedValueOnce('actualizar').mockResolvedValueOnce('salir');

    await runInteractiveMode();

    expect(chooseOneMock).toHaveBeenCalledTimes(2);
  });

  it('corre el flujo elegido y vuelve al menu', async () => {
    chooseOneMock.mockResolvedValueOnce('factura').mockResolvedValueOnce('historial').mockResolvedValueOnce('salir');

    await runInteractiveMode();

    expect(runInvoiceFlow).toHaveBeenCalledTimes(1);
    expect(runHistoryFlow).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+C dentro de un flujo cancela y vuelve al menu', async () => {
    vi.mocked(runInvoiceFlow).mockRejectedValueOnce(cancellation());
    chooseOneMock.mockResolvedValueOnce('factura').mockResolvedValueOnce('salir');

    await runInteractiveMode();

    expect(output).toContain('Cancelado. No se emitio nada.');
  });

  it('un error en un flujo se muestra y el menu sigue', async () => {
    vi.mocked(runInvoiceFlow).mockRejectedValueOnce(new Error('ARCA no responde'));
    chooseOneMock.mockResolvedValueOnce('factura').mockResolvedValueOnce('salir');

    await runInteractiveMode();

    expect(output).toContain('ARCA no responde');
    expect(chooseOneMock).toHaveBeenCalledTimes(2);
  });

  it('Ctrl+C en el menu sale', async () => {
    chooseOneMock.mockRejectedValueOnce(cancellation());

    await runInteractiveMode();

    expect(output).toContain('¡Hasta la proxima!');
  });

  it('ofrece la configuracion guiada si falta algo obligatorio', async () => {
    vi.mocked(listMissingSetupKeys).mockReturnValueOnce(['cuit']);
    vi.mocked(confirm).mockResolvedValueOnce(true);
    chooseOneMock.mockResolvedValueOnce('salir');

    await runInteractiveMode();

    expect(runGuidedSetup).toHaveBeenCalledTimes(1);
  });

  it('no ofrece la guia si la configuracion esta completa', async () => {
    chooseOneMock.mockResolvedValueOnce('salir');

    await runInteractiveMode();

    expect(confirm).not.toHaveBeenCalled();
  });

  it('abre configuracion y repetir factura desde el menu', async () => {
    chooseOneMock.mockResolvedValueOnce('config').mockResolvedValueOnce('repetir').mockResolvedValueOnce('salir');

    await runInteractiveMode();

    expect(runConfigMenu).toHaveBeenCalledTimes(1);
    expect(runRepeatFlow).toHaveBeenCalledTimes(1);
  });
});
