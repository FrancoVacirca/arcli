import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BillingCommandInput } from '../../../modules/billing/billing.schemas';
import { BillingService } from '../../../modules/billing/billing.service';
import type { ResolvedArcaRuntime } from '../../../services/arca/arca-context.resolver';
import { runInteractiveBillingPreview } from '../billing.command.interactive-preview';

vi.mock('@inquirer/select', () => ({
  default: vi.fn(),
}));

vi.mock('../../../ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../ui')>();

  return {
    ...actual,
    writeTerminalOutput: vi.fn(),
  };
});

import select from '@inquirer/select';

import { writeTerminalOutput } from '../../../ui';

function createRuntime(overrides: Partial<ResolvedArcaRuntime> = {}): ResolvedArcaRuntime {
  return {
    certificateNotices: [],
    config: {
      cert: {},
      emisor: {},
      entornoPorDefecto: 'testing',
      key: {},
      output: {
        emitirPorDefecto: false,
        brutoPorDefecto: false,
        jsonPorDefecto: false,
      },
      puntoVentaPorDefecto: 3,
    },
    context: {
      cert: 'CERT',
      cuit: 20123456786,
      key: 'KEY',
      production: false,
    },
    environment: 'testing',
    outputJson: false,
    outputRaw: false,
    pointOfSale: 3,
    ...overrides,
  };
}

function createInput(overrides: Partial<BillingCommandInput> = {}): BillingCommandInput {
  return {
    cancellation: false,
    concept: 'servicios',
    currencyCode: 'PES',
    documentType: 'consumidor-final',
    dryRun: true,
    emit: false,
    exchangeRate: 1,
    ivaCondition: 'consumidor-final',
    sameCurrency: false,
    shortcut: 'fb',
    totalAmount: 1000,
    ...overrides,
  };
}

const originalStdinIsTty = process.stdin.isTTY;
const originalStdoutIsTty = process.stdout.isTTY;

function setTty(isTty: boolean): void {
  process.stdin.isTTY = isTty;
  process.stdout.isTTY = isTty;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.stdin.isTTY = originalStdinIsTty;
  process.stdout.isTTY = originalStdoutIsTty;
});

describe('runInteractiveBillingPreview', () => {
  it('does not prompt when the mode did not come from unqualified defaults', async () => {
    setTty(true);

    const outcome = await runInteractiveBillingPreview({
      inputs: [createInput()],
      modeSource: 'file',
      runtime: createRuntime(),
      service: new BillingService(),
      useRaw: false,
      voucherLabel: 'Factura A',
    });

    expect(outcome).toEqual({
      confirmedInteractively: false,
      inputs: [createInput()],
      previewShown: false,
      proceed: true,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it('does not prompt when json output was requested', async () => {
    setTty(true);

    const outcome = await runInteractiveBillingPreview({
      inputs: [createInput()],
      modeSource: 'default',
      runtime: createRuntime({ outputJson: true }),
      service: new BillingService(),
      useRaw: false,
      voucherLabel: 'Factura A',
    });

    expect(outcome.proceed).toBe(true);
    expect(outcome.previewShown).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });

  it('does not prompt when every input already opted into emission', async () => {
    setTty(true);

    const outcome = await runInteractiveBillingPreview({
      inputs: [createInput({ dryRun: false, emit: true })],
      modeSource: 'default',
      runtime: createRuntime(),
      service: new BillingService(),
      useRaw: false,
      voucherLabel: 'Factura A',
    });

    expect(outcome.proceed).toBe(true);
    expect(outcome.previewShown).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });

  it('does not prompt outside of an interactive terminal', async () => {
    setTty(false);

    const outcome = await runInteractiveBillingPreview({
      inputs: [createInput()],
      modeSource: 'default',
      runtime: createRuntime(),
      service: new BillingService(),
      useRaw: false,
      voucherLabel: 'Factura A',
    });

    expect(outcome.proceed).toBe(true);
    expect(outcome.previewShown).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });

  it('shows a preview and switches inputs to real emission when the user confirms', async () => {
    setTty(true);
    vi.mocked(select).mockResolvedValue(true);

    const outcome = await runInteractiveBillingPreview({
      inputs: [createInput()],
      modeSource: 'default',
      runtime: createRuntime(),
      service: new BillingService(),
      useRaw: false,
      voucherLabel: 'Factura A',
    });

    expect(writeTerminalOutput).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({
      confirmedInteractively: true,
      inputs: [createInput({ dryRun: false, emit: true })],
      previewShown: true,
      proceed: true,
    });
  });

  it('keeps the original inputs and stops the flow when the user declines', async () => {
    setTty(true);
    vi.mocked(select).mockResolvedValue(false);

    const outcome = await runInteractiveBillingPreview({
      inputs: [createInput()],
      modeSource: 'default',
      runtime: createRuntime(),
      service: new BillingService(),
      useRaw: false,
      voucherLabel: 'Factura A',
    });

    expect(outcome).toEqual({
      confirmedInteractively: false,
      inputs: [createInput()],
      previewShown: true,
      proceed: false,
    });
  });
});
