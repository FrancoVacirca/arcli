import { ConfigurationError, InputValidationError } from '../../lib/errors/app-error';
import { CERTIFICATE_GUIDE_URL } from '../../lib/links';
import type { ArcaRuntimeValidation } from '../../services/arca/arca-context.resolver';
import {
  badge,
  certificateBanner,
  colorize,
  contentPanel,
  formatCliError,
  highlightJsonValues,
  renderKeyValueRows,
  renderLogo,
  renderObject,
  renderPanel,
  resolveKeyValueLabelWidth,
  sectionHeading,
  statusBar,
  statusPanel,
  testingBanner,
  toneText,
  type UiBorderType,
  type UiTextColor,
} from '../../ui';
import { formatBillingResultAsJson, formatBillingResultAsText } from '../billing/billing.presenter';
import type { VoucherKindDefinition } from '../billing/billing.types';
import type { BillingExecutionResult } from '../billing/billing.types.internal';
import {
  formatConfig,
  formatConfigAsText,
  formatConfigDoctor,
  formatConfigDoctorAsText,
} from '../config/config.presenter';
import type { ArcliConfig } from '../config/config.schemas';
import { buildConfigDoctorReport } from '../config/config-doctor';
import { renderUpdateNoticePanel } from '../update-check/update-check.presenter';
import type { UpdateCheckResult } from '../update-check/update-check.service';

import { STORYBOOK_SHOWCASE_THEME } from './showcase-theme';

export type StorybookScene =
  'bordes' | 'colores' | 'componentes' | 'comprobantes' | 'configuracion' | 'errores' | 'json';

function createVoucherKind(partial: Partial<VoucherKindDefinition>): VoucherKindDefinition {
  return {
    arcaType: partial.arcaType ?? 11,
    displayName: partial.displayName ?? 'Factura C',
    family: partial.family ?? 'factura',
    isElectronicCredit: partial.isElectronicCredit ?? false,
    letter: partial.letter ?? 'c',
    requiresAssociatedVoucher: partial.requiresAssociatedVoucher ?? false,
    shortcut: partial.shortcut ?? 'fc',
  };
}

function createBillingResult(partial: Partial<BillingExecutionResult> = {}): BillingExecutionResult {
  return {
    dryRun: partial.dryRun ?? false,
    environment: partial.environment ?? 'produccion',
    payload: {
      CantReg: 1,
      CbteFch: '20260320',
      CbteTipo: 11,
      Concepto: 2,
      CondicionIVAReceptorId: 5,
      DocNro: 0,
      DocTipo: 99,
      FchServDesde: '20260320',
      FchServHasta: '20260320',
      FchVtoPago: '20260320',
      ImpIVA: 0,
      ImpNeto: 1,
      ImpOpEx: 0,
      ImpTotConc: 0,
      ImpTotal: 1,
      ImpTrib: 0,
      MonCotiz: 1,
      MonId: 'PES',
      PtoVta: 3,
      ...(partial.payload ?? {}),
    } as BillingExecutionResult['payload'],
    response: {
      cae: '86120020280000',
      caeVencimiento: '20260330',
      errors: [],
      events: [],
      observaciones: [],
      observacion: null,
      raw: {
        cae: '86120020280000',
        caeFchVto: '20260330',
        response: {
          FeDetResp: {
            FECAEDetResponse: [{ Resultado: 'A' }],
          },
        },
      } as BillingExecutionResult['response']['raw'],
      resultado: 'A',
      status: 'aprobado',
      suggestions: [],
      ...(partial.response ?? {}),
    },
    voucherKind: partial.voucherKind ?? createVoucherKind({}),
  };
}

function createSampleConfig(): ArcliConfig {
  return {
    cert: {
      produccion: '/Users/demo/.arcli/produccion/certificado.crt',
      testing: '/Users/demo/.arcli/testing/certificado.crt',
    },
    cuit: '20409509763',
    conceptoPorDefecto: 'servicios',
    cotizacionPorDefecto: 1,
    emisor: {},
    entornoPorDefecto: 'testing',
    ivaReceptorPorDefecto: 'consumidor-final',
    key: {
      produccion: '/Users/demo/.arcli/produccion/clave.key',
      testing: '/Users/demo/.arcli/testing/clave.key',
    },
    monedaPorDefecto: 'PES',
    output: {
      emitirPorDefecto: false,
      jsonPorDefecto: false,
      brutoPorDefecto: false,
    },
    puntoVentaPorDefecto: 3,
  };
}

