import type { Arca } from '@arcasdk/core';

import type { BillingCommandInput } from '../../modules/billing/billing.schemas';
import { BillingService } from '../../modules/billing/billing.service';
import type { BillingGateway } from '../../modules/billing/billing.types.internal';
import { buildEquivalentCommand } from '../../modules/interactive/equivalent-command';
import type { VoucherHistoryGateway } from '../../modules/vouchers/voucher-history';
import { ArcaBillingGateway } from '../../services/arca/arca-billing.gateway';
import { ArcaClientFactory } from '../../services/arca/arca-client.factory';
import { ArcaContextResolver, type ResolvedArcaRuntime } from '../../services/arca/arca-context.resolver';
import { ArcaFceObligationGateway } from '../../services/arca/arca-fce-obligation.gateway';
import { ArcaVoucherHistoryGateway } from '../../services/arca/arca-voucher-history.gateway';
import { colorize, noticePanel, renderPanel, writeTerminalOutput } from '../../ui';
import { formatBillingOutputs } from '../commands/billing.command.output';
import { startSpinner } from '../spinner';
import type { GlobalCliOptions } from '../types';

import { offerPdf } from './pdf.flow';
import { confirm } from './prompts';

export interface InteractiveSession {
  readonly arca: Arca;
  readonly billingGateway: BillingGateway;
  readonly historyGateway: VoucherHistoryGateway;
  readonly runtime: ResolvedArcaRuntime;
  readonly service: BillingService;
}

const PREVIEW_GATEWAY: BillingGateway = {
  createVoucher: async () => {
    throw new Error('La vista previa no emite comprobantes.');
  },
  getNextVoucherNumber: async () => {
    throw new Error('La vista previa no emite comprobantes.');
  },
  getQuotation: async () => {
    throw new Error('La vista previa no consulta cotizaciones.');
  },
};

/** Resuelve config y credenciales; si falta algo, el error explica que configurar. */
export function createInteractiveSession(options: GlobalCliOptions): InteractiveSession {
  const runtime = new ArcaContextResolver({ options }).resolve();
  const arca = new ArcaClientFactory().create(runtime);

  return {
    arca,
    billingGateway: new ArcaBillingGateway(arca),
    historyGateway: new ArcaVoucherHistoryGateway(arca),
    runtime,
    service: new BillingService(),
  };
}

export function requirePointOfSale(session: InteractiveSession): number | undefined {
  if (!session.runtime.pointOfSale) {
    writeTerminalOutput(
      noticePanel('Falta el punto de venta. Configuralo con "arcli config establecer puntoVenta <numero>".', 'warning'),
    );
  }

  return session.runtime.pointOfSale;
}

function formatEquivalentCommand(command: string): string {
  return renderPanel({
    borderType: 'command',
    content: [colorize('Esto equivale a:', 'muted'), '', colorize(command, 'info')],
    contentAlign: 'left',
    width: 'wide',
  });
}

/**
 * Paso final comun a todos los flujos: vista previa, comando equivalente, confirmacion y emision.
 * Usa BillingService igual que los comandos con flags, asi que valida y emite exactamente lo mismo.
 */
export async function previewAndEmit(session: InteractiveSession, rawInput: BillingCommandInput): Promise<void> {
  const { runtime, service } = session;
  // Con "me pagan en dolares" la cotizacion es la oficial de ARCA: se consulta antes de la vista previa.
  const resolved = await service.resolveExchangeRate(rawInput, session.billingGateway);
  const input: BillingCommandInput = { ...resolved, dryRun: true, emit: false };
  const warnings = runtime.config.verificarFce
    ? await service.resolveFceWarnings(input, new ArcaFceObligationGateway(session.arca))
    : [];
  const preview = await service.execute({ gateway: PREVIEW_GATEWAY, input, runtime, warnings });

  writeTerminalOutput(formatBillingOutputs([preview], { environment: runtime.environment, raw: false }));
  writeTerminalOutput(
    formatEquivalentCommand(
      buildEquivalentCommand(input, {
        defaultCurrency: runtime.config.monedaPorDefecto,
        environment: runtime.environment,
      }),
    ),
  );

  const label = preview.voucherKind.displayName;
  const environmentLabel = runtime.environment === 'produccion' ? 'PRODUCCION' : 'testing';

  if (!(await confirm(`¿Emitimos la ${label} en ${environmentLabel}?`, 'Emitir ahora'))) {
    writeTerminalOutput(noticePanel('No se emitio nada.', 'muted'));

    return;
  }

  if (
    runtime.environment === 'produccion' &&
    !(await confirm('Vas a emitir un comprobante real en PRODUCCION. ¿Confirmas?', 'Si, emitir en produccion'))
  ) {
    writeTerminalOutput(noticePanel('No se emitio nada.', 'muted'));

    return;
  }

  const spinner = startSpinner(`Emitiendo ${label} en ARCA...`);

  try {
    const result = await service.execute({
      gateway: session.billingGateway,
      input: { ...input, dryRun: false, emit: true },
      runtime,
      warnings,
    });

    spinner?.stop();
    writeTerminalOutput(
      formatBillingOutputs([result], { environment: runtime.environment, previewShown: true, raw: false }),
    );
    await offerPdf(runtime.config, input, result);
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}
