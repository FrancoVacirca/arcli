import { AppError } from '../../lib/errors/app-error';

/**
 * Fallo la llamada que emite en ARCA (red, timeout, ARCA). No se sabe si el comprobante quedo autorizado:
 * pudo emitirse y perderse la respuesta. Reintentar sin verificar puede duplicarlo.
 */
export class EmissionUncertainError extends AppError {
  public constructor(options: { readonly cause: unknown; readonly pointOfSale: number; readonly shortcut: string }) {
    const reason = options.cause instanceof Error ? options.cause.message : String(options.cause);

    super(`No se pudo confirmar la emisión: ${reason}`, {
      code: 'EMISSION_UNCERTAIN',
      details: { causa: reason },
      suggestion: `Puede haberse emitido igual. Antes de reintentar, verificá con "arcli ultimos ${options.shortcut} --pv ${options.pointOfSale}": si figura, ya esta emitido y no hay que repetirlo.`,
    });
    this.name = 'EmissionUncertainError';
    this.cause = options.cause;
  }
}
