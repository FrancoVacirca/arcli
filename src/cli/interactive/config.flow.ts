import { Separator } from '@inquirer/select';
import { join } from 'node:path';

import { CERTIFICATE_GUIDE_URL } from '../../lib/links';
import {
  formatCompletionResultAsText,
  formatCompletionStateAsText,
} from '../../modules/completion/completion.presenter';
import {
  currentCompletionEnvironment,
  detectShell,
  getCompletionState,
  installCompletion,
  uninstallCompletion,
} from '../../modules/completion/installer';
import { COMPLETION_SHELLS, type CompletionShell } from '../../modules/completion/shell-scripts';
import type { ArcliConfig, ConfigPublicKey } from '../../modules/config/config.schemas';
import { CONFIG_SECTIONS } from '../../modules/config/config.sections';
import { ConfigService, validateConfigValue } from '../../modules/config/config.service';
import { buildConfigDoctorReport } from '../../modules/config/config-doctor';
import {
  CONFIG_FIELDS,
  type ConfigField,
  describeConfigValue,
  getConfigField,
} from '../../modules/interactive/config-fields';
import { BACK, runWizard, type WizardStep } from '../../modules/interactive/wizard';
import { PdfPlugin } from '../../services/pdf/pdf-plugin';
import {
  bold,
  formatConfigAsText,
  formatConfigDoctorAsText,
  formatPdfPluginStatusAsText,
  noticePanel,
  writeTerminalOutput,
} from '../../ui';
import { buildRuntimeChecks } from '../commands/config.command';
import { startSpinner } from '../spinner';

import { askTextStep, type Choice, chooseOne, chooseStep, confirm, fitPageSize } from './prompts';

const CLEAR = '__borrar__';
const KEEP = '__mantener__';

/** Lo que pide la configuracion guiada, en orden. Los primeros cuatro son obligatorios para emitir. */
const GUIDED_KEYS: readonly ConfigPublicKey[] = [
  'cuit',
  'cert.testing',
  'key.testing',
  'puntoVenta',
  'concepto',
  'ivaReceptor',
];
const ISSUER_KEYS: readonly ConfigPublicKey[] = [
  'emisor.razonSocial',
  'emisor.domicilio',
  'emisor.inicioActividades',
  'emisor.iibb',
];

function withConfigService<T>(run: (service: ConfigService) => T): T {
  const service = new ConfigService();

  try {
    service.ensureInitialized();

    return run(service);
  } finally {
    service.close();
  }
}

function readConfig(): ArcliConfig {
  return withConfigService((service) => service.getConfig());
}

