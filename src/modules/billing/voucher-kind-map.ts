import type { VoucherFamily, VoucherKindDefinition, VoucherLetter, VoucherShortcut } from './billing.types';

export const VOUCHER_KIND_MAP: Record<VoucherShortcut, VoucherKindDefinition> = {
  fa: {
    arcaType: 1,
    displayName: 'Factura A',
    family: 'factura',
    isElectronicCredit: false,
    letter: 'a',
    requiresAssociatedVoucher: false,
    shortcut: 'fa',
  },
  fb: {
    arcaType: 6,
    displayName: 'Factura B',
    family: 'factura',
    isElectronicCredit: false,
    letter: 'b',
    requiresAssociatedVoucher: false,
    shortcut: 'fb',
  },
  fc: {
    arcaType: 11,
    displayName: 'Factura C',
    family: 'factura',
    isElectronicCredit: false,
    letter: 'c',
    requiresAssociatedVoucher: false,
    shortcut: 'fc',
  },
  nca: {
    arcaType: 3,
    displayName: 'Nota de crédito A',
    family: 'nota-credito',
    isElectronicCredit: false,
    letter: 'a',
    requiresAssociatedVoucher: true,
    shortcut: 'nca',
  },
  ncb: {
    arcaType: 8,
    displayName: 'Nota de crédito B',
    family: 'nota-credito',
    isElectronicCredit: false,
    letter: 'b',
    requiresAssociatedVoucher: true,
    shortcut: 'ncb',
  },
  ncc: {
    arcaType: 13,
    displayName: 'Nota de crédito C',
    family: 'nota-credito',
    isElectronicCredit: false,
    letter: 'c',
    requiresAssociatedVoucher: true,
    shortcut: 'ncc',
  },
  nda: {
    arcaType: 2,
    displayName: 'Nota de débito A',
    family: 'nota-debito',
    isElectronicCredit: false,
    letter: 'a',
    requiresAssociatedVoucher: true,
    shortcut: 'nda',
  },
  ndb: {
    arcaType: 7,
    displayName: 'Nota de débito B',
    family: 'nota-debito',
    isElectronicCredit: false,
    letter: 'b',
    requiresAssociatedVoucher: true,
    shortcut: 'ndb',
  },
  ndc: {
    arcaType: 12,
    displayName: 'Nota de débito C',
    family: 'nota-debito',
    isElectronicCredit: false,
    letter: 'c',
    requiresAssociatedVoucher: true,
    shortcut: 'ndc',
  },
  fcea: {
    arcaType: 201,
    displayName: 'Factura de crédito electrónica A',
    family: 'factura-credito-electronica',
    isElectronicCredit: true,
    letter: 'a',
    requiresAssociatedVoucher: false,
    shortcut: 'fcea',
  },
  fceb: {
    arcaType: 206,
    displayName: 'Factura de crédito electrónica B',
    family: 'factura-credito-electronica',
    isElectronicCredit: true,
    letter: 'b',
    requiresAssociatedVoucher: false,
    shortcut: 'fceb',
  },
  fcec: {
    arcaType: 211,
    displayName: 'Factura de crédito electrónica C',
    family: 'factura-credito-electronica',
    isElectronicCredit: true,
    letter: 'c',
    requiresAssociatedVoucher: false,
    shortcut: 'fcec',
  },
  ncea: {
    arcaType: 203,
    displayName: 'Nota de crédito electrónica A',
    family: 'nota-credito-electronica',
    isElectronicCredit: true,
    letter: 'a',
    requiresAssociatedVoucher: true,
    shortcut: 'ncea',
  },
  nceb: {
    arcaType: 208,
    displayName: 'Nota de crédito electrónica B',
    family: 'nota-credito-electronica',
    isElectronicCredit: true,
    letter: 'b',
    requiresAssociatedVoucher: true,
    shortcut: 'nceb',
  },
  ncec: {
    arcaType: 213,
    displayName: 'Nota de crédito electrónica C',
    family: 'nota-credito-electronica',
    isElectronicCredit: true,
    letter: 'c',
    requiresAssociatedVoucher: true,
    shortcut: 'ncec',
  },
  ndea: {
    arcaType: 202,
    displayName: 'Nota de débito electrónica A',
    family: 'nota-debito-electronica',
    isElectronicCredit: true,
    letter: 'a',
    requiresAssociatedVoucher: true,
    shortcut: 'ndea',
  },
  ndeb: {
    arcaType: 207,
    displayName: 'Nota de débito electrónica B',
    family: 'nota-debito-electronica',
    isElectronicCredit: true,
    letter: 'b',
    requiresAssociatedVoucher: true,
    shortcut: 'ndeb',
  },
  ndec: {
    arcaType: 212,
    displayName: 'Nota de débito electrónica C',
    family: 'nota-debito-electronica',
    isElectronicCredit: true,
    letter: 'c',
    requiresAssociatedVoucher: true,
    shortcut: 'ndec',
  },
};

export const VOUCHER_SHORTCUTS = Object.freeze(Object.keys(VOUCHER_KIND_MAP) as VoucherShortcut[]);
export const VOUCHER_FAMILIES = Object.freeze(
  Array.from(new Set(VOUCHER_SHORTCUTS.map((shortcut) => VOUCHER_KIND_MAP[shortcut].family))),
) as readonly VoucherFamily[];
export const VOUCHER_LETTERS = Object.freeze(['a', 'b', 'c'] as const);

export function getVoucherKindByShortcut(shortcut: string): VoucherKindDefinition | null {
  return VOUCHER_KIND_MAP[shortcut as VoucherShortcut] ?? null;
}

export function getVoucherKindByFamilyAndLetter(
  family: VoucherFamily,
  letter: VoucherLetter,
): VoucherKindDefinition | null {
  return (
    VOUCHER_SHORTCUTS.map((shortcut) => VOUCHER_KIND_MAP[shortcut]).find(
      (definition) => definition.family === family && definition.letter === letter,
    ) ?? null
  );
}

export function getVoucherKindByArcaType(arcaType: number): VoucherKindDefinition | null {
  return (
    VOUCHER_SHORTCUTS.map((shortcut) => VOUCHER_KIND_MAP[shortcut]).find(
      (definition) => definition.arcaType === arcaType,
    ) ?? null
  );
}

export function isVoucherShortcut(value: string): value is VoucherShortcut {
  return value in VOUCHER_KIND_MAP;
}
