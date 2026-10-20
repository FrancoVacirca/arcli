import type { BillingIvaCondition } from '../billing/billing.schemas';

/** Impuestos del padron que definen la condicion frente al IVA. */
export const PADRON_TAX_IDS = {
  iva: 30,
  ivaExento: 32,
  monotributo: 20,
} as const;

export interface TaxpayerTax {
  readonly active: boolean;
  readonly description: string;
  readonly id: number;
}

export interface TaxpayerActivity {
  readonly description: string;
  readonly id: number;
}

/** Lo que ARCLI usa de la constancia de inscripcion (`ws_sr_constancia_inscripcion`). */
export interface Taxpayer {
  readonly activities: readonly TaxpayerActivity[];
  /** Domicilio fiscal en una linea, o null si el padron no lo informa. */
  readonly address: string | null;
  readonly cuit: number;
  /** Null si con los impuestos del padron no alcanza para saberla. */
  readonly ivaCondition: BillingIvaCondition | null;
  /** ACTIVO, INACTIVO... tal como lo informa ARCA. */
  readonly keyStatus: string | null;
  readonly monotributoCategory: string | null;
  /** Razon social, o apellido y nombre de una persona fisica. */
  readonly name: string | null;
  /** Avisos de la constancia (por ejemplo, domicilio fiscal no confirmado). */
  readonly notices: readonly string[];
  readonly personType: 'fisica' | 'juridica' | null;
  readonly taxes: readonly TaxpayerTax[];
}

export interface PadronGateway {
  /** Null si el CUIT no existe en el padron. */
  getTaxpayer(cuit: number): Promise<Taxpayer | null>;
}

/**
 * Condicion IVA a partir de los impuestos activos: monotributo, IVA (responsable inscripto) o IVA exento. Con
 * otros datos (por ejemplo, una persona sin impuestos) no se adivina: devuelve null.
 */
export function deriveIvaCondition(input: {
  readonly monotributo: boolean;
  readonly taxes: readonly TaxpayerTax[];
}): BillingIvaCondition | null {
  const isActive = (id: number) => input.taxes.some((tax) => tax.id === id && tax.active);

  if (input.monotributo || isActive(PADRON_TAX_IDS.monotributo)) {
    return 'responsable-monotributo';
  }

  if (isActive(PADRON_TAX_IDS.iva)) {
    return 'responsable-inscripto';
  }

  if (isActive(PADRON_TAX_IDS.ivaExento)) {
    return 'sujeto-exento';
  }

  return null;
}
