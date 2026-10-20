import { Separator } from '@inquirer/select';

import { formatCuit } from '../../lib/identity/format-cuit';
import { ConfigService } from '../../modules/config/config.service';
import { listMissingSetupKeys } from '../../modules/interactive/config-fields';
import { type ArcaHealth, checkArcaHealth } from '../../modules/parameters/health';
import { checkForUpdate, type UpdateCheckResult } from '../../modules/update-check/update-check.service';
import { ArcaParametersGateway } from '../../services/arca/arca-parameters.gateway';
import {
  colorize,
  formatCliError,
  noticePanel,
  renderLogo,
  statusBar,
  type UiTextColor,
  writeTerminalError,
  writeTerminalOutput,
} from '../../ui';
import { startSpinner } from '../spinner';
import type { GlobalCliOptions } from '../types';
import { CLI_VERSION } from '../version';

import { runConfigMenu, runGuidedSetup } from './config.flow';
import { runHistoryFlow } from './history.flow';
import { runInvoiceFlow } from './invoice.flow';
import { runNoteFlow } from './note.flow';
import { chooseOne, confirm, isPromptCancellation } from './prompts';
import { runRepeatFlow } from './repeat.flow';
import { createInteractiveSession, type InteractiveSession } from './session';
import { runStatusFlow } from './status.flow';
import { runUpdateFlow } from './update.flow';

type MenuOption =
  'actualizar' | 'config' | 'estado' | 'factura' | 'historial' | 'nota-credito' | 'nota-debito' | 'repetir' | 'salir';

function listMissingSetup(): string[] {
  const service = new ConfigService();

  try {
    service.ensureInitialized();

    return listMissingSetupKeys(service.getConfig());
  } finally {
    service.close();
  }
}

function resolveSession(options: GlobalCliOptions): InteractiveSession | undefined {
  try {
    return createInteractiveSession(options);
  } catch (error) {
    writeTerminalError(formatCliError(error, false));
    writeTerminalOutput(noticePanel('Revisala desde "Configuracion" en el menu.', 'warning'));

    return undefined;
  }
}

async function runOption(
  option: Exclude<MenuOption, 'actualizar' | 'salir'>,
  options: GlobalCliOptions,
): Promise<void> {
  if (option === 'config') {
    await runConfigMenu();

    return;
  }

  const session = resolveSession(options);

  if (!session) {
    return;
  }

  if (option === 'factura') await runInvoiceFlow(session);
  if (option === 'repetir') await runRepeatFlow(session);
  if (option === 'nota-credito') await runNoteFlow(session, 'credito');
  if (option === 'nota-debito') await runNoteFlow(session, 'debito');
  if (option === 'historial') await runHistoryFlow(session);
  if (option === 'estado') await runStatusFlow(session);
}

const HEALTH_LABELS: Record<ArcaHealth, readonly [label: string, color: UiTextColor]> = {
  'con-demoras': ['ARCA con demoras', 'warning'],
  'con-problemas': ['ARCA con problemas', 'danger'],
  funcionando: ['ARCA funcionando', 'success'],
  'sin-respuesta': ['ARCA sin respuesta', 'danger'],
};

function tryResolveSession(options: GlobalCliOptions): InteractiveSession | undefined {
  try {
    return createInteractiveSession(options);
  } catch {
    return undefined;
  }
}

/** La razon social, si es tan larga que no entra en la barra, se corta. */
const MAX_ISSUER_NAME_LENGTH = 32;

/**
 * Barra de estado: a la izquierda, quien emite (razon social, o el CUIT si no esta configurada) y el punto de
 * venta; a la derecha, como esta ARCA y el entorno, cada uno en su color.
 */
async function buildHeader(options: GlobalCliOptions): Promise<string> {
  const session = tryResolveSession(options);

  if (!session) {
    return statusBar([{ text: 'falta completar la configuracion' }], [{ color: 'muted', text: 'ARCA SIN VERIFICAR' }]);
  }

  const spinner = startSpinner('Consultando el estado de ARCA...');
  const health = await checkArcaHealth({ gateway: new ArcaParametersGateway(session.arca) });

  spinner?.stop();

  const [label, color] = HEALTH_LABELS[health];
  const { config, context, environment, pointOfSale } = session.runtime;

  return statusBar(
    [
      { text: formatIssuer(config.emisor?.razonSocial, context.cuit) },
      { text: `PV ${pointOfSale ?? 'sin configurar'}` },
    ],
    [
      { color, text: label.toUpperCase() },
      environment === 'produccion'
        ? { color: 'production', text: 'PRODUCCION' }
        : { color: 'testing', text: 'TESTING' },
    ],
    { rightSeparator: 'rule' },
  );
}

