import type { Arca } from '@arcasdk/core';

import { AppError } from '../../lib/errors/app-error';
import type { FceObligation, FceObligationGateway } from '../../modules/fce/fce-obligation';

const NOT_AUTHORIZED_MESSAGE =
  'El certificado no está autorizado para el servicio wsfecred (Factura de Crédito Electrónica). Autorizalo igual que wsfe: en testing desde WSASS ("Crear autorizacion a servicio") y en producción desde el Administrador de Relaciones.';

function toIsoDate(arcaDate: string): string {
  return `${arcaDate.slice(0, 4)}-${arcaDate.slice(4, 6)}-${arcaDate.slice(6, 8)}`;
}

export class ArcaFceObligationGateway implements FceObligationGateway {
  public constructor(private readonly arca: Arca) {}

  public async getObligation(cuit: number, issueDate: string): Promise<FceObligation> {
    let output: Awaited<ReturnType<Arca['wsfecredService']['consultarMontoObligadoRecepcion']>>;

    try {
      output = await this.arca.wsfecredService.consultarMontoObligadoRecepcion({
        cuitConsultada: cuit,
        fechaEmision: toIsoDate(issueDate),
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('notAuthorized')) {
        throw new AppError(NOT_AUTHORIZED_MESSAGE, { code: 'FCE_SERVICE_NOT_AUTHORIZED' });
      }

      throw error;
    }

    const result = output.consultarMontoObligadoRecepcionReturn;
    const errors = result.arrayErrores?.codigoDescripcion ?? [];

    if (errors.length > 0) {
      throw new AppError(
        `ARCA no pudo informar si el receptor está obligado a FCE: ${errors.map((item) => `${item.codigo} ${item.descripcion}`).join('; ')}`,
        { code: 'FCE_OBLIGATION_ERROR', details: { errors } },
      );
    }

    return {
      minimumAmount: Number(result.montoDesde ?? 0),
      obligated: result.obligado === 'S',
    };
  }
}
