import type { BillingCommandInput } from '../../modules/billing/billing.schemas';
import type { BillingExecutionResult } from '../../modules/billing/billing.types.internal';
import type { ArcliConfig } from '../../modules/config/config.schemas';
import { ConfigService } from '../../modules/config/config.service';
import { parseConfigValue } from '../../modules/config/config-value-parser';
import { canHavePdf, resolvePdfDecision } from '../../modules/pdf/pdf-decision';
import { listMissingIssuerKeys } from '../../modules/pdf/pdf-issuer';
import { noticePanel, writeTerminalOutput } from '../../ui';
import { writePdfOutcomes } from '../commands/billing.command.output';
import { attachPdfs } from '../commands/billing.command.pdf';

import { askText, confirm, isPromptCancellation } from './prompts';

type IssuerKey = 'cuit' | 'emisor.domicilio' | 'emisor.inicioActividades' | 'emisor.razonSocial';

const ISSUER_QUESTIONS: Record<IssuerKey, string> = {
  cuit: 'CUIT del emisor',
  'emisor.domicilio': 'Domicilio comercial del emisor',
  'emisor.inicioActividades': 'Fecha de inicio de actividades (D/MM/YYYY)',
  'emisor.razonSocial': 'Razon social o nombre del emisor',
};

function validateConfigValue(key: IssuerKey, value: string): string | true {
  try {
    parseConfigValue(key, value);

    return true;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function applyIssuerValue(config: ArcliConfig, key: IssuerKey, value: string): ArcliConfig {
  const parsed = String(parseConfigValue(key, value));

  if (key === 'cuit') {
    return { ...config, cuit: parsed };
  }

  const field = key.slice('emisor.'.length) as 'domicilio' | 'inicioActividades' | 'razonSocial';

  return { ...config, emisor: { ...config.emisor, [field]: parsed } };
}

/** Pide los datos del emisor que faltan y ofrece guardarlos para no volver a preguntarlos. */
async function completeIssuer(config: ArcliConfig): Promise<ArcliConfig> {
  const missing = listMissingIssuerKeys(config) as IssuerKey[];

  if (missing.length === 0) {
    return config;
  }

  let completed = config;
  const answers: Array<readonly [IssuerKey, string]> = [];

  for (const key of missing) {
    const value = await askText(ISSUER_QUESTIONS[key], { validate: (text) => validateConfigValue(key, text) });

    answers.push([key, value]);
    completed = applyIssuerValue(completed, key, value);
  }

  if (await confirm('¿Guardamos estos datos en la config para la proxima?', 'Si, guardar', 'No, solo esta vez')) {
    const service = new ConfigService();

    try {
      for (const [key, value] of answers) {
        service.setValue(key, value);
      }
    } finally {
      service.close();
    }
  }

  return completed;
}

/** Despues de emitir: pregunta si se quiere el PDF (segun la config) y los datos que solo van en el PDF. */
export async function offerPdf(
  config: ArcliConfig,
  input: BillingCommandInput,
  result: BillingExecutionResult,
): Promise<void> {
  if (!canHavePdf(result)) {
    return;
  }

  const decision = resolvePdfDecision({ interactive: true, mode: config.pdf });

  if (decision === 'omitir') {
    return;
  }

  // Ya se emitio: un Ctrl+C aca no puede terminar en "No se emitio nada".
  try {
    if (
      decision === 'preguntar' &&
      !(await confirm('¿Generamos el PDF del comprobante?', 'Si, generar el PDF', 'No'))
    ) {
      return;
    }

    const description = await askText('Descripcion del comprobante (Enter para "Segun detalle")');
    // Lo que trajo el padron se propone: Enter lo deja, en lugar de borrarlo.
    const receiverName = await askText(
      input.receiverName
        ? 'Nombre o razón social del receptor:'
        : 'Nombre o razon social del receptor (Enter para omitir)',
      { defaultValue: input.receiverName },
    );
    const receiverAddress = await askText(
      input.receiverAddress ? 'Domicilio del receptor:' : 'Domicilio del receptor (Enter para omitir)',
      { defaultValue: input.receiverAddress },
    );
    const completedConfig = await completeIssuer(config);
    const withPdf = await attachPdfs({
      config: completedConfig,
      inputs: [
        {
          ...input,
          pdf: true,
          pdfDescription: description || undefined,
          receiverAddress: receiverAddress || undefined,
          receiverName: receiverName || undefined,
        },
      ],
      interactive: true,
      results: [result],
    });

    writePdfOutcomes([result], withPdf);
  } catch (error) {
    if (!isPromptCancellation(error)) {
      throw error;
    }

    writeTerminalOutput(noticePanel('El comprobante ya quedo emitido; no se genero el PDF.', 'muted'));
  }
}
