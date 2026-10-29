import { afterEach, describe, expect, it, vi } from 'vitest';

import { billingCommandSchema } from '../../../modules/billing/billing.schemas';
import type { BillingExecutionResult } from '../../../modules/billing/billing.types.internal';
import { getVoucherKindByShortcut } from '../../../modules/billing/voucher-kind-map';
import type { ArcliConfig } from '../../../modules/config/config.schemas';
import { writeTerminalOutput } from '../../../ui';
import { writePdfOutcomes } from '../../commands/billing.command.output';
import { attachPdfs } from '../../commands/billing.command.pdf';
import { offerPdf } from '../pdf.flow';
import { askText, confirm } from '../prompts';

vi.mock('../prompts', () => ({
  askText: vi.fn(),
  confirm: vi.fn(),
  isPromptCancellation: (error: unknown) => error instanceof Error && error.name === 'ExitPromptError',
}));
vi.mock('../../../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui')>()),
  writeTerminalOutput: vi.fn(),
}));
vi.mock('../../commands/billing.command.pdf', () => ({ attachPdfs: vi.fn(async ({ results }) => results) }));
vi.mock('../../commands/billing.command.output', () => ({ writePdfOutcomes: vi.fn() }));

const setValue = vi.fn();

vi.mock('../../../modules/config/config.service', () => ({
  ConfigService: class {
    public close = vi.fn();
    public setValue = setValue;
  },
}));

const askTextMock = vi.mocked(askText);
const confirmMock = vi.mocked(confirm);
const attachPdfsMock = vi.mocked(attachPdfs);

const CONFIG = {
  cert: {},
  cuit: '20123456786',
  emisor: { domicilio: 'Calle 123', inicioActividades: '20200301', razonSocial: 'Lucas Gerez' },
  entornoPorDefecto: 'testing',
  key: {},
  output: { brutoPorDefecto: false, emitirPorDefecto: false, jsonPorDefecto: false },
} satisfies ArcliConfig;

const input = billingCommandSchema.parse({
  concept: 'servicios',
  ivaCondition: 'consumidor-final',
  shortcut: 'fc',
  totalAmount: 1000,
});

const result = {
  dryRun: false,
  environment: 'testing',
  payload: {} as never,
  response: { cae: '76123456789012', status: 'aprobado' },
  voucherKind: getVoucherKindByShortcut('fc'),
} as unknown as BillingExecutionResult;

afterEach(() => {
  vi.clearAllMocks();
});

describe('offerPdf', () => {
  it('does not ask anything when the config says nunca', async () => {
    await offerPdf({ ...CONFIG, pdf: 'nunca' }, input, result);

    expect(confirmMock).not.toHaveBeenCalled();
    expect(attachPdfsMock).not.toHaveBeenCalled();
  });

  it('says the voucher was already issued when Ctrl+C cancels a PDF question', async () => {
    const cancellation = Object.assign(new Error('User force closed the prompt'), { name: 'ExitPromptError' });

    confirmMock.mockResolvedValueOnce(true);
    askTextMock.mockRejectedValueOnce(cancellation);

    await expect(offerPdf(CONFIG, input, result)).resolves.toBeUndefined();
    expect(attachPdfsMock).not.toHaveBeenCalled();
    expect(vi.mocked(writeTerminalOutput)).toHaveBeenCalledWith(expect.stringContaining('ya quedo emitido'));
  });

  it('stops when the user does not want the PDF', async () => {
    confirmMock.mockResolvedValueOnce(false);

    await offerPdf(CONFIG, input, result);

    expect(askTextMock).not.toHaveBeenCalled();
    expect(attachPdfsMock).not.toHaveBeenCalled();
  });

  it('asks the PDF-only data and generates it', async () => {
    confirmMock.mockResolvedValueOnce(true);
    askTextMock
      .mockResolvedValueOnce('Servicios de octubre')
      .mockResolvedValueOnce('Cliente SA')
      .mockResolvedValueOnce('');

    await offerPdf(CONFIG, input, result);

    expect(attachPdfsMock).toHaveBeenCalledWith({
      config: CONFIG,
      inputs: [
        expect.objectContaining({
          pdf: true,
          pdfDescription: 'Servicios de octubre',
          receiverAddress: undefined,
          receiverName: 'Cliente SA',
        }),
      ],
      interactive: true,
      results: [result],
    });
    expect(writePdfOutcomes).toHaveBeenCalled();
  });

  it('asks the missing issuer data once and saves it when the user agrees', async () => {
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    askTextMock
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('Calle 9')
      .mockResolvedValueOnce('1/03/2020');

    await offerPdf({ ...CONFIG, emisor: { razonSocial: 'Lucas Gerez' }, pdf: 'siempre' }, input, result);

    expect(setValue).toHaveBeenCalledWith('emisor.domicilio', 'Calle 9');
    expect(setValue).toHaveBeenCalledWith('emisor.inicioActividades', '1/03/2020');
    expect(attachPdfsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          emisor: { domicilio: 'Calle 9', inicioActividades: '20200301', razonSocial: 'Lucas Gerez' },
        }),
      }),
    );
  });

  it('skips vouchers without CAE', async () => {
    await offerPdf(CONFIG, input, { ...result, response: { ...result.response, cae: null } });

    expect(confirmMock).not.toHaveBeenCalled();
  });
});
