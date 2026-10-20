import type { Command } from 'commander';

import type { BillingCommandInput } from '../../modules/billing/billing.schemas';
import { BillingService } from '../../modules/billing/billing.service';
import type { VoucherShortcut } from '../../modules/billing/billing.types';
import type { BillingExecutionResult } from '../../modules/billing/billing.types.internal';
import { getVoucherKindByShortcut } from '../../modules/billing/voucher-kind-map';
import type { ArcliConfig } from '../../modules/config/config.schemas';
import type { FceObligationGateway } from '../../modules/fce/fce-obligation';
import { ArcaBillingGateway } from '../../services/arca/arca-billing.gateway';
import { ArcaClientFactory } from '../../services/arca/arca-client.factory';
import { ArcaContextResolver } from '../../services/arca/arca-context.resolver';
import { ArcaFceObligationGateway } from '../../services/arca/arca-fce-obligation.gateway';
import { ArcaPadronGateway } from '../../services/arca/arca-padron.gateway';
import { getGlobalOptions, registerGlobalOptions } from '../global-options';
import { startSpinner } from '../spinner';

import { emitBatch, prepareBatch } from './billing.command.batch';
import { runInteractiveBillingPreview } from './billing.command.interactive-preview';
import { writeBillingCommandResults, writePdfOutcomes } from './billing.command.output';
import { parseBillingCommandPlan, registerBillingOptions } from './billing.command.parser';
import { attachPdfs } from './billing.command.pdf';

/** Exit code cuando ARCA rechaza algun comprobante: la operacion corrio bien, pero no hay CAE. */
export const REJECTED_EXIT_CODE = 2;

/** 2 si ARCA rechazo alguno de los comprobantes emitidos; si no, no se toca (queda en 0). */
export function setExitCodeForResults(results: readonly BillingExecutionResult[]): void {
  if (results.some((result) => !result.dryRun && result.response.status === 'rechazado')) {
    process.exitCode = REJECTED_EXIT_CODE;
  }
}

export function registerBillingCommandOptions(command: Command): void {
  registerGlobalOptions(command);
  registerBillingOptions(command);
}

/**
 * Imprime los resultados con su PDF, segun la config `pdf` o `--exportar-pdf`. Se usa con el lote completo y
 * con los ya emitidos de un lote que se corto: esos tambien tienen CAE y merecen su PDF.
 */
export async function writeResultsWithPdfs(
  results: BillingExecutionResult[],
  options: {
    readonly config: ArcliConfig;
    /** Los del lote entero; se toman los primeros `results.length`. */
    readonly inputs: readonly BillingCommandInput[];
    readonly interactive: boolean;
    readonly output: Parameters<typeof writeBillingCommandResults>[1];
  },
): Promise<void> {
  const pdfOptions = {
    config: options.config,
    inputs: options.inputs.slice(0, results.length),
    interactive: options.interactive,
    results,
  };

  // En JSON el PDF va dentro del mismo resultado; en texto primero se ve el CAE y despues se pregunta.
  if (options.output.outputJson) {
    writeBillingCommandResults(await attachPdfs(pdfOptions), options.output);

    return;
  }

  writeBillingCommandResults(results, options.output);
  writePdfOutcomes(results, await attachPdfs(pdfOptions));
}

async function resolveFceWarnings(
  inputs: readonly BillingCommandInput[],
  service: BillingService,
  gateway: FceObligationGateway,
): Promise<string[][]> {
  const warnings: string[][] = [];

  // Secuencial a proposito: cada consulta a wsfecred reutiliza el mismo ticket WSAA.
  for (const input of inputs) {
    warnings.push(await service.resolveFceWarnings(input, gateway));
  }

  return warnings;
}

export async function executeBillingCommand(command: Command, shortcut: VoucherShortcut): Promise<void> {
  const globalOptions = getGlobalOptions(command);
  let spinner: ReturnType<typeof startSpinner> = null;
  const voucherKind = getVoucherKindByShortcut(shortcut);

  try {
    const runtime = new ArcaContextResolver({ options: globalOptions }).resolve();
    const plan = parseBillingCommandPlan(command, shortcut, {
      defaultCbu: runtime.config.cbu,
      defaultCbuAlias: runtime.config.aliasCbu,
      defaultConcept: runtime.config.conceptoPorDefecto,
      defaultCurrencyCode: runtime.config.monedaPorDefecto,
      defaultEmit: runtime.config.output.emitirPorDefecto,
      defaultExchangeRate: runtime.config.cotizacionPorDefecto,
      defaultIvaCondition: runtime.config.ivaReceptorPorDefecto,
      defaultIvaRate: runtime.config.alicuotaPorDefecto,
      lookupIvaConditionInPadron: runtime.config.consultarPadron !== false,
    });
    const service = new BillingService();
    const arca = new ArcaClientFactory().create(runtime);
    const gateway = new ArcaBillingGateway(arca);
    const useRaw = typeof globalOptions.bruto === 'boolean' ? globalOptions.bruto : runtime.outputRaw;
    const padronGateway = new ArcaPadronGateway(arca);
    // En un lote, un fallo del padron o de la cotizacion sale con su indice, junto a los de validacion.
    const prepared = await prepareBatch({
      inputs: plan.inputs,
      plan,
      resolve: async (input) => {
        const resolution = await service.resolveIvaConditionFromPadron(input, padronGateway);

        return {
          input: await service.resolveExchangeRate(resolution.input, gateway),
          warnings: resolution.warnings,
        };
      },
      validate: ({ input }) => {
        service.buildVoucherPayload(input, runtime);
      },
    });
    const plannedInputs = prepared.map(({ input }) => input);
    const padronWarnings = prepared.map(({ warnings }) => warnings);

    const fceWarnings = runtime.config.verificarFce
      ? await resolveFceWarnings(plannedInputs, service, new ArcaFceObligationGateway(arca))
      : [];
    const warnings = plannedInputs.map((_input, position) => [
      ...(padronWarnings[position] ?? []),
      ...(fceWarnings[position] ?? []),
    ]);

    const preview = await runInteractiveBillingPreview({
      inputs: plannedInputs,
      modeSource: plan.modeSource,
      runtime,
      service,
      useRaw,
      voucherLabel: voucherKind?.displayName ?? 'este comprobante',
      warnings,
    });

    if (!preview.proceed) {
      return;
    }

    const { inputs, previewShown } = preview;

    spinner = runtime.outputJson ? null : startSpinner('Procesando comprobante...');

    if (spinner) {
      spinner.text = inputs.length > 1 ? `Procesando ${inputs.length} comprobantes...` : 'Procesando comprobante...';
    }

    const deliveryOptions = {
      config: runtime.config,
      inputs,
      interactive: !runtime.outputJson && Boolean(process.stdin.isTTY && process.stdout.isTTY),
      output: {
        batch: plan.isBatch,
        environment: runtime.environment,
        outputJson: runtime.outputJson,
        previewShown,
        raw: useRaw,
      },
    };
    const results = await emitBatch({
      emit: (input, position) => service.execute({ gateway, input, runtime, warnings: warnings[position] }),
      inputs,
      onPartialResults: async (partial) => {
        spinner?.stop();
        await writeResultsWithPdfs(partial, deliveryOptions);
      },
      plan,
    });

    spinner?.stop();
    setExitCodeForResults(results);
    await writeResultsWithPdfs(results, deliveryOptions);
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}