function createSampleUpdateCheckResult(): UpdateCheckResult {
  return {
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
  };
}

function createSampleValidation(): ArcaRuntimeValidation {
  return {
    certPath: '/Users/demo/.arcli/testing/certificado.crt',
    cuit: 20409509763,
    environment: 'testing',
    keyPath: '/Users/demo/.arcli/testing/clave.key',
    outputJson: false,
    outputRaw: false,
    pointOfSale: 3,
    ticketPath: '/Users/demo/.arcli/tickets',
  };
}

function sceneTitle(title: string, subtitle?: string): string {
  return renderPanel({
    borderColor: STORYBOOK_SHOWCASE_THEME.borderColor,
    borderType: 'debug',
    content: [],
    subtitle,
    subtitleColor: 'debug',
    title,
    width: STORYBOOK_SHOWCASE_THEME.sceneWidth,
  });
}

function showcaseIndex(): string {
  return renderPanel({
    borderColor: STORYBOOK_SHOWCASE_THEME.borderColor,
    borderType: 'debug',
    content: [],
    subtitle: 'Galeria visual del CLI',
    subtitleColor: 'debug',
    title: 'Terminal Storybook',
    width: STORYBOOK_SHOWCASE_THEME.indexPanelWidth,
  });
}

function buildColorsScene(): string {
  return [
    sceneTitle('Colores UI', 'Paleta semantica y tono debug'),
    `${badge('OK', 'success')} ${toneText('Paneles base listos', 'success')}`,
    `${badge('INFO', 'info')} ${toneText('Paneles informativos y comandos', 'info')}`,
    `${badge('DATA', 'subtle')} ${toneText('JSON, respuesta bruta y eventos', 'subtle')}`,
    `${badge('WARN', 'warning')} ${toneText('Observaciones o sugerencias', 'warning')}`,
    `${badge('ERROR', 'danger')} ${toneText('Errores o bloqueos', 'danger')}`,
    `${badge('DEBUG', 'debug')} ${toneText('Storybook y debug visual', 'debug')}`,
  ].join('\n\n');
}

const BORDER_SAMPLES: ReadonlyArray<
  readonly [
    borderType: UiBorderType,
    title: string,
    description: string,
    color: UiTextColor | undefined,
    footer?: string,
  ]
> = [
  ['ticket', 'Factura', 'Comprobantes: vista previa y resultado', 'success', 'RESULTADO'],
  ['error', 'Error', 'Errores del CLI o de ARCA', 'danger'],
  ['attention', 'Observaciones', 'Observaciones de ARCA y avisos del regimen FCE', 'warning'],
  ['tip', 'Sugerencias', 'Sugerencias para resolver un problema', 'warning'],
  ['sheet', 'Configuracion', 'Fichas de consulta: configuracion y regimen FCE', 'info'],
  ['checklist', 'Revision', 'Revision de configuracion', 'success', 'VEREDICTO'],
  ['listing', 'Ultimos comprobantes', 'Listados en tabla, como los ultimos comprobantes', 'info'],
  ['note', 'Aviso', 'Avisos simples, por ejemplo "No se emitio nada"', undefined],
  ['warning', 'Testing', 'Banners del entorno de testing y del certificado por vencer', 'warning'],
  ['info', 'Nueva version', 'Aviso de nueva version disponible', 'info'],
  ['data', 'Billing json', 'JSON y respuestas crudas', 'subtle'],
  ['common', 'Contenido', 'Base para paneles sin estilo propio', undefined],
  ['debug', 'Storybook', 'Storybook y debug visual', 'debug'],
];

