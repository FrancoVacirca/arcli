import { keyValuePanel, renderKeyValueRows, resolveKeyValueLabelWidth } from '../../ui';
import { formatIvaConditionName } from '../pdf/pdf-issuer';

import type { Taxpayer } from './padron';

export interface PadronReport {
  readonly environment: 'produccion' | 'testing';
  readonly taxpayer: Taxpayer;
}

const PERSON_TYPE_LABELS: Record<NonNullable<Taxpayer['personType']>, string> = {
  fisica: 'Persona fisica',
  juridica: 'Persona juridica',
};

/** La primera es la principal (`orden` 1 en ARCA); el resto va en el JSON. */
function formatMainActivity(taxpayer: Taxpayer): string {
  const [main, ...others] = taxpayer.activities;
  const more = others.length === 0 ? '' : ` (y ${others.length} mas)`;

  return `${main?.description ?? '-'}${more}`;
}

export function formatPadronAsJson(report: PadronReport): string {
  const { taxpayer } = report;

  return JSON.stringify(
    {
      actividades: taxpayer.activities.map((activity) => ({ descripcion: activity.description, id: activity.id })),
      avisos: taxpayer.notices,
      categoriaMonotributo: taxpayer.monotributoCategory,
      condicionIva: taxpayer.ivaCondition,
      cuit: taxpayer.cuit,
      domicilio: taxpayer.address,
      entorno: report.environment,
      estadoClave: taxpayer.keyStatus,
      impuestos: taxpayer.taxes.map((tax) => ({ activo: tax.active, descripcion: tax.description, id: tax.id })),
      nombre: taxpayer.name,
      tipoPersona: taxpayer.personType,
    },
    null,
    2,
  );
}

export function formatPadronAsText(report: PadronReport): string {
  const { taxpayer } = report;
  const activeTaxes = taxpayer.taxes.filter((tax) => tax.active).map((tax) => tax.description);
  const rows: Array<readonly [string, string]> = [
    ['CUIT', String(taxpayer.cuit)],
    ['Nombre', taxpayer.name ?? '-'],
    ['Tipo', taxpayer.personType ? PERSON_TYPE_LABELS[taxpayer.personType] : '-'],
    ['Estado', taxpayer.keyStatus ?? '-'],
    ['Domicilio fiscal', taxpayer.address ?? '-'],
    ['Condicion IVA', taxpayer.ivaCondition ? formatIvaConditionName(taxpayer.ivaCondition) : 'sin informar'],
    ...(taxpayer.monotributoCategory ? [['Categoria monotributo', taxpayer.monotributoCategory] as const] : []),
    ...(activeTaxes.length > 0 ? [['Impuestos', activeTaxes.join(', ')] as const] : []),
    ...(taxpayer.activities.length > 0 ? [['Actividad principal', formatMainActivity(taxpayer)] as const] : []),
    ...taxpayer.notices.map((notice) => ['Aviso de ARCA', notice] as const),
  ];
  const footer = taxpayer.ivaCondition
    ? `Con --cuit ${taxpayer.cuit}, arcli completa solo el IVA receptor.`
    : 'El padron no informa la condicion IVA: indiquela con --ir al facturar.';

  return keyValuePanel(
    'Padron de ARCA',
    renderKeyValueRows(rows, { labelWidth: resolveKeyValueLabelWidth('standard', rows, [25, 75]) }),
    footer,
    'standard',
    undefined,
    'sheet',
  );
}
