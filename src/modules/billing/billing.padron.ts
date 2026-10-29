import { AppError, InputValidationError } from '../../lib/errors/app-error';
import type { PadronGateway, Taxpayer } from '../padron/padron';
import { formatIvaConditionName } from '../pdf/pdf-issuer';

import type { BillingCommandInput } from './billing.schemas';

export interface PadronResolution {
  readonly input: BillingCommandInput;
  /** Avisos para la vista previa: el padron no respondio o no informa la condicion y se uso la config. */
  readonly warnings: string[];
}

const MISSING_IVA_HINT =
  'Usá --ir <tipo> o un flag --ir-*, o configurá uno por defecto con "arcli config establecer ivaReceptor <tipo>".';

/** Hay que consultar el padron: un CUIT sin IVA receptor explicito (vino de la config o falta). */
export function needsPadronLookup(input: BillingCommandInput): boolean {
  return (
    input.documentType === 'cuit' &&
    input.documentNumber !== undefined &&
    (input.ivaConditionSource === 'default' || input.ivaConditionSource === 'missing')
  );
}

function fallBack(input: BillingCommandInput, reason: string, hint?: string): PadronResolution {
  if (input.ivaConditionSource === 'missing') {
    throw new InputValidationError(`Falta IVA receptor. ${reason}. ${MISSING_IVA_HINT}`);
  }

  const warning = `${reason}. Se usa el IVA receptor de la config: ${formatIvaConditionName(input.ivaCondition)}.`;

  return { input, warnings: [hint ? `${warning} ${hint}` : warning] };
}

function lookupErrorHint(error: unknown): string | undefined {
  return error instanceof AppError && error.code === 'PADRON_SERVICE_NOT_AUTHORIZED'
    ? 'Para no consultarlo al facturar: arcli config establecer consultarPadron false.'
    : undefined;
}

/**
 * Completa el IVA receptor (y, si faltan, nombre y domicilio para el PDF) con el padron de ARCA. Si el padron no
 * responde o no informa la condicion, sigue con la de la config y avisa; sin config, es un error de entrada.
 */
export async function resolveIvaConditionFromPadron(
  input: BillingCommandInput,
  gateway: PadronGateway,
): Promise<PadronResolution> {
  if (!needsPadronLookup(input)) {
    return { input, warnings: [] };
  }

  const cuit = input.documentNumber as number;
  let taxpayer: Taxpayer | null;

  try {
    taxpayer = await gateway.getTaxpayer(cuit);
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/\.$/, '') : 'error desconocido';

    return fallBack(input, `No se pudo consultar el padrón de ARCA (${message})`, lookupErrorHint(error));
  }

  if (!taxpayer) {
    return fallBack(input, `El CUIT ${cuit} no figura en el padrón de ARCA`);
  }

  const fromPadron = [
    ...(!input.receiverAddress && taxpayer.address ? (['address'] as const) : []),
    ...(!input.receiverName && taxpayer.name ? (['name'] as const) : []),
  ];
  const withReceiver: BillingCommandInput = {
    ...input,
    receiverAddress: input.receiverAddress ?? taxpayer.address ?? undefined,
    receiverFromPadron: fromPadron.length > 0 ? fromPadron : undefined,
    receiverName: input.receiverName ?? taxpayer.name ?? undefined,
  };

  if (!taxpayer.ivaCondition) {
    return fallBack(withReceiver, `El padrón de ARCA no informa la condición IVA del CUIT ${cuit}`);
  }

  return {
    input: { ...withReceiver, ivaCondition: taxpayer.ivaCondition, ivaConditionSource: 'padron' },
    warnings: [],
  };
}