function buildBordersScene(): string {
  const boxes = BORDER_SAMPLES.map(([borderType, title, description, color, footer]) =>
    renderPanel({
      borderType,
      content: [description],
      footer,
      footerColor: color,
      footerDivider: Boolean(footer),
      title,
      titleColor: color,
      width: 'compact',
    }),
  );
  const command = renderPanel({
    borderType: 'command',
    content: [
      colorize('Esto equivale a:', 'muted'),
      'arcli fc -m 1000 --cs --consumidor-final --ir consumidor-final --emitir',
    ],
  });

  return [
    sceneTitle('Bordes', 'Un estilo por tipo de panel; ARCLI_ASCII=1 los cambia por ASCII'),
    ...boxes,
    `${colorize('Barra de estado (modo interactivo):', 'muted')}\n${statusBar(
      [{ text: '20-40950976-3' }, { text: 'PV 3' }],
      [
        { color: 'success', text: 'ARCA FUNCIONANDO' },
        { color: 'testing', text: 'TESTING' },
      ],
      { rightSeparator: 'rule' },
    )}`,
    `${colorize('Seccion (arcli ejemplos):', 'muted')}\n${sectionHeading('Factura C')}`,
    `${colorize('Comando para copiar:', 'muted')}\n${command}`,
  ].join('\n\n');
}

function buildBillingScene(): string {
  const preview = formatBillingResultAsText(
    createBillingResult({
      dryRun: true,
      response: {
        ...createBillingResult().response,
        raw: null,
        status: 'observado',
        resultado: null,
      },
    }),
  );

  const approved = formatBillingResultAsText(createBillingResult());

  const observed = formatBillingResultAsText(
    createBillingResult({
      response: {
        ...createBillingResult().response,
        observaciones: ['La CUIT receptora no existe en padron.'],
        observacion: 'La CUIT receptora no existe en padron.',
        raw: {
          response: {
            FeDetResp: {
              FECAEDetResponse: [{ Resultado: 'A' }],
            },
          },
        } as BillingExecutionResult['response']['raw'],
        status: 'observado',
        suggestions: ['Revise el CUIT del receptor o use uno valido de testing.'],
      },
      voucherKind: createVoucherKind({ displayName: 'Factura A', shortcut: 'fa', letter: 'a', arcaType: 1 }),
      payload: {
        ...createBillingResult().payload,
        CbteTipo: 1,
        DocTipo: 80,
        DocNro: 20123456786,
        CondicionIVAReceptorId: 1,
        ImpNeto: 0.83,
        ImpIVA: 0.17,
      } as BillingExecutionResult['payload'],
    }),
  );

  const rejected = formatBillingResultAsText(
    createBillingResult({
      response: {
        ...createBillingResult().response,
        cae: null,
        caeVencimiento: null,
        errors: [{ Code: 502, Msg: 'Error interno de base de datos - Autorizador CAE - Transacción Activa' }],
        raw: {
          response: {
            Errors: {
              Err: [{ Code: 502, Msg: 'Error interno de base de datos - Autorizador CAE - Transacción Activa' }],
            },
          },
        } as BillingExecutionResult['response']['raw'],
        resultado: 'R',
        status: 'rechazado',
        suggestions: ['ARCA devolvio un error transitorio. Espere unos segundos y vuelva a intentar la emision.'],
      },
    }),
  );

  const bruto = formatBillingResultAsText(createBillingResult(), { raw: true });

  return [
    sceneTitle('Comprobantes', 'Preview, aprobado, observado, rechazado y bruto'),
    preview,
    approved,
    observed,
    rejected,
    bruto,
  ].join('\n\n');
}

function buildConfigScene(): string {
  const config = createSampleConfig();
  const doctor = buildConfigDoctorReport(config, [{ environment: 'testing' }]);

  return [
    sceneTitle('Configuracion', 'Vista actual y revision'),
    formatConfigAsText(config, { pdfFolder: '~/arcli/comprobantes', ticketPath: createSampleValidation().ticketPath }),
    formatConfigDoctorAsText(doctor),
  ].join('\n\n');
}

function buildErrorScene(): string {
  return [
    sceneTitle('Errores', 'Configuracion, entrada y error inesperado'),
    formatCliError(
      new ConfigurationError('Falta la ruta de la clave privada para testing.', {
        path: '/Users/demo/.arcli/testing/clave.key',
      }),
      false,
    ),
    formatCliError(new InputValidationError('Falta el concepto.'), false),
    formatCliError(new Error('Fallo inesperado de red.'), false),
  ].join('\n\n');
}

