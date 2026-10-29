import { isIvaConditionAllowed } from '../../modules/billing/billing.iva-receptor';
import type { BillingCommandInput, BillingIvaCondition } from '../../modules/billing/billing.schemas';
import type { VoucherLetter } from '../../modules/billing/billing.types';
import { ivaConditionChoices } from '../../modules/interactive/choices';
import { BACK, type Back } from '../../modules/interactive/wizard';
import { ArcaPadronGateway } from '../../services/arca/arca-padron.gateway';
import { startSpinner } from '../spinner';

import { chooseStep } from './prompts';
import type { InteractiveSession } from './session';

/** Lo que el padron dijo del CUIT del receptor, para no volver a consultarlo si el usuario vuelve atras. */
export interface ReceiverFromPadron {
  readonly address?: string;
  readonly cuit: number;
  readonly ivaCondition?: BillingIvaCondition;
  readonly name?: string;
}

interface ReceiverState {
  readonly documentNumber?: number;
  readonly documentType?: BillingCommandInput['documentType'];
  readonly receiver?: ReceiverFromPadron;
}

/** Consulta el padron si hay un CUIT y la config lo permite. Si falla, sigue sin datos: el usuario elige igual. */
async function lookupReceiver(
  session: InteractiveSession,
  state: ReceiverState,
): Promise<ReceiverFromPadron | undefined> {
  const cuit = state.documentNumber;

  if (state.documentType !== 'cuit' || !cuit || session.runtime.config.consultarPadron === false) {
    return undefined;
  }

  if (state.receiver?.cuit === cuit) {
    return state.receiver;
  }

  const spinner = startSpinner('Consultando el padrón...');

  try {
    const taxpayer = await new ArcaPadronGateway(session.arca).getTaxpayer(cuit);

    return {
      address: taxpayer?.address ?? undefined,
      cuit,
      ivaCondition: taxpayer?.ivaCondition ?? undefined,
      name: taxpayer?.name ?? undefined,
    };
  } catch {
    return { cuit };
  } finally {
    spinner?.stop();
  }
}

/**
 * Pregunta la condicion IVA del receptor. Con un CUIT, propone la del padron (marcada) y muestra el nombre;
 * si no, la de la config.
 */
export async function askReceiverIvaCondition(
  session: InteractiveSession,
  state: ReceiverState,
  letter: VoucherLetter,
  configDefault?: BillingIvaCondition,
): Promise<Back | { ivaCondition: BillingIvaCondition; receiver?: ReceiverFromPadron }> {
  const receiver = await lookupReceiver(session, state);
  const fromPadron =
    receiver?.ivaCondition && isIvaConditionAllowed(letter, receiver.ivaCondition) ? receiver.ivaCondition : undefined;
  const choices = ivaConditionChoices(letter).map((choice) =>
    choice.value === fromPadron ? { ...choice, name: `${choice.name} (según el padrón)` } : choice,
  );
  const ivaCondition = await chooseStep(
    receiver?.name ? `Condición frente al IVA de ${receiver.name}:` : 'Condición frente al IVA del receptor:',
    choices,
    fromPadron ?? configDefault,
  );

  return ivaCondition === BACK ? BACK : { ivaCondition, receiver };
}

/** Nombre, domicilio y origen del IVA para la entrada del CLI: el PDF y la vista previa los muestran. */
export function receiverInputFields(
  state: ReceiverState & { readonly ivaCondition?: BillingIvaCondition },
): Pick<BillingCommandInput, 'ivaConditionSource' | 'receiverAddress' | 'receiverName'> {
  const receiver =
    state.documentType === 'cuit' && state.receiver?.cuit === state.documentNumber ? state.receiver : undefined;

  return {
    ivaConditionSource: receiver?.ivaCondition && receiver.ivaCondition === state.ivaCondition ? 'padron' : undefined,
    receiverAddress: receiver?.address,
    receiverName: receiver?.name,
  };
}
