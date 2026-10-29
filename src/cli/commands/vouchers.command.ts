import type { Command } from 'commander';

import { AppError, InputValidationError } from '../../lib/errors/app-error';
import { parseStrictInteger } from '../../lib/numbers/strict-integer';
import type { VoucherKindDefinition } from '../../modules/billing/billing.types';
import { getVoucherKindByShortcut, VOUCHER_SHORTCUTS } from '../../modules/billing/voucher-kind-map';
import { listRecentVouchers, MAX_RECENT_VOUCHERS, RECENT_VOUCHERS_LIMIT } from '../../modules/vouchers/voucher-history';
import {
  formatVoucherDetailAsJson,
  formatVoucherDetailAsText,
  formatVoucherListAsJson,
  formatVoucherListAsText,
  formatVoucherNumber,
} from '../../modules/vouchers/voucher-history.presenter';
import { ArcaClientFactory } from '../../services/arca/arca-client.factory';
import type { ResolvedArcaRuntime } from '../../services/arca/arca-context.resolver';
import { ArcaVoucherHistoryGateway } from '../../services/arca/arca-voucher-history.gateway';
import { writeTerminalJson, writeTerminalOutput } from '../../ui';
import { resolveArcaRuntime } from '../arca-runtime';
import { getGlobalOptions, registerQueryOptions } from '../global-options';
import { configureSpanishHelp, createVoucherQueryHelp } from '../help';
import { integerOption } from '../option-parsers';
import { startSpinner } from '../spinner';

interface PointOfSaleOptions {
  readonly pv?: number;
  readonly puntoVenta?: number;
}

function requireVoucherKind(shortcut: string): VoucherKindDefinition {
  const voucherKind = getVoucherKindByShortcut(shortcut.trim().toLowerCase());

  if (!voucherKind) {
    throw new InputValidationError(
      `El tipo "${shortcut}" no es válido. Usá un atajo: ${VOUCHER_SHORTCUTS.join(', ')}.`,
    );
  }

  return voucherKind;
}

function requirePointOfSale(options: PointOfSaleOptions, runtime: ResolvedArcaRuntime): number {
  const pointOfSale = options.pv ?? options.puntoVenta ?? runtime.pointOfSale;

  if (!pointOfSale || !Number.isInteger(pointOfSale) || pointOfSale <= 0) {
    throw new InputValidationError(
      'Falta el punto de venta. Usá --pv <numero> o configuralo con "arcli config establecer puntoVenta <numero>".',
    );
  }

  return pointOfSale;
}

function createContext(command: Command): {
  readonly gateway: ArcaVoucherHistoryGateway;
  readonly runtime: ResolvedArcaRuntime;
} {
  const runtime = resolveArcaRuntime(getGlobalOptions(command));

  return { gateway: new ArcaVoucherHistoryGateway(new ArcaClientFactory().create(runtime)), runtime };
}

function addPointOfSaleOptions(command: Command): Command {
  return command
    .option('--pv <numero>', 'punto de venta; por defecto el de la config', integerOption('--pv'))
    .option('--punto-venta <numero>', 'punto de venta; por defecto el de la config', integerOption('--punto-venta'));
}

async function withSpinner<T>(runtime: ResolvedArcaRuntime, run: () => Promise<T>): Promise<T> {
  const spinner = runtime.outputJson ? null : startSpinner('Consultando ARCA...');

  try {
    return await run();
  } finally {
    spinner?.stop();
  }
}

export function registerVoucherQueryCommands(program: Command): void {
  const recent = addPointOfSaleOptions(
    program
      .command('ultimos')
      .argument('<tipo>', 'atajo del comprobante, por ejemplo fb, fc o nca')
      .description('listar los últimos comprobantes emitidos en ARCA')
      .option(
        '--cantidad <numero>',
        `cuantos comprobantes mostrar (1 a ${MAX_RECENT_VOUCHERS}; por defecto config.comprobantesPorLista o ${RECENT_VOUCHERS_LIMIT})`,
        integerOption('--cantidad'),
      ),
  ).addHelpText('after', createVoucherQueryHelp());

  registerQueryOptions(recent);
  configureSpanishHelp(recent);

  recent.action(async (shortcut: string, options: PointOfSaleOptions & { cantidad?: number }, self: Command) => {
    const voucherKind = requireVoucherKind(shortcut);
    const { cantidad } = options;

    if (cantidad !== undefined && (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_RECENT_VOUCHERS)) {
      throw new InputValidationError(`--cantidad tiene que ser un número entre 1 y ${MAX_RECENT_VOUCHERS}.`);
    }

    const { gateway, runtime } = createContext(self);
    const limit = cantidad ?? runtime.config.comprobantesPorLista ?? RECENT_VOUCHERS_LIMIT;
    const pointOfSale = requirePointOfSale(options, runtime);
    const vouchers = await withSpinner(runtime, () =>
      listRecentVouchers(gateway, pointOfSale, voucherKind.arcaType, { limit }),
    );
    const report = { environment: runtime.environment, pointOfSale, voucherKind, vouchers };

    if (runtime.outputJson) {
      writeTerminalJson(formatVoucherListAsJson(report));

      return;
    }

    writeTerminalOutput(formatVoucherListAsText(report));
  });

  const detail = addPointOfSaleOptions(
    program
      .command('consultar')
      .argument('<tipo>', 'atajo del comprobante, por ejemplo fb, fc o nca')
      .argument('<numero>', 'número del comprobante')
      .description('ver el detalle de un comprobante emitido en ARCA'),
  ).addHelpText('after', createVoucherQueryHelp());

  registerQueryOptions(detail);
  configureSpanishHelp(detail);

  detail.action(async (shortcut: string, rawNumber: string, options: PointOfSaleOptions, self: Command) => {
    const voucherKind = requireVoucherKind(shortcut);
    const number = parseStrictInteger(rawNumber);

    if (number === undefined || number <= 0) {
      throw new InputValidationError(`El número "${rawNumber}" no es válido: tiene que ser un entero positivo.`);
    }

    const { gateway, runtime } = createContext(self);
    const pointOfSale = requirePointOfSale(options, runtime);
    const voucher = await withSpinner(runtime, () => gateway.getVoucher(number, pointOfSale, voucherKind.arcaType));

    if (!voucher) {
      throw new AppError(
        `No existe la ${voucherKind.displayName} N° ${formatVoucherNumber(pointOfSale, number)} en ARCA (${runtime.environment}).`,
        { code: 'VOUCHER_NOT_FOUND' },
      );
    }

    const report = { environment: runtime.environment, pointOfSale, voucher, voucherKind };

    if (runtime.outputJson) {
      writeTerminalJson(formatVoucherDetailAsJson(report));

      return;
    }

    writeTerminalOutput(formatVoucherDetailAsText(report));
  });
}
