import { InputValidationError } from '../../lib/errors/app-error';

/** Tablas de referencia de ARCA (wsfe) que se pueden consultar con `arcli parametros <tabla>`. */
export const PARAMETER_TABLES = {
  alicuotas: 'Alícuotas de IVA',
  comprobantes: 'Tipos de comprobante',
  conceptos: 'Conceptos',
  documentos: 'Tipos de documento',
  'iva-receptor': 'Condiciones de IVA del receptor',
  monedas: 'Monedas',
  opcionales: 'Datos opcionales',
  'puntos-venta': 'Puntos de venta',
  tributos: 'Tributos',
} as const;

export type ParameterTable = keyof typeof PARAMETER_TABLES;

export const PARAMETER_TABLE_NAMES = Object.keys(PARAMETER_TABLES) as ParameterTable[];

export interface ParameterEntry {
  /** Dato propio de la tabla: clase de comprobante en iva-receptor, "bloqueado" en puntos de venta. */
  readonly detail?: string;
  readonly description: string;
  readonly id: string;
  /** yyyymmdd; sin definir si no vence. */
  readonly validTo?: string;
}

export interface Quotation {
  readonly currency: string;
  /** yyyymmdd */
  readonly date?: string;
  readonly rate: number;
}

export interface ServerStatus {
  readonly app: string;
  readonly auth: string;
  readonly db: string;
}

export interface SalesPoint {
  readonly blocked: boolean;
  /** yyyymmdd */
  readonly closedOn?: string;
  readonly emissionType: string;
  readonly number: number;
}

export interface ParametersGateway {
  getQuotation(currency: string): Promise<Quotation>;
  getSalesPoints(): Promise<SalesPoint[]>;
  getServerStatus(): Promise<ServerStatus>;
  listTable(table: Exclude<ParameterTable, 'puntos-venta'>): Promise<ParameterEntry[]>;
}

export function resolveParameterTable(value: string): ParameterTable {
  const normalized = value.trim().toLowerCase();

  if (normalized in PARAMETER_TABLES) {
    return normalized as ParameterTable;
  }

  throw new InputValidationError(
    `La tabla "${value}" no existe. Usá una de estas: ${PARAMETER_TABLE_NAMES.join(', ')}, o "cotizacion <moneda>".`,
  );
}

/** ARCA devuelve tambien valores dados de baja: solo quedan los vigentes a `today` (yyyymmdd). */
export function filterCurrentEntries(entries: readonly ParameterEntry[], today: string): ParameterEntry[] {
  return entries.filter((entry) => !entry.validTo || entry.validTo >= today);
}

export function salesPointToEntry(point: SalesPoint): ParameterEntry {
  return {
    description: point.emissionType,
    detail: point.blocked ? 'bloqueado' : point.closedOn ? `de baja desde ${point.closedOn}` : 'habilitado',
    id: String(point.number),
    validTo: point.closedOn,
  };
}
