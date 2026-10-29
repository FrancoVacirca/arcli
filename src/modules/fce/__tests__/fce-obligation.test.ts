import { describe, expect, it } from 'vitest';

import { VOUCHER_KIND_MAP } from '../../billing/voucher-kind-map';
import { evaluateFceObligation, shouldCheckFceObligation } from '../fce-obligation';

const obligated = { minimumAmount: 3_958_316, obligated: true };
const notObligated = { minimumAmount: 0, obligated: false };

describe('evaluateFceObligation', () => {
  it('avisa cuando una factura comun deberia ser FCE', () => {
    expect(evaluateFceObligation(obligated, VOUCHER_KIND_MAP.fa, 5_000_000)).toEqual([
      'El receptor está obligado a recibir FCE desde $3.958.316 y este monto lo supera. Corresponde emitir fcea en lugar de fa.',
    ]);
  });

  it('considera el monto minimo como incluido', () => {
    expect(evaluateFceObligation(obligated, VOUCHER_KIND_MAP.fb, 3_958_316)).toHaveLength(1);
  });

  it('no avisa en una factura comun por debajo del minimo', () => {
    expect(evaluateFceObligation(obligated, VOUCHER_KIND_MAP.fa, 1_000_000)).toEqual([]);
  });

  it('no avisa en una factura comun a un receptor no obligado', () => {
    expect(evaluateFceObligation(notObligated, VOUCHER_KIND_MAP.fa, 50_000_000)).toEqual([]);
  });

  it('avisa cuando se emite FCE a un receptor no obligado', () => {
    expect(evaluateFceObligation(notObligated, VOUCHER_KIND_MAP.fcea, 5_000_000)).toEqual([
      'Para este comprobante el receptor no está obligado a recibir FCE. Corresponde emitir fa en lugar de fcea.',
    ]);
  });

  it('avisa cuando se emite FCE por debajo del minimo', () => {
    expect(evaluateFceObligation(obligated, VOUCHER_KIND_MAP.fceb, 1_000)).toEqual([
      'Para este comprobante el monto es menor al mínimo del régimen ($3.958.316). Corresponde emitir fb en lugar de fceb.',
    ]);
  });

  it('no avisa cuando la FCE corresponde', () => {
    expect(evaluateFceObligation(obligated, VOUCHER_KIND_MAP.fcec, 4_000_000)).toEqual([]);
  });
});

describe('shouldCheckFceObligation', () => {
  it('solo aplica a facturas con CUIT del receptor', () => {
    expect(shouldCheckFceObligation({ documentNumber: 30709965812, documentType: 'cuit' }, VOUCHER_KIND_MAP.fa)).toBe(
      true,
    );
    expect(shouldCheckFceObligation({ documentNumber: 30709965812, documentType: 'cuit' }, VOUCHER_KIND_MAP.fcea)).toBe(
      true,
    );
    expect(shouldCheckFceObligation({ documentNumber: 30709965812, documentType: 'cuit' }, VOUCHER_KIND_MAP.nca)).toBe(
      false,
    );
    expect(shouldCheckFceObligation({ documentNumber: 12345678, documentType: 'dni' }, VOUCHER_KIND_MAP.fb)).toBe(
      false,
    );
    expect(shouldCheckFceObligation({ documentType: 'consumidor-final' }, VOUCHER_KIND_MAP.fb)).toBe(false);
  });
});
