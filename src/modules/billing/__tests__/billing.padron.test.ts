import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../../lib/errors/app-error';
import type { PadronGateway, Taxpayer } from '../../padron/padron';
import { resolveIvaConditionFromPadron } from '../billing.padron';
import { type BillingCommandInput, billingCommandSchema } from '../billing.schemas';

const TAXPAYER: Taxpayer = {
  activities: [],
  address: 'LARREA 1, CP 1030',
  cuit: 20201797064,
  ivaCondition: 'responsable-inscripto',
  keyStatus: 'ACTIVO',
  monotributoCategory: null,
  name: 'VICTORIA CAROLINA DARIO',
  notices: [],
  personType: 'fisica',
  taxes: [],
};

function input(overrides: Partial<BillingCommandInput> = {}): BillingCommandInput {
  return billingCommandSchema.parse({
    concept: 'servicios',
    documentNumber: 20201797064,
    documentType: 'cuit',
    ivaCondition: 'consumidor-final',
    ivaConditionSource: 'default',
    shortcut: 'fa',
    totalAmount: 1000,
    ...overrides,
  });
}

const gateway = (getTaxpayer: PadronGateway['getTaxpayer']): PadronGateway => ({ getTaxpayer: vi.fn(getTaxpayer) });

describe('resolveIvaConditionFromPadron', () => {
  it('reemplaza el IVA de la config por el del padron y completa nombre y domicilio', async () => {
    const result = await resolveIvaConditionFromPadron(
      input(),
      gateway(async () => TAXPAYER),
    );

    expect(result.warnings).toEqual([]);
    expect(result.input).toMatchObject({
      ivaCondition: 'responsable-inscripto',
      ivaConditionSource: 'padron',
      receiverAddress: 'LARREA 1, CP 1030',
      receiverFromPadron: ['address', 'name'],
      receiverName: 'VICTORIA CAROLINA DARIO',
    });
  });

  it('no pisa el nombre que paso el usuario', async () => {
    const result = await resolveIvaConditionFromPadron(
      input({ receiverName: 'Mi cliente' }),
      gateway(async () => TAXPAYER),
    );

    expect(result.input.receiverName).toBe('Mi cliente');
    expect(result.input.receiverFromPadron).toEqual(['address']);
  });

  it('no consulta con IVA explicito ni sin CUIT', async () => {
    const lookup = gateway(async () => TAXPAYER);

    await resolveIvaConditionFromPadron(input({ ivaConditionSource: undefined }), lookup);
    await resolveIvaConditionFromPadron(input({ documentNumber: 12345678, documentType: 'dni' }), lookup);

    expect(lookup.getTaxpayer).not.toHaveBeenCalled();
  });

  it('si el padron no informa la condicion, sigue con la config y avisa', async () => {
    const result = await resolveIvaConditionFromPadron(
      input(),
      gateway(async () => ({ ...TAXPAYER, ivaCondition: null })),
    );

    expect(result.input).toMatchObject({ ivaCondition: 'consumidor-final', receiverName: 'VICTORIA CAROLINA DARIO' });
    expect(result.warnings).toEqual([
      'El padron de ARCA no informa la condicion IVA del CUIT 20201797064. Se usa el IVA receptor de la config: Consumidor Final.',
    ]);
  });

  it('si el servicio no esta autorizado, avisa como desactivar la consulta', async () => {
    const result = await resolveIvaConditionFromPadron(
      input(),
      gateway(async () => {
        throw new AppError('El certificado no esta autorizado.', { code: 'PADRON_SERVICE_NOT_AUTHORIZED' });
      }),
    );

    expect(result.warnings[0]).toMatch(/^No se pudo consultar el padron de ARCA \(El certificado no esta autorizado\)/);
    expect(result.warnings[0]).toContain('arcli config establecer consultarPadron false');
  });

  it('sin IVA en la config, que el padron no responda es un error de entrada', async () => {
    await expect(
      resolveIvaConditionFromPadron(
        input({ ivaConditionSource: 'missing' }),
        gateway(async () => null),
      ),
    ).rejects.toThrow(/Falta IVA receptor. El CUIT 20201797064 no figura en el padron de ARCA/);
  });
});
