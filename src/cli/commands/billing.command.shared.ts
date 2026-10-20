import type { Command } from 'commander';

import type { BillingCommandInput } from '../../modules/billing/billing.schemas';
import { BillingService } from '../../modules/billing/billing.service';
import type { VoucherShortcut } from '../../modules/billing/billing.types';
import type { BillingExecutionResult } from '../../modules/billing/billing.types.internal';
import { getVoucherKindByShortcut } from '../../modules/billing/voucher-kind-map';
import type { FceObligationGateway } from '../../modules/fce/fce-obligation';
import { ArcaBillingGateway } from '../../services/arca/arca-billing.gateway';
import { ArcaClientFactory } from '../../services/arca/arca-client.factory';
import { ArcaContextResolver } from '../../services/arca/arca-context.resolver';
import { ArcaFceObligationGateway } from '../../services/arca/arca-fce-obligation.gateway';
import { ArcaPadronGateway } from '../../services/arca/arca-padron.gateway';
import { startSpinner } from '../spinner';
import type { GlobalCliOptions } from '../types';

import { emitBatch, validateBatchBeforeEmitting } from './billing.command.batch';
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

export function registerGlobalOptions(command: Command): void {
  command
    .option('--testing', 'usar entorno de testing en esta ejecucion')
    .option('--produccion', 'usar entorno de produccion en esta ejecucion')
    .option('--json', 'imprimir salida JSON')
    .option('--bruto', 'mostrar la respuesta bruta de ARCA cuando exista');
}

export function registerBillingCommandOptions(command: Command): void {
  registerGlobalOptions(command);
  registerBillingOptions(command);
}

export function getGlobalOptions(command: Command): GlobalCliOptions {
  return command.optsWithGlobals<GlobalCliOptions>();
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
    const plannedInputs: BillingCommandInput[] = [];
    const padronWarnings: string[][] = [];
    const padronGateway = new ArcaPadronGateway(arca);

    // Secuencial a proposito, como el FCE: cada servicio de ARCA reutiliza su ticket WSAA.
    for (const input of plan.inputs) {
      const resolution = await service.resolveIvaConditionFromPadron(input, padronGateway);

      padronWarnings.push(resolution.warnings);
      plannedInputs.push(await service.resolveExchangeRate(resolution.input, gateway));
    }

    validateBatchBeforeEmitting(plan, plannedInputs, (input) => service.buildVoucherPayload(input, runtime));

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

    const outputOptions = {
      environment: runtime.environment,
      outputJson: runtime.outputJson,
      previewShown,
      raw: useRaw,
    };
    const results = await emitBatch({
      emit: (input, position) => service.execute({ gateway, input, runtime, warnings: warnings[position] }),
      inputs,
      onPartialResults: (partial) => {
        spinner?.stop();
        writeBillingCommandResults(partial, outputOptions);
      },
      plan,
    });

    spinner?.stop();
    setExitCodeForResults(results);

    const pdfOptions = {
      config: runtime.config,
      inputs,
      interactive: !runtime.outputJson && Boolean(process.stdin.isTTY && process.stdout.isTTY),
      results,
    };

    // En JSON el PDF va dentro del mismo resultado; en texto primero se ve el CAE y despues se pregunta.
    if (runtime.outputJson) {
      writeBillingCommandResults(await attachPdfs(pdfOptions), outputOptions);

      return;
    }

    writeBillingCommandResults(results, outputOptions);
    writePdfOutcomes(results, await attachPdfs(pdfOptions));
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}
