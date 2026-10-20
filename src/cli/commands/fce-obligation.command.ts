import type { Command } from 'commander';

import { formatDateAsArcaDate, parseArgentineDateInputAsArcaDate } from '../../lib/dates/arca-date';
import { formatFceObligationAsJson, formatFceObligationAsText } from '../../modules/fce/fce-obligation.presenter';
import { ArcaClientFactory } from '../../services/arca/arca-client.factory';
import { ArcaContextResolver } from '../../services/arca/arca-context.resolver';
import { ArcaFceObligationGateway } from '../../services/arca/arca-fce-obligation.gateway';
import { writeTerminalJson, writeTerminalOutput } from '../../ui';
import { configureSpanishHelp, createFceObligationHelp } from '../help';
import { startSpinner } from '../spinner';

import { getGlobalOptions, registerGlobalOptions } from './billing.command.shared';
import { parseCuitArgument } from './cuit-argument';

export function registerFceObligationCommand(program: Command): void {
  const command = program
    .command('fce-obligado')
    .argument('<cuit>', 'CUIT del receptor a consultar')
    .description('consultar si un receptor esta obligado a recibir Factura de Credito Electronica (FCE)')
    .option('-f, --fecha <fecha>', 'fecha de emision a consultar; por defecto hoy')
    .addHelpText('after', createFceObligationHelp());

  registerGlobalOptions(command);
  configureSpanishHelp(command);

  command.action(async (rawCuit: string, options: { fecha?: string }, self: Command) => {
    const cuit = parseCuitArgument(rawCuit);
    const issueDate = options.fecha
      ? parseArgentineDateInputAsArcaDate(options.fecha)
      : formatDateAsArcaDate(new Date());
    const runtime = new ArcaContextResolver({ options: getGlobalOptions(self) }).resolve();
    const spinner = runtime.outputJson ? null : startSpinner('Consultando ARCA...');

    try {
      const gateway = new ArcaFceObligationGateway(new ArcaClientFactory().create(runtime));
      const obligation = await gateway.getObligation(cuit, issueDate);
      const report = { cuit, environment: runtime.environment, issueDate, obligation };

      spinner?.stop();

      if (runtime.outputJson) {
        writeTerminalJson(formatFceObligationAsJson(report));

        return;
      }

      writeTerminalOutput(formatFceObligationAsText(report));
    } catch (error) {
      spinner?.stop();
      throw error;
    }
  });
}
