import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BillingExecutionResult } from '../../../modules/billing/billing.types.internal';
import { formatBillingOutputs, writeBillingCommandResults } from '../billing.command.output';

vi.mock('../../../ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../ui')>();

  return {
    ...actual,
    writeTerminalJson: vi.fn(),
    writeTerminalOutput: vi.fn(),
  };
});

import { writeTerminalJson, writeTerminalOutput } from '../../../ui';

function createResult(overrides: Partial<BillingExecutionResult> = {}): BillingExecutionResult {
  return {
    dryRun: false,
    environment: 'produccion',
    payload: {
      CbteTipo: 1,
      ImpTotal: 15000,
      PtoVta: 3,
    } as never,
    response: {
      cae: '12345678901234',
      caeVencimiento: '20260331',
      errors: [],
      events: [],
      observaciones: [],
      observacion: null,
      raw: null,
      resultado: 'A',
      suggestions: [],
      status: 'aprobado',
    },
    voucherKind: {
      arcaType: 1,
      displayName: 'Factura A',
      family: 'factura',
      isElectronicCredit: false,
      letter: 'a',
      requiresAssociatedVoucher: false,
      shortcut: 'fa',
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('formatBillingOutputs', () => {
  it('renders a single result without a batch label', () => {
    const output = formatBillingOutputs([createResult()], { environment: 'produccion', raw: false });

    expect(output).not.toContain('Lote');
  });

  it('labels each result with its position when there is more than one', () => {
    const output = formatBillingOutputs([createResult(), createResult()], {
      environment: 'produccion',
      raw: false,
    });

    expect(output).toContain('Lote 1/2');
    expect(output).toContain('Lote 2/2');
  });
});

describe('writeBillingCommandResults', () => {
  it('writes a single json object, not an array, for a single result', () => {
    writeBillingCommandResults([createResult()], { environment: 'produccion', outputJson: true, raw: false });

    expect(writeTerminalJson).toHaveBeenCalledTimes(1);
    expect(writeTerminalOutput).not.toHaveBeenCalled();

    const [jsonPayload] = vi.mocked(writeTerminalJson).mock.calls[0]!;

    expect(() => JSON.parse(jsonPayload)).not.toThrow();
    expect(JSON.parse(jsonPayload)).not.toBeInstanceOf(Array);
  });

  it('writes a json array when there is more than one result', () => {
    writeBillingCommandResults([createResult(), createResult()], {
      environment: 'produccion',
      outputJson: true,
      raw: false,
    });

    const [jsonPayload] = vi.mocked(writeTerminalJson).mock.calls[0]!;

    expect(JSON.parse(jsonPayload)).toBeInstanceOf(Array);
    expect(JSON.parse(jsonPayload)).toHaveLength(2);
  });

  it('writes a json array for a one-item batch', () => {
    writeBillingCommandResults([createResult()], {
      batch: true,
      environment: 'produccion',
      outputJson: true,
      raw: false,
    });

    const [jsonPayload] = vi.mocked(writeTerminalJson).mock.calls[0]!;

    expect(JSON.parse(jsonPayload)).toBeInstanceOf(Array);
    expect(JSON.parse(jsonPayload)).toHaveLength(1);
    expect(JSON.parse(jsonPayload)[0]).toMatchObject({ indice: 1 });
  });

  it('writes plain text output instead of json when outputJson is false', () => {
    writeBillingCommandResults([createResult()], { environment: 'produccion', outputJson: false, raw: false });

    expect(writeTerminalOutput).toHaveBeenCalledTimes(1);
    expect(writeTerminalJson).not.toHaveBeenCalled();
  });
});
