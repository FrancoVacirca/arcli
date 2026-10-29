import { describe, expect, it } from 'vitest';

import { resolveConceptShortcut, resolveDocumentIdentity, resolveIvaShortcut } from '../billing.command.shortcuts';

describe('billing.command.shortcuts', () => {
  describe('resolveIvaShortcut', () => {
    it('returns undefined when no shortcut flag is present', () => {
      expect(resolveIvaShortcut({})).toBeUndefined();
    });

    it('resolves a single shortcut flag to its IVA condition', () => {
      expect(resolveIvaShortcut({ irRi: true })).toBe('responsable-inscripto');
      expect(resolveIvaShortcut({ irCf: true })).toBe('consumidor-final');
    });

    it('rejects more than one --ir-* flag at the same time', () => {
      expect(() => resolveIvaShortcut({ irCf: true, irRi: true })).toThrow(
        /Use solo un flag de IVA receptor entre las opciones --ir-\*/,
      );
    });
  });

  describe('resolveDocumentIdentity', () => {
    it('returns an empty object when no identity flag is present', () => {
      expect(resolveDocumentIdentity({})).toEqual({});
    });

    it('resolves cuit, cuil and dni to their document type', () => {
      expect(resolveDocumentIdentity({ cuit: 20123456786 })).toEqual({
        documentNumber: 20123456786,
        documentType: 'cuit',
      });
      expect(resolveDocumentIdentity({ cuil: 20123456786 })).toEqual({
        documentNumber: 20123456786,
        documentType: 'cuil',
      });
      expect(resolveDocumentIdentity({ dni: 12345678 })).toEqual({
        documentNumber: 12345678,
        documentType: 'dni',
      });
    });

    it('resolves consumidorFinal and its cfinal alias to document number 0', () => {
      expect(resolveDocumentIdentity({ consumidorFinal: true })).toEqual({
        documentNumber: 0,
        documentType: 'consumidor-final',
      });
      expect(resolveDocumentIdentity({ cfinal: true })).toEqual({
        documentNumber: 0,
        documentType: 'consumidor-final',
      });
    });

    it('rejects mixing more than one receiver identity flag', () => {
      expect(() => resolveDocumentIdentity({ cuit: 20123456786, dni: 12345678 })).toThrow(
        /Use solo una identidad de receptor/,
      );
      expect(() => resolveDocumentIdentity({ cfinal: true, cuil: 20123456786 })).toThrow(
        /Use solo una identidad de receptor/,
      );
    });
  });

  describe('resolveConceptShortcut', () => {
    it('returns undefined when no shortcut flag is present', () => {
      expect(resolveConceptShortcut({})).toBeUndefined();
    });

    it('resolves each shortcut flag to its concept', () => {
      expect(resolveConceptShortcut({ cs: true })).toBe('servicios');
      expect(resolveConceptShortcut({ cp: true })).toBe('productos');
      expect(resolveConceptShortcut({ csp: true })).toBe('productos-servicios');
    });

    it('rejects more than one concept shortcut at the same time', () => {
      expect(() => resolveConceptShortcut({ cp: true, cs: true })).toThrow(
        /Use solo un flag de concepto entre --cs, --cp o --csp/,
      );
    });
  });
});
