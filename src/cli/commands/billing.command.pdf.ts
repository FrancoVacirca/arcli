import { join } from 'node:path';

import type { BillingCommandInput } from '../../modules/billing/billing.schemas';
import type { BillingExecutionResult } from '../../modules/billing/billing.types.internal';
import type { ArcliConfig } from '../../modules/config/config.schemas';
import { ConfigService } from '../../modules/config/config.service';
import { PDF_INSTALL_SUGGESTION, PdfError } from '../../modules/pdf/pdf.errors';
import type { PdfOutcome } from '../../modules/pdf/pdf.types';
import { canHavePdf, type PdfDecision, resolvePdfDecision } from '../../modules/pdf/pdf-decision';
import { resolvePdfIssuer } from '../../modules/pdf/pdf-issuer';
import { exportBillingPdf, toPdfFailure } from '../../services/pdf/pdf-exporter';
import { PdfPlugin, type PdfRenderer } from '../../services/pdf/pdf-plugin';
import { confirm, isPromptCancellation } from '../interactive/prompts';
import { startSpinner } from '../spinner';

export const PDF_ONLY_FLAGS_WARNING =
  '--descripcion, --receptor-nombre y --receptor-domicilio solo se usan en el PDF; no se genero ninguno.';

export interface PdfStepDependencies {
  readonly confirm: (message: string, yesLabel: string, noLabel?: string) => Promise<boolean>;
  readonly createPlugin: (config: ArcliConfig) => PdfPlugin;
  readonly resolveFolder: (config: ArcliConfig) => string;
}

export const defaultPdfStepDependencies: PdfStepDependencies = {
  confirm: (message, yesLabel, noLabel) => confirm(message, yesLabel, noLabel),
  createPlugin: (config) => {
    const service = new ConfigService();

    try {
      return new PdfPlugin({ configuredBrowser: config.pdfNavegador, path: join(service.getPluginsPath(), 'pdf') });
    } finally {
      service.close();
    }
  },
  resolveFolder: (config) => {
    const service = new ConfigService();

    try {
      return service.resolvePdfFolder(config);
    } finally {
      service.close();
    }
  },
};

export interface PdfStepOptions {
  readonly config: ArcliConfig;
  /** Alineados con `results`. */
  readonly inputs: readonly BillingCommandInput[];
  /** Hay alguien para responder preguntas: terminal interactiva y sin --json. */
  readonly interactive: boolean;
  readonly results: readonly BillingExecutionResult[];
}

function hasPdfOnlyData(input: BillingCommandInput | undefined): boolean {
  return Boolean(input?.pdfDescription || input?.receiverName || input?.receiverAddress);
}

async function resolveDecisions(options: PdfStepOptions, deps: PdfStepDependencies): Promise<PdfDecision[]> {
  const decisions = options.results.map((result, index) =>
    canHavePdf(result)
      ? resolvePdfDecision({
          flag: options.inputs[index]?.pdf,
          interactive: options.interactive,
          mode: options.config.pdf,
        })
      : 'omitir',
  );
  const pending = decisions.filter((decision) => decision === 'preguntar').length;

  if (pending === 0) {
    return decisions;
  }

  const answer = await deps.confirm(
    pending === 1 ? '¿Generamos el PDF del comprobante?' : `¿Generamos los PDFs de los ${pending} comprobantes?`,
    pending === 1 ? 'Si, generar el PDF' : 'Si, generar los PDFs',
    'No',
  );

  return decisions.map((decision) => (decision === 'preguntar' ? (answer ? 'generar' : 'omitir') : decision));
}

/** Si falta el plugin, en una terminal se ofrece instalarlo; sin terminal nunca se descarga solo. */
async function loadRenderer(plugin: PdfPlugin, interactive: boolean, deps: PdfStepDependencies): Promise<PdfRenderer> {
  if (!plugin.getStatus().installed && interactive) {
    const install = await deps.confirm(
      'Para generar PDFs hay que descargar un componente (~160 MB, o ~360 MB si no tenes Chrome). ¿Instalarlo ahora?',
      'Si, instalar',
      'No',
    );

    if (!install) {
      throw new PdfError('PDF_PLUGIN_MISSING', 'No se instalo el plugin de PDF.', {
        suggestion: PDF_INSTALL_SUGGESTION,
      });
    }

    const spinner = startSpinner('Instalando el plugin de PDF...');

    try {
      await plugin.install((message) => {
        if (spinner) {
          spinner.text = message;
        }
      });
    } finally {
      spinner?.stop();
    }
  }

  return plugin.load();
}

/**
 * Genera los PDFs de los comprobantes emitidos. Nunca lanza: el comprobante ya esta emitido, asi que un
 * error del PDF se devuelve en `pdf.error` y no cambia el codigo de salida.
 */
export async function attachPdfs(
  options: PdfStepOptions,
  defaultDeps: PdfStepDependencies = defaultPdfStepDependencies,
): Promise<BillingExecutionResult[]> {
  // El comprobante ya se emitio: Ctrl+C en una pregunta del PDF es "No", no un error del comando.
  const deps: PdfStepDependencies = {
    ...defaultDeps,
    confirm: async (...args) => {
      try {
        return await defaultDeps.confirm(...args);
      } catch (error) {
        if (isPromptCancellation(error)) {
          return false;
        }

        throw error;
      }
    },
  };
  const decisions = await resolveDecisions(options, deps);
  const targets = decisions.flatMap((decision, index) => (decision === 'generar' ? [index] : []));
  const outcomes = new Map<number, PdfOutcome>();

  if (targets.length > 0) {
    try {
      // Antes de descargar nada: sin los datos del emisor no se puede armar ningun PDF.
      resolvePdfIssuer(options.config, options.results[targets[0]].voucherKind.letter);

      const renderer = await loadRenderer(deps.createPlugin(options.config), options.interactive, deps);
      const folder = deps.resolveFolder(options.config);

      for (const index of targets) {
        const spinner = startSpinner('Generando PDF...');

        try {
          const input = options.inputs[index];
          const path = await exportBillingPdf({
            config: options.config,
            extras: {
              descripcion: input?.pdfDescription,
              receptorDomicilio: input?.receiverAddress,
              receptorNombre: input?.receiverName,
            },
            folder,
            renderer,
            result: options.results[index],
          });

          outcomes.set(index, { path });
        } catch (error) {
          outcomes.set(index, toPdfFailure(error));
        } finally {
          spinner?.stop();
        }
      }
    } catch (error) {
      for (const index of targets) {
        outcomes.set(index, toPdfFailure(error));
      }
    }
  }

  return options.results.map((result, index) => {
    const pdf = outcomes.get(index);

    if (pdf) {
      return { ...result, pdf };
    }

    // Avisa que esos datos no quedaron en ningun lado: ARCA no los recibe.
    if (canHavePdf(result) && hasPdfOnlyData(options.inputs[index])) {
      return { ...result, warnings: [...(result.warnings ?? []), PDF_ONLY_FLAGS_WARNING] };
    }

    return result;
  });
}
