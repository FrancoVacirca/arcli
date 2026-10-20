import { Command } from 'commander';
import { describe, expect, it } from 'vitest';

import { parseBillingCommandInput, registerBillingOptions } from '../../../cli/commands/billing.command.parser';
import { registerGlobalOptions } from '../../../cli/global-options';
import { type BillingCommandInput, billingCommandSchema } from '../../billing/billing.schemas';
import { buildEquivalentCommand } from '../equivalent-command';

function parseCommand(command: string, shortcut: BillingCommandInput['shortcut']): BillingCommandInput {
  const program = new Command();

  registerGlobalOptions(program);
  registerBillingOptions(program);
  program.exitOverride();
  program.parse(command.split(' ').slice(2), { from: 'user' });

  return parseBillingCommandInput(program, shortcut);
}

function input(overrides: Record<string, unknown>): BillingCommandInput {
  return billingCommandSchema.parse({
    concept: 'servicios',
    ivaCondition: 'consumidor-final',
    shortcut: 'fc',
    totalAmount: 1000,
    ...overrides,
  });
}

describe('buildEquivalentCommand', () => {
  it('arma el comando de una factura a consumidor final, con el entorno explicito', () => {
    expect(buildEquivalentCommand(input({}), { environment: 'testing' })).toBe(
      'arcli fc -m 1000 --cs --consumidor-final --ir consumidor-final --testing --emitir',
    );
  });

  it('agrega --produccion y los datos de FCE', () => {
    const command = buildEquivalentCommand(
      input({
        cbu: '0110599520000012345678',
        documentNumber: 30709965812,
        documentType: 'cuit',
        ivaCondition: 'responsable-inscripto',
        ivaRate: '10.5',
        shortcut: 'fcea',
        transferMode: 'adc',
      }),
      { environment: 'produccion' },
    );

    expect(command).toBe(
      'arcli fcea -m 1000 --cs --cuit 30709965812 --ir responsable-inscripto --alicuota 10.5 --cbu 0110599520000012345678 --transferencia adc --produccion --emitir',
    );
  });

  it('incluye la moneda extranjera', () => {
    expect(
      buildEquivalentCommand(input({ currencyCode: 'USD', exchangeRate: 1200 }), { environment: 'testing' }),
    ).toContain('--moneda USD --cm 1200');
    expect(
      buildEquivalentCommand(input({ currencyCode: 'USD', sameCurrency: true }), { environment: 'testing' }),
    ).toContain('--moneda USD --misma-moneda');
    expect(buildEquivalentCommand(input({}), { environment: 'testing' })).not.toContain('--moneda');
  });

  it('genera un comando que el parser vuelve a leer igual', () => {
    const original = input({
      associatedVoucher: { cuit: '20409509763', fecha: '01/10/2026', numero: 14, puntoVenta: 3, shortcut: 'fb' },
      cancellation: false,
      concept: 'productos',
      documentNumber: 12345678,
      documentType: 'dni',
      emit: true,
      shortcut: 'ncb',
      totalAmount: 1500.5,
    });
    const command = buildEquivalentCommand(original, { environment: 'testing' });
    const reparsed = parseCommand(command, 'ncb');

    expect({ ...reparsed, dryRun: false }).toEqual({ ...original, dryRun: false });
  });
});
