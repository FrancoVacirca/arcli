import type { Command } from 'commander';

import { AppError } from '../../lib/errors/app-error';
import { formatPadronAsJson, formatPadronAsText } from '../../modules/padron/padron.presenter';
import { ArcaClientFactory } from '../../services/arca/arca-client.factory';
import { ArcaPadronGateway } from '../../services/arca/arca-padron.gateway';
import { writeTerminalJson, writeTerminalOutput } from '../../ui';
import { resolveArcaRuntime } from '../arca-runtime';
import { getGlobalOptions, registerQueryOptions } from '../global-options';
import { configureSpanishHelp, createPadronHelp } from '../help';
import { startSpinner } from '../spinner';

import { parseCuitArgument } from './cuit-argument';

export function registerPadronCommand(program: Command): void {
  const command = program
    .command('padron')
    .argument('<cuit>', 'CUIT a consultar')
    .description('consultar en el padrón de ARCA el nombre, domicilio y condición IVA de un CUIT')
    .addHelpText('after', createPadronHelp());

  registerQueryOptions(command);
  configureSpanishHelp(command);

  command.action(async (rawCuit: string, _options: unknown, self: Command) => {
    const cuit = parseCuitArgument(rawCuit);
    const runtime = resolveArcaRuntime(getGlobalOptions(self));
    const spinner = runtime.outputJson ? null : startSpinner('Consultando el padrón...');

    try {
      const taxpayer = await new ArcaPadronGateway(new ArcaClientFactory().create(runtime)).getTaxpayer(cuit);

      spinner?.stop();

      if (!taxpayer) {
        throw new AppError(`El CUIT ${cuit} no figura en el padrón de ARCA (${runtime.environment}).`, {
          code: 'TAXPAYER_NOT_FOUND',
          suggestion:
            runtime.environment === 'testing'
              ? 'El padrón de testing tiene datos ficticios: probá con 20201797064.'
              : 'Revisá el número.',
        });
      }

      const report = { environment: runtime.environment, taxpayer };

      if (runtime.outputJson) {
        writeTerminalJson(formatPadronAsJson(report));

        return;
      }

      writeTerminalOutput(formatPadronAsText(report));
    } catch (error) {
      spinner?.stop();
      throw error;
    }
  });
}
