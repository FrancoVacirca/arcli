import select from '@inquirer/select';

import type { BillingCommandInput } from '../../modules/billing/billing.schemas';
import type { BillingService } from '../../modules/billing/billing.service';
import type { BillingExecutionResult, BillingGateway } from '../../modules/billing/billing.types.internal';
import type { ResolvedArcaRuntime } from '../../services/arca/arca-context.resolver';
import { writeTerminalOutput } from '../../ui';

import { formatBillingOutputs } from './billing.command.output';

export interface InteractiveBillingPreviewOutcome {
  readonly confirmedInteractively: boolean;
  readonly inputs: BillingCommandInput[];
  readonly previewShown: boolean;
  readonly proceed: boolean;
}

async function promptForEmission(count: number, voucherLabel: string): Promise<boolean> {
  return select({
    choices: [
      { name: 'Si, emitir ahora', value: true },
      { name: 'No, dejar sin emitir', value: false },
    ],
    default: true,
    message: count > 1 ? `¿Desea emitir los ${count} comprobantes ahora?` : `¿Desea emitir ${voucherLabel} ahora?`,
  });
}

function applyEmitDecision(inputs: BillingCommandInput[], shouldEmit: boolean): BillingCommandInput[] {
  return inputs.map((input) => ({
    ...input,
    dryRun: !shouldEmit,
    emit: shouldEmit,
  }));
}

export async function runInteractiveBillingPreview(options: {
  readonly inputs: BillingCommandInput[];
  readonly modeSource: 'default' | 'file' | 'flags';
  readonly runtime: ResolvedArcaRuntime;
  readonly service: BillingService;
  readonly useRaw: boolean;
  readonly voucherLabel: string;
  readonly warnings?: ReadonlyArray<readonly string[]>;
}): Promise<InteractiveBillingPreviewOutcome> {
  const shouldPromptForEmit =
    options.modeSource === 'default' &&
    options.inputs.some((input) => !input.emit) &&
    !options.runtime.outputJson &&
    process.stdin.isTTY &&
    process.stdout.isTTY;

  if (!shouldPromptForEmit) {
    return {
      confirmedInteractively: false,
      inputs: options.inputs,
      previewShown: false,
      proceed: true,
    };
  }

  const previewGateway: BillingGateway = {
    createVoucher: async () => {
      throw new Error('No deberia ejecutarse la emision real durante la vista previa.');
    },
    getNextVoucherNumber: async () => {
      throw new Error('No deberia ejecutarse la emision real durante la vista previa.');
    },
    getQuotation: async () => {
      throw new Error('La cotizacion se resuelve antes de la vista previa.');
    },
  };
  const previewResults: BillingExecutionResult[] = [];

  for (const [index, input] of options.inputs.entries()) {
    previewResults.push(
      await options.service.execute({
        gateway: previewGateway,
        input,
        runtime: options.runtime,
        warnings: options.warnings?.[index],
      }),
    );
  }

  writeTerminalOutput(
    formatBillingOutputs(previewResults, { environment: options.runtime.environment, raw: options.useRaw }),
  );

  const confirmed = await promptForEmission(options.inputs.length, options.voucherLabel);

  if (!confirmed) {
    return {
      confirmedInteractively: false,
      inputs: options.inputs,
      previewShown: true,
      proceed: false,
    };
  }

  return {
    confirmedInteractively: true,
    inputs: applyEmitDecision(options.inputs, true),
    previewShown: true,
    proceed: true,
  };
}