function buildJsonScene(): string {
  const billingJson = highlightJsonValues(formatBillingResultAsJson(createBillingResult(), { raw: true }));
  const configJson = highlightJsonValues(
    formatConfig(createSampleConfig(), {
      pdfFolder: '~/arcli/comprobantes',
      ticketPath: createSampleValidation().ticketPath,
    }),
  );
  const doctorJson = highlightJsonValues(
    formatConfigDoctor(buildConfigDoctorReport(createSampleConfig(), [{ environment: 'testing' }])),
  );

  return [
    sceneTitle('Json', 'Contratos estructurados para automatizacion y respuesta bruta'),
    contentPanel('Billing json', billingJson, 'wide', 'subtle', 'left', 'data'),
    contentPanel('Config json', configJson, 'wide', 'subtle', 'left', 'data'),
    contentPanel('Doctor json', doctorJson, 'wide', 'subtle', 'left', 'data'),
  ].join('\n\n');
}

function buildComponentsScene(): string {
  const notice = testingBanner();
  const certificateNotice = certificateBanner({
    expired: false,
    guideUrl: CERTIFICATE_GUIDE_URL,
    summary: 'El certificado de produccion vence el 20/11/2026 (en 10 días).',
  });
  const expiredCertificateNotice = certificateBanner({
    expired: true,
    guideUrl: CERTIFICATE_GUIDE_URL,
    summary: 'El certificado de produccion venció el 20/11/2026.',
  });
  const updateNotice = renderUpdateNoticePanel(createSampleUpdateCheckResult());
  const keyValueRows: Array<readonly [string, string | number]> = [
    ['CUIT', '20-40950976-3'],
    ['Punto de venta', 3],
    ['Entorno', 'testing'],
  ];
  const statusRows: Array<readonly [string, string | number]> = [
    ['CAE', '86120020280000'],
    ['Importe total', '1$'],
    ['Errores', 0],
  ];
  const demoLabelWidth = resolveKeyValueLabelWidth('compact', [...keyValueRows, ...statusRows]);
  const keyValue = renderPanel({
    content: renderKeyValueRows(keyValueRows, { labelWidth: demoLabelWidth }),
    contentAlign: 'left',
    footer: toneText('TODO LISTO', 'success'),
    footerColor: 'success',
    footerDivider: true,
    padding: {
      bottom: 1,
      left: 2,
      right: 2,
      top: 1,
    },
    title: 'Demo key value',
    width: 'compact',
  });

  const status = statusPanel(
    'Demo estado',
    [
      ...renderKeyValueRows(statusRows.slice(0, 2), { labelWidth: demoLabelWidth }),
      '',
      ...renderKeyValueRows(statusRows.slice(2), { labelWidth: demoLabelWidth }),
    ],
    'APROBADO',
    'compact',
    'success',
  );

  const content = contentPanel(
    'Demo contenido',
    renderObject({
      cae: '86120020280000',
      resultado: 'A',
      payload: { CbteTipo: 11, ImpTotal: 1, PtoVta: 3 },
    }),
    'wide',
    'info',
  );

  return [
    sceneTitle('Componentes', 'Notice, badges y paneles base'),
    notice,
    certificateNotice,
    expiredCertificateNotice,
    updateNotice,
    keyValue,
    status,
    content,
  ].join('\n\n');
}

export function renderStorybookShowcase(scene?: StorybookScene): string {
  const logo = renderLogo().trim();

  const scenes: Record<StorybookScene, string> = {
    bordes: buildBordersScene(),
    colores: buildColorsScene(),
    componentes: buildComponentsScene(),
    comprobantes: buildBillingScene(),
    configuracion: buildConfigScene(),
    errores: buildErrorScene(),
    json: buildJsonScene(),
  };

  if (!scene) {
    return [
      showcaseIndex(),
      logo,
      scenes.colores,
      scenes.bordes,
      scenes.componentes,
      scenes.configuracion,
      scenes.comprobantes,
      scenes.json,
      scenes.errores,
    ].join('\n\n');
  }

  return scenes[scene];
}
