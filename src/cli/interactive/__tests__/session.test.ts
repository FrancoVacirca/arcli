import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { billingCommandSchema } from '../../../modules/billing/billing.schemas';
import { BillingService } from '../../../modules/billing/billing.service';
import type { ResolvedArcaRuntime } from '../../../services/arca/arca-context.resolver';
import { confirm } from '../prompts';
import { type InteractiveSession, previewAndEmit } from '../session';

vi.mock('../prompts', () => ({ confirm: vi.fn() }));

const confirmMock = vi.mocked(confirm);

function createSession(environment: 'produccion' | 'testing'): InteractiveSession & {
  readonly createVoucher: ReturnType<typeof vi.fn>;
} {
  const createVoucher = vi.fn(async () => ({ response: {} }) as never);
  const runtime = {
    config: { cert: {}, entornoPorDefecto: environment, key: {}, output: {} },
    context: { cuit: 20409509763 },
    environment,
    outputJson: false,
    outputRaw: false,
    pointOfSale: 3,
  } as unknown as ResolvedArcaRuntime;

  return {
    arca: {} as never,
    billingGateway: { createVoucher, getNextVoucherNumber: vi.fn(async () => 1), getQuotation: vi.fn() },
    createVoucher,
    historyGateway: { getLastNumber: vi.fn(), getVoucher: vi.fn() },
    runtime,
    service: new BillingService(),
  };
}

const input = billingCommandSchema.parse({
  concept: 'servicios',
  ivaCondition: 'consumidor-final',
  shortcut: 'fc',
  totalAmount: 1000,
});

describe('previewAndEmit', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    confirmMock.mockReset();
  });

  it('no emite si el usuario cancela', async () => {
    const session = createSession('testing');

    confirmMock.mockResolvedValueOnce(false);
    await previewAndEmit(session, input);

    expect(session.createVoucher).not.toHaveBeenCalled();
  });

  it('emite en testing con una sola confirmacion', async () => {
    const session = createSession('testing');

    confirmMock.mockResolvedValueOnce(true);
    await previewAndEmit(session, input);

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(session.createVoucher).toHaveBeenCalledTimes(1);
  });

  it('en produccion pide una segunda confirmacion antes de emitir', async () => {
    const declined = createSession('produccion');

    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await previewAndEmit(declined, input);
    expect(declined.createVoucher).not.toHaveBeenCalled();

    const accepted = createSession('produccion');

    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    await previewAndEmit(accepted, input);
    expect(accepted.createVoucher).toHaveBeenCalledTimes(1);
    expect(confirmMock).toHaveBeenLastCalledWith(expect.stringContaining('PRODUCCIÓN'), 'Sí, emitir en producción');
  });

  it('muestra el comando equivalente antes de confirmar', async () => {
    const session = createSession('testing');
    const write = vi.mocked(process.stdout.write);

    confirmMock.mockResolvedValueOnce(false);
    await previewAndEmit(session, input);

    expect(write.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain(
      'arcli fc -m 1000 --cs --consumidor-final --ir consumidor-final --testing --emitir',
    );
  });
});
