import type { Command } from 'commander';

import { formatDateAsArcaDate } from '../../lib/dates/arca-date';
import { AppError, InputValidationError } from '../../lib/errors/app-error';
import { filterCurrentEntries, resolveParameterTable, salesPointToEntry } from '../../modules/parameters/parameters';
import {
  formatParameterEntriesAsJson,
  formatParameterEntriesAsText,
  formatParameterTablesAsJson,
  formatParameterTablesAsText,
  formatQuotationAsJson,
  formatQuotationAsText,
  formatStatusAsJson,
  formatStatusAsText,
} from '../../modules/parameters/parameters.presenter';
import { buildStatusReport } from '../../modules/parameters/status';
import { ArcaClientFactory } from '../../services/arca/arca-client.factory';
import { ArcaContextResolver, type ResolvedArcaRuntime } from '../../services/arca/arca-context.resolver';
import { ArcaParametersGateway } from '../../services/arca/arca-parameters.gateway';
import { writeTerminalJson, writeTerminalOutput } from '../../ui';
import { getGlobalOptions, registerQueryOptions, resolveOutputJson } from '../global-options';
import { configureSpanishHelp } from '../help';
import { startSpinner } from '../spinner';

function createContext(command: Command): {
  readonly gateway: ArcaParametersGateway;
  readonly runtime: ResolvedArcaRuntime;
} {
  const runtime = new ArcaContextResolver({ options: getGlobalOptions(command) }).resolve();

  return { gateway: new ArcaParametersGateway(new ArcaClientFactory().create(runtime)), runtime };
}

async function withSpinner<T>(runtime: ResolvedArcaRuntime, run: () => Promise<T>): Promise<T> {
  const spinner = runtime.outputJson ? null : startSpinner('Consultando ARCA...');

  try {
    return await run();
  } finally {
    spinner?.stop();
  }
}

function write(runtime: ResolvedArcaRuntime, text: string, json: string): void {
  if (runtime.outputJson) {
    writeTerminalJson(json);

    return;
  }

  writeTerminalOutput(text);
}

export function registerParametersCommands(program: Command): void {
  const parameters = program
    .command('parametros')
    .argument('[tabla]', 'tabla a consultar; sin tabla lista las disponibles')
    .argument('[moneda]', 'solo para "cotizacion": codigo de moneda, por ejemplo USD')
    .description('consultar tablas de ARCA: puntos de venta, tipos, alicuotas, monedas y cotizacion');

  registerQueryOptions(parameters);
  configureSpanishHelp(parameters);

  parameters.action(
    async (rawTable: string | undefined, currency: string | undefined, _options: unknown, self: Command) => {
      if (!rawTable) {
        // No consulta ARCA: no hace falta config ni credenciales para ver las tablas (si la config no se puede
        // leer, sale en texto salvo con --json).
        if (resolveOutputJson(self)) {
          writeTerminalJson(formatParameterTablesAsJson());
        } else {
          writeTerminalOutput(formatParameterTablesAsText());
        }

        return;
      }

      if (rawTable.trim().toLowerCase() === 'cotizacion') {
        if (!currency) {
          throw new InputValidationError('Indique la moneda, por ejemplo: arcli parametros cotizacion USD.');
        }

        const { gateway, runtime } = createContext(self);
        const quotation = await withSpinner(runtime, () => gateway.getQuotation(currency));

        write(
          runtime,
          formatQuotationAsText(quotation, runtime.environment),
          formatQuotationAsJson(quotation, runtime.environment),
        );

        return;
      }

      const table = resolveParameterTable(rawTable);
      const { gateway, runtime } = createContext(self);
      const entries = await withSpinner(runtime, async () =>
        table === 'puntos-venta'
          ? (await gateway.getSalesPoints()).map(salesPointToEntry)
          : filterCurrentEntries(await gateway.listTable(table), formatDateAsArcaDate(new Date())),
      );

      write(
        runtime,
        formatParameterEntriesAsText(table, entries, runtime.environment),
        formatParameterEntriesAsJson(table, entries, runtime.environment),
      );
    },
  );

  const status = program
    .command('estado')
    .description('ver si ARCA responde y si el punto de venta configurado esta habilitado');

  registerQueryOptions(status);
  configureSpanishHelp(status);

  status.action(async (_options: unknown, self: Command) => {
    const { gateway, runtime } = createContext(self);
    const report = await withSpinner(runtime, async () => {
      try {
        return await buildStatusReport({ environment: runtime.environment, gateway, pointOfSale: runtime.pointOfSale });
      } catch (error) {
        throw new AppError(`ARCA no respondio: ${error instanceof Error ? error.message : String(error)}`, {
          code: 'ARCA_UNAVAILABLE',
        });
      }
    });

    write(runtime, formatStatusAsText(report), formatStatusAsJson(report));
  });
}
