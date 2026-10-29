import type { Arca } from '@arcasdk/core';

import { AppError } from '../../lib/errors/app-error';
import { resolveBillingCurrencyCode } from '../../modules/billing/billing.mappers';
import type {
  ParameterEntry,
  ParametersGateway,
  ParameterTable,
  Quotation,
  SalesPoint,
  ServerStatus,
} from '../../modules/parameters/parameters';

interface ArcaParameterRow {
  readonly cmp_Clase?: string;
  readonly desc: string;
  readonly fchHasta?: string;
  readonly id: number | string;
}

interface ArcaListResult {
  readonly errors?: { readonly err?: ReadonlyArray<{ readonly code: number; readonly msg: string }> };
  readonly resultGet?: Record<string, unknown>;
}

// "Sin Resultados": ARCA no tiene datos para informar (por ejemplo, puntos de venta en testing).
const NO_RESULTS_CODE = 602;

function readRows<T>(result: ArcaListResult, key: string, operation: string): T[] {
  const errors = result.errors?.err ?? [];

  if (errors.some((error) => error.code !== NO_RESULTS_CODE)) {
    throw new AppError(`ARCA devolvió un error al consultar ${operation}: ${errors.map((e) => e.msg).join('; ')}`, {
      code: 'ARCA_PARAMETERS_ERROR',
      details: { errores: errors },
    });
  }

  return (result.resultGet?.[key] as T[] | undefined) ?? [];
}

function toEntry(row: ArcaParameterRow): ParameterEntry {
  return {
    description: row.desc,
    detail: row.cmp_Clase,
    id: String(row.id),
    // ARCA informa "NULL" cuando el valor no vence.
    validTo: row.fchHasta && /^\d{8}$/.test(row.fchHasta) ? row.fchHasta : undefined,
  };
}

export class ArcaParametersGateway implements ParametersGateway {
  public constructor(private readonly arca: Arca) {}

  public async getServerStatus(): Promise<ServerStatus> {
    const status = await this.arca.electronicBillingService.getServerStatus();

    return { app: status.appServer, auth: status.authServer, db: status.dbServer };
  }

  public async getSalesPoints(): Promise<SalesPoint[]> {
    const result = (await this.arca.electronicBillingService.getSalesPoints()) as ArcaListResult;
    const rows = readRows<{ bloqueado: string; emisionTipo: string; fechaBaja?: string; nro: number }>(
      result,
      'ptoVenta',
      'los puntos de venta',
    );

    return rows.map((row) => ({
      blocked: row.bloqueado === 'S',
      closedOn: row.fechaBaja && /^\d{8}$/.test(row.fechaBaja) ? row.fechaBaja : undefined,
      emissionType: row.emisionTipo,
      number: row.nro,
    }));
  }

  public async getQuotation(currency: string): Promise<Quotation> {
    const code = resolveBillingCurrencyCode(currency);
    const result = await this.arca.electronicBillingService.getQuotation(code);
    const rate = result.resultGet?.monCotiz;

    if (typeof rate !== 'number' || rate <= 0) {
      throw new AppError(`ARCA no devolvió una cotización para ${currency}.`, {
        code: 'ARCA_QUOTATION_ERROR',
        details: { errors: result.errors },
      });
    }

    return { currency: code, date: result.resultGet?.fchCotiz, rate };
  }

  public async listTable(table: Exclude<ParameterTable, 'puntos-venta'>): Promise<ParameterEntry[]> {
    const service = this.arca.electronicBillingService;
    const sources: Record<typeof table, () => Promise<[ArcaListResult, string]>> = {
      alicuotas: async () => [await service.getAliquotTypes(), 'ivaTipo'],
      comprobantes: async () => [await service.getVoucherTypes(), 'cbteTipo'],
      conceptos: async () => [await service.getConceptTypes(), 'conceptoTipo'],
      documentos: async () => [await service.getDocumentTypes(), 'docTipo'],
      'iva-receptor': async () => [await service.getIvaReceptorTypes(), 'condicionIvaReceptor'],
      monedas: async () => [await service.getCurrencyTypes(), 'moneda'],
      opcionales: async () => [await service.getOptionalTypes(), 'opcionalTipo'],
      tributos: async () => [await service.getTaxTypes(), 'tributoTipo'],
    };
    const [result, key] = await sources[table]();

    return readRows<ArcaParameterRow>(result, key, table).map(toEntry);
  }
}
