import { afterEach, describe, expect, it } from 'vitest';

import type { BillingExecutionResult } from '../../../modules/billing/billing.types.internal';
import { REJECTED_EXIT_CODE, setExitCodeForResults } from '../billing.command.shared';

function result(status: BillingExecutionResult['response']['status'], dryRun = false): BillingExecutionResult {
  return { dryRun, response: { status } } as BillingExecutionResult;
}

afterEach(() => {
  process.exitCode = undefined;
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
