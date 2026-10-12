import { BACK } from '../../modules/interactive/wizard';
import { extractChangelog, fetchChangelog } from '../../modules/update-check/changelog';
import { renderUpdateDetails, UPDATE_COMMAND } from '../../modules/update-check/update-check.presenter';
import type { UpdateCheckResult } from '../../modules/update-check/update-check.service';
import { copyToClipboard } from '../../services/clipboard/clipboard';
import { noticePanel, writeTerminalOutput } from '../../ui';
import { startSpinner } from '../spinner';

import { chooseStep } from './prompts';

/**
 * Muestra la version nueva y sus novedades. Con "Cerrar para actualizar" copia el comando al portapapeles y
 * devuelve `true` para que el modo interactivo termine: arcli no se puede reemplazar a si mismo mientras corre.
 */
export async function runUpdateFlow(update: UpdateCheckResult): Promise<boolean> {
  const spinner = startSpinner('Buscando las novedades...');
  const markdown = await fetchChangelog(update.latestVersion);

  spinner?.stop();
  writeTerminalOutput(
    renderUpdateDetails(
      update,
      markdown === undefined ? undefined : extractChangelog(markdown, update.currentVersion, update.latestVersion),
    ),
  );

  // "← Volver" (o Esc) lo agrega chooseStep, igual que en el resto de los menus.
  if ((await chooseStep('¿Actualizamos?', [{ name: 'Cerrar para actualizar', value: 'cerrar' }])) === BACK) {
    return false;
  }

  writeTerminalOutput(
    copyToClipboard(UPDATE_COMMAND)
      ? noticePanel(`Comando copiado. Pegalo en la terminal y apreta Enter:\n${UPDATE_COMMAND}`, 'success')
      : noticePanel(`No se pudo copiar el comando. Ejecutalo en la terminal:\n${UPDATE_COMMAND}`, 'warning'),
  );

  return true;
}
