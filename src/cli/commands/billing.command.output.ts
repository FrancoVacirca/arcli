import { serializeBillingBatch } from '../../modules/billing/billing.serialize';
import type { BillingExecutionResult } from '../../modules/billing/billing.types.internal';
import {
  formatBillingResultAsJson,
  formatBillingResultAsText,
  formatPdfOutcomeAsText,
  noticePanel,
  writeTerminalJson,
  writeTerminalOutput,
} from '../../ui';

export function formatBillingOutputs(
  results: BillingExecutionResult[],
  options: {
    /** Entro un array en `--cargar`: se rotula como lote aunque tenga un solo resultado. */
    readonly batch?: boolean;
    readonly environment: 'produccion' | 'testing';
    readonly previewShown?: boolean;
    readonly raw: boolean;
  },
): string {
  return results
    .map((result, index) => {
      const output = formatBillingResultAsText(result, {
        environment: options.environment,
        previewShown: options.previewShown,
        raw: options.raw,
      });

      if (results.length === 1 && !options.batch) {
        return output;
      }

      return [`Lote ${index + 1}/${results.length}`, output].join('\n');
    })
    .join('\n\n');
}

export function writeBillingCommandResults(
  results: BillingExecutionResult[],
  options: {
    /** Entro un array en `--cargar`: el JSON sale como array aunque tenga un solo resultado. */
    readonly batch?: boolean;
    readonly environment: 'produccion' | 'testing';
    readonly outputJson: boolean;
    readonly previewShown?: boolean;
    readonly raw: boolean;
  },
): void {
  if (options.outputJson) {
    if (results.length === 1 && !options.batch) {
      writeTerminalJson(formatBillingResultAsJson(results[0], { raw: options.raw }));

      return;
    }

    writeTerminalJson(JSON.stringify(serializeBillingBatch(results, { raw: options.raw }), null, 2));

    return;
  }

  writeTerminalOutput(
    formatBillingOutputs(results, {
      batch: options.batch,
      environment: options.environment,
      previewShown: options.previewShown,
      raw: options.raw,
    }),
  );
}

/** En texto el comprobante ya se mostro: solo se agrega lo que paso con el PDF y los avisos nuevos. */
export function writePdfOutcomes(
  before: readonly BillingExecutionResult[],
  after: readonly BillingExecutionResult[],
): void {
  const blocks = after.flatMap((result, index) => {
    const label = after.length > 1 ? `Lote ${index + 1}/${after.length}` : undefined;
    const newWarnings = (result.warnings ?? []).slice(before[index]?.warnings?.length ?? 0);

    return [
      ...(result.pdf ? [formatPdfOutcomeAsText(result.pdf, label)] : []),
      ...newWarnings.map((warning) => noticePanel(label ? `${label}: ${warning}` : warning, 'warning')),
    ];
  });

  if (blocks.length > 0) {
    writeTerminalOutput(blocks.join('\n'));
  }
}
