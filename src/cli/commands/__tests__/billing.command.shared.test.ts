import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BillingCommandInput } from '../../../modules/billing/billing.schemas';
import type { BillingExecutionResult } from '../../../modules/billing/billing.types.internal';
import type { ArcliConfig } from '../../../modules/config/config.schemas';
import { writeBillingCommandResults, writePdfOutcomes } from '../billing.command.output';
import { attachPdfs } from '../billing.command.pdf';
import { REJECTED_EXIT_CODE, setExitCodeForResults, writeResultsWithPdfs } from '../billing.command.shared';

vi.mock('../billing.command.output', () => ({ writeBillingCommandResults: vi.fn(), writePdfOutcomes: vi.fn() }));
vi.mock('../billing.command.pdf', () => ({ attachPdfs: vi.fn() }));

function result(status: BillingExecutionResult['response']['status'], dryRun = false): BillingExecutionResult {
  return { dryRun, response: { status } } as BillingExecutionResult;
}

afterEach(() => {
  process.exitCode = undefined;
  vi.clearAllMocks();
});

describe('setExitCodeForResults', () => {
  it('sale con 2 si ARCA rechazo alguno de los comprobantes', () => {
    setExitCodeForResults([result('aprobado'), result('rechazado')]);

    expect(process.exitCode).toBe(REJECTED_EXIT_CODE);
  });

  it('deja el exit code en 0 si todos se aprobaron, aunque tengan observaciones', () => {
    setExitCodeForResults([result('aprobado'), result('observado')]);

    expect(process.exitCode).toBeUndefined();
  });

  it('ignora las previsualizaciones', () => {
    setExitCodeForResults([result('rechazado', true)]);

    expect(process.exitCode).toBeUndefined();
  });
});

describe('writeResultsWithPdfs', () => {
  const emitted = [result('aprobado'), result('aprobado')];
  const withPdf = emitted.map((item) => ({ ...item, pdf: { path: '/tmp/fc.pdf' } }));
  const options = (outputJson: boolean) => ({
    config: {} as ArcliConfig,
    inputs: [{} as BillingCommandInput, {} as BillingCommandInput, {} as BillingCommandInput],
    interactive: false,
    output: { environment: 'testing' as const, outputJson, raw: false },
  });

  it('en JSON imprime los resultados con su pdf, solo de los emitidos', async () => {
    vi.mocked(attachPdfs).mockResolvedValueOnce(withPdf);

    await writeResultsWithPdfs(emitted, options(true));

    expect(attachPdfs).toHaveBeenCalledWith(
      expect.objectContaining({ inputs: options(true).inputs.slice(0, 2), results: emitted }),
    );
    expect(writeBillingCommandResults).toHaveBeenCalledTimes(1);
    expect(writeBillingCommandResults).toHaveBeenCalledWith(withPdf, options(true).output);
  });

  it('en texto muestra primero el comprobante y despues el PDF', async () => {
    vi.mocked(attachPdfs).mockResolvedValueOnce(withPdf);

    await writeResultsWithPdfs(emitted, options(false));

    expect(writeBillingCommandResults).toHaveBeenCalledWith(emitted, options(false).output);
    expect(writePdfOutcomes).toHaveBeenCalledWith(emitted, withPdf);
    expect(vi.mocked(writeBillingCommandResults).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(attachPdfs).mock.invocationCallOrder[0],
    );
  });
});
