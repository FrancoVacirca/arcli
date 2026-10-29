export type VoucherLetter = 'a' | 'b' | 'c';

export type VoucherFamily =
  | 'factura'
  | 'nota-credito'
  | 'nota-debito'
  | 'factura-credito-electronica'
  | 'nota-credito-electronica'
  | 'nota-debito-electronica';

export type VoucherShortcut =
  | 'fa'
  | 'fb'
  | 'fc'
  | 'nca'
  | 'ncb'
  | 'ncc'
  | 'nda'
  | 'ndb'
  | 'ndc'
  | 'fcea'
  | 'fceb'
  | 'fcec'
  | 'ncea'
  | 'nceb'
  | 'ncec'
  | 'ndea'
  | 'ndeb'
  | 'ndec';

export type VoucherDisplayName =
  | 'Factura A'
  | 'Factura B'
  | 'Factura C'
  | 'Nota de crédito A'
  | 'Nota de crédito B'
  | 'Nota de crédito C'
  | 'Nota de débito A'
  | 'Nota de débito B'
  | 'Nota de débito C'
  | 'Factura de crédito electrónica A'
  | 'Factura de crédito electrónica B'
  | 'Factura de crédito electrónica C'
  | 'Nota de crédito electrónica A'
  | 'Nota de crédito electrónica B'
  | 'Nota de crédito electrónica C'
  | 'Nota de débito electrónica A'
  | 'Nota de débito electrónica B'
  | 'Nota de débito electrónica C';

export interface VoucherKindDefinition {
  readonly arcaType: number;
  readonly displayName: VoucherDisplayName;
  readonly family: VoucherFamily;
  readonly isElectronicCredit: boolean;
  readonly letter: VoucherLetter;
  readonly requiresAssociatedVoucher: boolean;
  readonly shortcut: VoucherShortcut;
}
