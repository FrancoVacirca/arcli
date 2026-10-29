import { describe, expect, it } from 'vitest';

import { formatBillingResultAsJson, formatBillingResultAsText } from '../billing.presenter';
import { serializeBillingBatch } from '../billing.serialize';
import type { BillingExecutionResult } from '../billing.types.internal';

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function createResult(): BillingExecutionResult {
  return {
    dryRun: false,
    environment: 'produccion',
    payload: {
      CbteTipo: 1,
      ImpTotal: 15000,
      PtoVta: 3,
    } as never,
    response: {
      cae: '12345678901234',
      caeVencimiento: '20260331',
      errors: [],
      events: [],
      observaciones: [],
      observacion: null,
      raw: {
        cae: '12345678901234',
        response: {
          FeDetResp: {
            FECAEDetResponse: [
              {
                Resultado: 'A',
              },
            ],
          },
        },
      } as never,
      resultado: 'A',
      suggestions: [],
      status: 'aprobado',
    },
    voucherKind: {
      arcaType: 1,
      displayName: 'Factura A',
      family: 'factura',
      isElectronicCredit: false,
      letter: 'a',
      requiresAssociatedVoucher: false,
      shortcut: 'fa',
    },
  };
}

function createDryRunResult(): BillingExecutionResult {
  return {
    ...createResult(),
    dryRun: true,
    response: {
      ...createResult().response,
      raw: null,
    },
  };
}