function validate(key: ConfigPublicKey, value: string): string | true {
  try {
    validateConfigValue(key, value);

    return true;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Pregunta un dato y lo guarda en el momento, asi cortar a mitad no pierde lo respondido.
 * Devuelve BACK, o si se guardo, borro o dejo como estaba.
 */
async function askField(
  field: ConfigField,
  config: ArcliConfig,
  options: { readonly required?: boolean } = {},
): Promise<'borrado' | 'guardado' | 'sin-cambios' | typeof BACK> {
  const current = field.read(config);
  let value: string;

  if (field.choices) {
    const answer = await chooseStep<string>(
      `${field.label}:`,
      [
        ...field.choices.map((choice) => ({ name: choice, value: choice })),
        ...(current && !options.required ? [{ name: 'Quitar el valor por defecto', value: CLEAR }] : []),
        ...(!current && !options.required ? [{ name: 'Dejar sin configurar', value: KEEP }] : []),
      ],
      current,
    );

    if (answer === BACK) {
      return BACK;
    }

    if (answer === KEEP) {
      return 'sin-cambios';
    }

    value = answer;
  } else {
    // Con un valor actual, Enter lo deja igual (es el default del prompt); "-" lo borra.
    const canClear = !options.required && Boolean(current);
    const hint = [field.hint, canClear ? '"-" para borrar' : undefined].filter(Boolean).join(', ');
    const answer = await askTextStep(`${field.label}${hint ? ` (${hint})` : ''}:`, {
      defaultValue: current,
      validate: (text) => {
        if (canClear && text.trim() === '-') {
          return true;
        }

        if (!text.trim()) {
          return options.required ? 'Este dato es obligatorio.' : true;
        }

        return validate(field.key, text);
      },
    });

    if (answer === BACK) {
      return BACK;
    }

    if (!answer.trim()) {
      return 'sin-cambios';
    }

    value = canClear && answer.trim() === '-' ? CLEAR : answer;
  }

  if (value === CLEAR) {
    withConfigService((service) => service.unsetValue(field.key));

    return 'borrado';
  }

  if (value === current) {
    return 'sin-cambios';
  }

  withConfigService((service) => service.setValue(field.key, value));

  return 'guardado';
}

function fieldSteps(keys: readonly ConfigPublicKey[], required: readonly ConfigPublicKey[]): Array<WizardStep<object>> {
  return keys.map((key) => ({
    name: key,
    run: async () => {
      if (key === 'cert.testing' && !readConfig().cert.testing) {
        writeTerminalOutput(
          noticePanel(`¿No tenés certificado todavía? Guía paso a paso: ${CERTIFICATE_GUIDE_URL}`, 'muted'),
        );
      }

      const result = await askField(getConfigField(key), readConfig(), { required: required.includes(key) });

      return result === BACK ? BACK : {};
    },
  }));
}

/** Configuracion guiada: lo minimo para emitir, los defaults mas usados y, si se quiere, los datos del PDF. */
export async function runGuidedSetup(): Promise<void> {
  writeTerminalOutput(
    noticePanel(
      `Vamos a dejar todo listo para emitir. Si todavía no tenés certificado, la guía esta en ${CERTIFICATE_GUIDE_URL}`,
      'info',
    ),
  );

  const completed = await runWizard(fieldSteps(GUIDED_KEYS, ['cuit', 'cert.testing', 'key.testing', 'puntoVenta']), {});

  if (!completed) {
    writeTerminalOutput(noticePanel('Configuración guiada cancelada. Lo ya respondido quedo guardado.', 'muted'));

    return;
  }

  if (await confirm('¿Cargamos también los datos del emisor para el PDF?', 'Si', 'Ahora no')) {
    await runWizard(fieldSteps(ISSUER_KEYS, []), {});
  }

  writeTerminalOutput(noticePanel('Configuración guardada. Ya podés emitir en testing.', 'success'));
}

/** Los datos agrupados por seccion, en el mismo orden que `arcli config`, con un titulo arriba de cada una. */
function fieldChoicesBySection(config: ArcliConfig): Array<Choice<ConfigField> | Separator> {
  const sections = CONFIG_SECTIONS.map((section) => ({
    fields: section.keys.flatMap((key) => CONFIG_FIELDS.filter((field) => field.key === key)),
    label: section.label,
  })).filter((section) => section.fields.length > 0);

  return sections.flatMap((section, index) => [
    ...(index > 0 ? [new Separator(' ')] : []),
    new Separator(bold(section.label)),
    ...section.fields.map((field) => ({
      description: describeConfigValue(field, config),
      name: field.label,
      value: field,
    })),
  ]);
}

/** Lista de datos por seccion; despues de cambiar uno (o volver) se muestra de nuevo, hasta "Volver". */
async function runChangeField(): Promise<void> {
  const messages = { borrado: 'Dato borrado.', guardado: 'Guardado.', 'sin-cambios': 'Sin cambios.' } as const;
  let lastField: ConfigField | undefined;

  for (;;) {
    const config = readConfig();
    const choices = fieldChoicesBySection(config);
    // +2: el separador y "Volver" que agrega chooseStep.
    const field = await chooseStep<ConfigField>(
      '¿Qué querés modificar?',
      choices,
      lastField,
      fitPageSize(choices.length + 2),
    );

    if (field === BACK) {
      return;
    }

    lastField = field;

    const result = await askField(field, config);

    if (result !== BACK) {
      writeTerminalOutput(noticePanel(messages[result], result === 'sin-cambios' ? 'muted' : 'success'));
    }
  }
}

async function runPdfPluginMenu(): Promise<void> {
  const plugin = withConfigService(
    (service) =>
      new PdfPlugin({
        configuredBrowser: service.getConfig().pdfNavegador,
        path: join(service.getPluginsPath(), 'pdf'),
      }),
  );
  const status = plugin.getStatus();

  writeTerminalOutput(formatPdfPluginStatusAsText(status));

  const action = await chooseStep<'desinstalar' | 'instalar'>('¿Qué hacemos con el plugin de PDF?', [
    status.installed
      ? { description: 'Borra el plugin y el navegador descargado', name: 'Desinstalar', value: 'desinstalar' }
      : {
          description: '~160 MB, o ~360 MB si no tenés Chrome',
          name: status.installedVersion ? 'Actualizar' : 'Instalar',
          value: 'instalar',
        },
  ]);

  if (action === BACK) {
    return;
  }

  if (action === 'desinstalar') {
    plugin.uninstall();
    writeTerminalOutput(noticePanel('Plugin de PDF desinstalado.', 'success'));

    return;
  }

  const spinner = startSpinner('Instalando el plugin de PDF...');

  try {
    await plugin.install((message) => {
      if (spinner) {
        spinner.text = message;
      }
    });
  } finally {
    spinner?.stop();
  }

  writeTerminalOutput(formatPdfPluginStatusAsText(plugin.getStatus(), 'Plugin de PDF instalado'));
}

async function runCompletionMenu(): Promise<void> {
  const environment = currentCompletionEnvironment();
  const shell =
    detectShell(environment.shell) ??
    (await chooseStep<CompletionShell>(
      '¿Qué shell usás?',
      COMPLETION_SHELLS.map((name) => ({ name, value: name })),
    ));

  if (shell === BACK) {
    return;
  }

  const state = getCompletionState(shell, environment);

  writeTerminalOutput(formatCompletionStateAsText(state, environment.home));

  const action = await chooseStep<'desinstalar' | 'instalar'>('¿Qué hacemos con el autocompletado?', [
    state.installed
      ? { description: 'Lo saca del archivo de inicio del shell', name: 'Desinstalar', value: 'desinstalar' }
      : {
          description: `Completa comandos y flags con Tab; se agrega a ${state.path.replace(environment.home, '~')}`,
          name: 'Instalar',
          value: 'instalar',
        },
  ]);

  if (action === BACK) {
    return;
  }

  const result = (action === 'instalar' ? installCompletion : uninstallCompletion)(shell, environment);

  writeTerminalOutput(formatCompletionResultAsText(result, environment.home));
}

type ConfigOption = 'cambiar' | 'completado' | 'guiada' | 'pdf' | 'revisar' | 'ver' | 'volver';

function showConfig(): void {
  withConfigService((service) => {
    const config = service.getConfig();

    writeTerminalOutput(formatConfigAsText(config, service.resolvePaths(config)));
  });
}

/** Submenu de configuracion: ver, revisar, configuracion guiada, modificar y el plugin de PDF. */
export async function runConfigMenu(): Promise<void> {
  for (;;) {
    const option = await chooseOne<ConfigOption>(
      'Configuración',
      [
        { description: 'Todos los datos guardados, como arcli config', name: 'Ver configuración', value: 'ver' },
        {
          description: 'Credenciales, defaults y validación contra ARCA',
          name: 'Revisar configuración',
          value: 'revisar',
        },
        {
          description: 'CUIT, certificado, punto de venta y defaults, paso a paso',
          name: 'Configuración guiada',
          value: 'guiada',
        },
        {
          description: 'Elegis un dato, agrupado por sección, y lo cambias',
          name: 'Modificar configuración',
          value: 'cambiar',
        },
        { description: 'Estado, instalar o desinstalar', name: 'Plugin de PDF', value: 'pdf' },
        {
          description: 'Completar comandos y flags con Tab en la terminal',
          name: 'Autocompletado',
          value: 'completado',
        },
        new Separator(' '),
        { name: '← Volver al menu', value: 'volver' },
      ],
      undefined,
      { escapeValue: 'volver' },
    );

    if (option === 'volver') {
      return;
    }

    if (option === 'ver') showConfig();

    if (option === 'revisar') {
      const config = readConfig();

      writeTerminalOutput(formatConfigDoctorAsText(buildConfigDoctorReport(config, buildRuntimeChecks(config))));
    }

    if (option === 'guiada') await runGuidedSetup();
    if (option === 'cambiar') await runChangeField();
    if (option === 'pdf') await runPdfPluginMenu();
    if (option === 'completado') await runCompletionMenu();
  }
}