function formatIssuer(businessName: string | undefined, cuit: number): string {
  if (!businessName) {
    return formatCuit(cuit);
  }

  return businessName.length > MAX_ISSUER_NAME_LENGTH
    ? `${businessName.slice(0, MAX_ISSUER_NAME_LENGTH - 1).trimEnd()}…`
    : businessName;
}

function updateChoice(update: UpdateCheckResult) {
  const name = `Actualizar a la version ${update.latestVersion}`;

  return { name: colorize(name, 'highlight'), short: name, value: 'actualizar' as const };
}

/** Asistente paso a paso encima del CLI. Ctrl+C cancela el flujo actual; en el menu, sale. */
export async function runInteractiveMode(options: GlobalCliOptions = {}): Promise<void> {
  // En el modo interactivo se consulta npm siempre (no una vez por dia): la consulta va en paralelo con ARCA.
  const updatePromise = checkForUpdate(CLI_VERSION, { maxAgeMs: 0 }).catch(() => null);

  // Dos lineas en blanco entre el logo y la barra. La barra se escribe aparte porque, mientras se consulta ARCA,
  // en su lugar va el spinner. Debajo, una linea en blanco fija: al responder el menu, @inquirer saca las lineas
  // de su prefijo y sin esta la respuesta quedaria pegada a la barra (ver `compactTop` en el primer menu).
  process.stdout.write(`${renderLogo(CLI_VERSION).trimEnd()}\n\n\n`);
  process.stdout.write(`${await buildHeader(options)}\n\n`);

  const update = await updatePromise;
  // El menu va justo debajo de la barra solo la primera vez; despues, debajo de lo que mostro cada flujo.
  let menuUnderHeader = true;

  // Primera vez: sin CUIT, certificado o punto de venta no se puede hacer nada, asi que se ofrece la guia.
  if (listMissingSetup().length > 0) {
    menuUnderHeader = false;

    try {
      if (
        await confirm('Falta completar la configuracion. ¿La hacemos ahora, paso a paso?', 'Si, configurar', 'Despues')
      ) {
        await runGuidedSetup();
        writeTerminalOutput(await buildHeader(options));
        menuUnderHeader = true;
      }
    } catch (error) {
      if (!isPromptCancellation(error)) {
        throw error;
      }
    }
  }

  for (;;) {
    let option: MenuOption;

    try {
      option = await chooseOne<MenuOption>(
        '¿Que queres hacer?',
        [
          ...(update ? [updateChoice(update), new Separator(' ')] : []),
          { name: 'Emitir factura', value: 'factura' },
          {
            description: 'Copia una de las ultimas, con fechas nuevas',
            name: 'Repetir una factura anterior',
            value: 'repetir',
          },
          {
            description: 'Descuento, devolucion o anulacion de una factura',
            name: 'Emitir nota de credito',
            value: 'nota-credito',
          },
          { description: 'Cargo adicional sobre una factura', name: 'Emitir nota de debito', value: 'nota-debito' },
          {
            description: 'Los ultimos de cada tipo, o buscar uno por numero',
            name: 'Consultar comprobantes',
            value: 'historial',
          },
          { description: 'Servidores, punto de venta y cotizacion del dolar', name: 'Estado de ARCA', value: 'estado' },
          {
            description: 'Revisar, configuracion guiada, cambiar un dato y PDF',
            name: 'Configuracion',
            value: 'config',
          },
          new Separator(' '),
          { name: 'Salir', value: 'salir' },
        ],
        undefined,
        { compactTop: menuUnderHeader, escapeLabel: 'salir', escapeValue: 'salir' },
      );
      menuUnderHeader = false;
    } catch (error) {
      if (isPromptCancellation(error)) {
        break;
      }

      throw error;
    }

    if (option === 'salir') {
      break;
    }

    try {
      if (option === 'actualizar') {
        if (update && (await runUpdateFlow(update))) {
          return;
        }

        continue;
      }

      await runOption(option, options);
    } catch (error) {
      if (isPromptCancellation(error)) {
        writeTerminalOutput(colorize('Cancelado. No se emitio nada.', 'muted'));
      } else {
        writeTerminalError(formatCliError(error, false));
      }
    }
  }

  writeTerminalOutput(colorize('¡Hasta la proxima!', 'muted'));
}