describe('billing.presenter', () => {
  it('shows the emitted number in json and text, and leaves it null in a preview', () => {
    const emitted = { ...createResult(), voucherNumber: 125 };
    const json = JSON.parse(formatBillingResultAsJson(emitted)) as Record<string, unknown>;

    expect(json.numero).toBe(125);
    expect(json.solicitud).toMatchObject({ CbteDesde: 125, CbteHasta: 125, PtoVta: 3 });
    expect(stripAnsi(formatBillingResultAsText(emitted))).toContain('00003-00000125');
    expect((JSON.parse(formatBillingResultAsJson(createDryRunResult())) as Record<string, unknown>).numero).toBeNull();
  });

  it('renders a pretty summary by default in json', () => {
    const output = formatBillingResultAsJson(createResult());

    expect(output).toContain('"comprobante": "Factura A"');
    expect(output).toContain('"estado": "aprobado"');
    expect(output).toContain('"atajo": "fa"');
    expect(output).not.toContain('"respuesta"');
  });

  it('renders the raw response when requested in json', () => {
    const output = formatBillingResultAsJson(createResult(), { raw: true });

    expect(output).toContain('"respuesta"');
    expect(output).toContain('"cae": "12345678901234"');
    expect(output).toContain('"atajo": "fa"');
  });

  it('keeps the summary fields and adds the raw response with --bruto in json', () => {
    const summary = JSON.parse(formatBillingResultAsJson(createResult())) as Record<string, unknown>;
    const withRaw = JSON.parse(formatBillingResultAsJson(createResult(), { raw: true })) as Record<string, unknown>;

    expect(withRaw).toMatchObject({
      cae: '12345678901234',
      caeVencimiento: '20260331',
      errores: [],
      estado: 'aprobado',
      resultado: 'A',
    });
    expect(withRaw.respuesta).toEqual(createResult().response.raw);
    expect({ ...withRaw, respuesta: undefined }).toEqual({ ...summary, respuesta: undefined });
  });

  it('keeps the summary fields in a batch with --bruto', () => {
    const [first] = serializeBillingBatch([createResult()], { raw: true });

    expect(first).toMatchObject({ cae: '12345678901234', estado: 'aprobado', indice: 1 });
    expect(first).toHaveProperty('respuesta');
  });

  it('shows a friendly raw message when there was no real emission', () => {
    const output = formatBillingResultAsJson(createDryRunResult(), { raw: true });

    expect(output).toContain('Sin emisión real');
    expect(output).not.toContain('"respuesta": null');
  });

  it('renders payload and result in pretty text mode', () => {
    const output = formatBillingResultAsText(createResult());

    expect(output).toContain('Concepto');
    expect(output).toContain('APROBADO');
    expect(output).toContain('FACTURA A');
    expect(output).toContain('15.000$');
    expect(output).not.toContain('Estado');
  });

  it('renders a raw section in text mode when requested', () => {
    const output = stripAnsi(formatBillingResultAsText(createResult(), { raw: true }));

    expect(output).toContain('RESPUESTA BRUTA');
    expect(output).toContain('FACTURA A');
    expect(output).toContain('"Resultado": "A"');
  });

  it('keeps the result summary in text mode with --bruto and appends the raw panel', () => {
    const result = {
      ...createResult(),
      response: { ...createResult().response, observaciones: ['Observacion de prueba'] },
    };
    const output = stripAnsi(formatBillingResultAsText(result, { raw: true }));

    expect(output).toContain('APROBADO');
    expect(output).toContain('12345678901234');
    expect(output).toContain('Observacion de prueba');
    expect(output.indexOf('APROBADO')).toBeLessThan(output.indexOf('RESPUESTA BRUTA'));
  });

  it('avoids rendering null in raw text mode when there was no real emission', () => {
    const output = formatBillingResultAsText(createDryRunResult(), { raw: true });

    expect(output).toContain('SIN EMITIR');
    expect(output).toContain('FACTURA A');
    expect(output).not.toContain('Response');
    expect(output).not.toContain('\nnull\n');
  });

  it('uses friendly values without exposing internal numeric codes in dry-run preview', () => {
    const output = formatBillingResultAsText({
      ...createDryRunResult(),
      payload: {
        ...createDryRunResult().payload,
        CbteTipo: 11,
        Concepto: 2,
        CondicionIVAReceptorId: 5,
        DocTipo: 99,
      } as never,
      voucherKind: {
        ...createDryRunResult().voucherKind,
        arcaType: 11,
        displayName: 'Factura C',
        shortcut: 'fc',
      },
    });

    expect(output).toContain('FACTURA C');
    expect(output).toContain('Consumidor final');
    expect(output).toContain('Servicios');
    expect(output).not.toContain('Factura C (11)');
    expect(output).not.toContain('Consumidor final (99)');
  });

  it('shows a testing banner in text mode', () => {
    const output = formatBillingResultAsText({
      ...createResult(),
      environment: 'testing',
    });

    expect(output).toContain('Estas utilizando el entorno de TESTING');
  });

  it('formats dates with slashes in preview and response output', () => {
    const previewOutput = formatBillingResultAsText({
      ...createDryRunResult(),
      payload: {
        ...createDryRunResult().payload,
        CbteFch: '20260319',
      } as never,
    });
    const responseOutput = formatBillingResultAsText({
      ...createResult(),
      response: {
        ...createResult().response,
        caeVencimiento: '20260331',
      },
    });

    expect(previewOutput).toContain('19/03/2026');
    expect(responseOutput).toContain('31/03/2026');
  });

  it('avoids repeating the testing banner and preview after an interactive preview was already shown', () => {
    const output = formatBillingResultAsText(
      {
        ...createResult(),
        environment: 'testing',
        voucherKind: {
          ...createResult().voucherKind,
          displayName: 'Factura C',
          shortcut: 'fc',
        },
      },
      { previewShown: true },
    );

    expect(output).toContain('FACTURA C');
    expect(output).toContain('APROBADO');
    expect(output).not.toContain('Estas utilizando el entorno de TESTING');
    expect(output).not.toContain('Campo | Valor');
  });

  it('preserves multiline object indentation in events and errors panels', () => {
    const output = stripAnsi(
      formatBillingResultAsText({
        ...createResult(),
        response: {
          ...createResult().response,
          errors: [{ Code: 502, Msg: 'Error de prueba' }],
          events: [{ Code: 43, Msg: 'Evento de prueba multilinea' }],
        },
      }),
    );

    expect(output).toContain('EVENTOS');
    expect(output).toContain('ERRORES');
    // Eventos usa el borde de datos (┊) y Errores el de error (┃).
    expect(output).toContain('┊  [');
    expect(output).toContain('┊    {');
    expect(output).toContain('┊      "Code": 43,');
    expect(output).toContain('┃      "Code": 502,');
  });

  it('shows FCE warnings in text and JSON output', () => {
    const result = { ...createDryRunResult(), warnings: ['Corresponde emitir fcea en lugar de fa.'] };

    expect(stripAnsi(formatBillingResultAsText(result))).toContain('AVISOS');
    expect(stripAnsi(formatBillingResultAsText(result))).toContain('Corresponde emitir fcea en lugar de fa.');
    expect(JSON.parse(formatBillingResultAsJson(result)).avisos).toEqual(['Corresponde emitir fcea en lugar de fa.']);
    expect(JSON.parse(formatBillingResultAsJson(createResult())).avisos).toEqual([]);
  });
});
