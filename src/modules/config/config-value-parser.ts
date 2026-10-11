import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseArgentineDateInputAsArcaDate } from '../../lib/dates/arca-date';
import { EXCHANGE_RATE_DECIMALS, parseArgentineAmount } from '../../lib/numbers/argentine-amount';
import { readPemFile } from '../../lib/security/pem';
import { IVA_RATE_HINT } from '../billing/billing.schemas';
import { MAX_RECENT_VOUCHERS } from '../vouchers/voucher-history';

import {
  arcliDefaultConceptSchema,
  arcliDefaultIvaConditionSchema,
  arcliDefaultIvaRateSchema,
  arcliEnvironmentSchema,
  arcliPdfModeSchema,
} from './config.schemas';

export type CanonicalConfigKey =
  | 'alicuotaPorDefecto'
  | 'aliasCbu'
  | 'comprobantesPorLista'
  | 'cbu'
  | 'cert.produccion'
  | 'cert.testing'
  | 'conceptoPorDefecto'
  | 'cotizacionPorDefecto'
  | 'cuit'
  | 'emisor.condicionIva'
  | 'emisor.domicilio'
  | 'emisor.iibb'
  | 'emisor.inicioActividades'
  | 'emisor.logo'
  | 'emisor.razonSocial'
  | 'entornoPorDefecto'
  | 'ivaReceptorPorDefecto'
  | 'key.produccion'
  | 'key.testing'
  | 'monedaPorDefecto'
  | 'output.emitirPorDefecto'
  | 'output.jsonPorDefecto'
  | 'output.brutoPorDefecto'
  | 'pdf'
  | 'pdfCarpeta'
  | 'pdfNavegador'
  | 'puntoVentaPorDefecto'
  | 'ticketPath'
  | 'verificarFce';

function parseBoolean(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'si' || normalizedValue === 'sí') {
    return true;
  }

  if (normalizedValue === 'false' || normalizedValue === '0' || normalizedValue === 'no') {
    return false;
  }

  throw new Error(`El valor "${value}" no es un booleano valido. Use true/false, si/no o 1/0.`);
}

function parseNonEmptyString(value: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error('El valor no puede estar vacio.');
  }

  return normalizedValue;
}

function parseIvaRate(value: string): string {
  const result = arcliDefaultIvaRateSchema.safeParse(value);

  if (!result.success) {
    throw new Error(`La alicuota "${value}" no es valida. Use ${IVA_RATE_HINT}.`);
  }

  return result.data;
}

function parseCbu(value: string): string {
  const normalizedValue = value.trim();

  if (!/^\d{22}$/.test(normalizedValue)) {
    throw new Error(`El CBU "${value}" no es valido: debe tener 22 digitos.`);
  }

  return normalizedValue;
}

function parseCbuAlias(value: string): string {
  const normalizedValue = value.trim();

  if (!/^[A-Za-z0-9.-]{6,20}$/.test(normalizedValue)) {
    throw new Error(`El alias "${value}" no es valido: debe tener entre 6 y 20 letras, numeros, puntos o guiones.`);
  }

  return normalizedValue;
}

function parsePositiveInteger(value: string): number {
  const parsedValue = Number.parseInt(value.trim(), 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`El valor "${value}" no es un entero positivo valido.`);
  }

  return parsedValue;
}

function parseRecentCount(value: string): number {
  const parsedValue = Number(value.trim());

  if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > MAX_RECENT_VOUCHERS) {
    throw new Error(`La cantidad "${value}" no es valida: tiene que ser un numero entre 1 y ${MAX_RECENT_VOUCHERS}.`);
  }

  return parsedValue;
}

function parseExchangeRate(value: string): number {
  const result = parseArgentineAmount(value, { maxDecimals: EXCHANGE_RATE_DECIMALS });

  if (!result.ok) {
    throw new Error(`La cotizacion "${value}" no es valida: ${result.reason}.`);
  }

  return result.value;
}

function parsePemPath(value: string, label: 'certificado' | 'clave privada'): string {
  const normalizedValue = parseNonEmptyString(value);

  readPemFile(normalizedValue, label);

  return normalizedValue;
}

// La fecha de inicio de actividades es vieja: se pide con anio para no completarla con el actual.
function parseFullDate(value: string): string {
  if (!/^\d{1,2}([-/])\d{1,2}\1(\d{2}|\d{4})$/.test(value.trim())) {
    throw new Error(`La fecha "${value}" no es valida. Use D/MM/YYYY, por ejemplo 1/03/2020.`);
  }

  return parseArgentineDateInputAsArcaDate(value);
}

function parseExistingFile(value: string, label: string): string {
  const path = resolve(parseNonEmptyString(value));

  if (!existsSync(path)) {
    throw new Error(`No se encontro ${label} en "${path}".`);
  }

  return path;
}

function parseLogoPath(value: string): string {
  const path = parseExistingFile(value, 'el logo');

  if (!/\.(png|jpe?g)$/i.test(path)) {
    throw new Error('El logo debe ser un archivo PNG o JPG.');
  }

  return path;
}

export function parseConfigValue(key: CanonicalConfigKey, value: string): boolean | number | string {
  switch (key) {
    case 'alicuotaPorDefecto':
      return parseIvaRate(value);
    case 'aliasCbu':
      return parseCbuAlias(value);
    case 'comprobantesPorLista':
      return parseRecentCount(value);
    case 'cbu':
      return parseCbu(value);
    case 'conceptoPorDefecto':
      return arcliDefaultConceptSchema.parse(value.trim().toLowerCase());
    case 'cotizacionPorDefecto':
      return parseExchangeRate(value);
    case 'cuit':
      return value.trim();
    case 'emisor.condicionIva':
      return arcliDefaultIvaConditionSchema.parse(value.trim().toLowerCase());
    case 'emisor.domicilio':
    case 'emisor.iibb':
    case 'emisor.razonSocial':
      return parseNonEmptyString(value);
    case 'emisor.inicioActividades':
      return parseFullDate(value);
    case 'emisor.logo':
      return parseLogoPath(value);
    case 'entornoPorDefecto':
      return arcliEnvironmentSchema.parse(value.trim().toLowerCase());
    case 'ivaReceptorPorDefecto':
      return arcliDefaultIvaConditionSchema.parse(value.trim().toLowerCase());
    case 'monedaPorDefecto':
      return value.trim().toUpperCase();
    case 'verificarFce':
    case 'output.emitirPorDefecto':
    case 'output.jsonPorDefecto':
    case 'output.brutoPorDefecto':
      return parseBoolean(value);
    case 'pdf':
      return arcliPdfModeSchema.parse(value.trim().toLowerCase());
    case 'pdfCarpeta':
      return resolve(parseNonEmptyString(value));
    case 'pdfNavegador':
      return parseExistingFile(value, 'el navegador');
    case 'puntoVentaPorDefecto':
      return parsePositiveInteger(value);
    case 'ticketPath':
      return parseNonEmptyString(value);
    case 'cert.produccion':
    case 'cert.testing':
      return parsePemPath(value, 'certificado');
    case 'key.produccion':
    case 'key.testing':
      return parsePemPath(value, 'clave privada');
    default:
      return parseNonEmptyString(value);
  }
}
