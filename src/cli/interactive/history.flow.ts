import { VOUCHER_KIND_MAP, VOUCHER_SHORTCUTS } from '../../modules/billing/voucher-kind-map';
import { BACK } from '../../modules/interactive/wizard';
import { formatVoucherDetailAsText } from '../../modules/vouchers/voucher-history.presenter';
import { writeTerminalOutput } from '../../ui';

import { pickInvoice } from './invoice-picker';
import { chooseStep } from './prompts';
import { type InteractiveSession, requirePointOfSale } from './session';

/**
 * Consultar comprobantes de cualquier tipo: la lista de los ultimos, cargar mas o buscar por numero.
 * Al elegir uno muestra el detalle y vuelve a la lista.
 */
export async function runHistoryFlow(session: InteractiveSession): Promise<void> {
  const pointOfSale = requirePointOfSale(session);

  if (!pointOfSale) {
    return;
  }

  const voucherKind = await chooseStep(
    '¿Qué comprobantes querés consultar?',
    VOUCHER_SHORTCUTS.map((shortcut) => ({
      name: `${VOUCHER_KIND_MAP[shortcut].displayName} (${shortcut})`,
      value: VOUCHER_KIND_MAP[shortcut],
    })),
  );

  if (voucherKind === BACK) {
    return;
  }

  await pickInvoice(session, {
    message: `¿Qué ${voucherKind.displayName} querés ver?`,
    onPick: (picked) =>
      writeTerminalOutput(
        formatVoucherDetailAsText({
          environment: session.runtime.environment,
          pointOfSale: picked.pointOfSale,
          voucher: picked.invoice,
          voucherKind,
        }),
      ),
    pointOfSale,
    voucherKind,
  });
}
