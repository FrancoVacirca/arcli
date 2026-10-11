import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { parseConfigValue } from '../config-value-parser';

const temporaryDirectories: string[] = [];

function writePemFile(filename: string, content: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'arcli-config-value-parser-'));

  temporaryDirectories.push(directory);

  const fullPath = join(directory, filename);

  writeFileSync(fullPath, content, 'utf8');

  return fullPath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('config-value-parser', () => {
  it('parses simple enum-backed keys', () => {
    expect(parseConfigValue('conceptoPorDefecto', 'Servicios')).toBe('servicios');
    expect(parseConfigValue('entornoPorDefecto', 'PRODUCCION')).toBe('produccion');
    expect(parseConfigValue('ivaReceptorPorDefecto', 'consumidor-final')).toBe('consumidor-final');
  });

  it('rejects values outside of the supported enums', () => {
    expect(() => parseConfigValue('entornoPorDefecto', 'demo')).toThrow();
    expect(() => parseConfigValue('conceptoPorDefecto', 'cosas')).toThrow();
    expect(() => parseConfigValue('ivaReceptorPorDefecto', 'algo-raro')).toThrow();
  });

  it('normalizes the currency code to uppercase', () => {
    expect(parseConfigValue('monedaPorDefecto', 'usd')).toBe('USD');
  });

  it('parses booleans accepting the spanish and numeric aliases', () => {
    expect(parseConfigValue('output.emitirPorDefecto', 'true')).toBe(true);
    expect(parseConfigValue('output.jsonPorDefecto', 'si')).toBe(true);
    expect(parseConfigValue('output.brutoPorDefecto', '1')).toBe(true);
    expect(parseConfigValue('output.emitirPorDefecto', 'no')).toBe(false);
    expect(parseConfigValue('output.jsonPorDefecto', '0')).toBe(false);
  });

  it('rejects values that are not recognizable booleans', () => {
    expect(() => parseConfigValue('output.emitirPorDefecto', 'tal-vez')).toThrow(/no es un booleano valido/);
  });

  it('normalizes the default IVA rate', () => {
    expect(parseConfigValue('alicuotaPorDefecto', '10,5')).toBe('10.5');
    expect(parseConfigValue('alicuotaPorDefecto', '21%')).toBe('21');
    expect(() => parseConfigValue('alicuotaPorDefecto', '19')).toThrow(/general \(21\), reducida \(10\.5\)/);
  });

  it('validates the FCE CBU and its alias', () => {
    expect(parseConfigValue('cbu', ' 0110599520000012345678 ')).toBe('0110599520000012345678');
    expect(parseConfigValue('aliasCbu', 'mi.alias.cbu')).toBe('mi.alias.cbu');
    expect(() => parseConfigValue('cbu', '123')).toThrow(/debe tener 22 digitos/);
    expect(() => parseConfigValue('aliasCbu', 'abc')).toThrow(/entre 6 y 20/);
  });

  it('parses positive numbers and integers', () => {
    expect(parseConfigValue('cotizacionPorDefecto', '1.234,5')).toBe(1234.5);
    expect(parseConfigValue('cotizacionPorDefecto', '1452,123456')).toBe(1452.123456);
    expect(parseConfigValue('puntoVentaPorDefecto', '3')).toBe(3);
  });

  it('valida la cantidad de comprobantes por lista entre 1 y 50', () => {
    expect(parseConfigValue('comprobantesPorLista', ' 25 ')).toBe(25);
    expect(() => parseConfigValue('comprobantesPorLista', '0')).toThrow(/entre 1 y 50/);
    expect(() => parseConfigValue('comprobantesPorLista', '51')).toThrow(/entre 1 y 50/);
    expect(() => parseConfigValue('comprobantesPorLista', '2.5')).toThrow(/entre 1 y 50/);
  });

  it('rejects non-positive numbers and integers', () => {
    expect(() => parseConfigValue('cotizacionPorDefecto', '0')).toThrow(/tiene que ser mayor a 0/);
    expect(() => parseConfigValue('cotizacionPorDefecto', '1234.5')).toThrow(/use coma para los decimales/);
    expect(() => parseConfigValue('puntoVentaPorDefecto', '0')).toThrow(/no es un entero positivo valido/);
    expect(() => parseConfigValue('puntoVentaPorDefecto', 'abc')).toThrow(/no es un entero positivo valido/);
  });

  it('trims free-form string keys without transforming them', () => {
    expect(parseConfigValue('cuit', '  20123456789  ')).toBe('20123456789');
    expect(parseConfigValue('ticketPath', '  /ruta/a/tickets  ')).toBe('/ruta/a/tickets');
  });

  it('rejects empty free-form string keys', () => {
    expect(() => parseConfigValue('ticketPath', '   ')).toThrow(/no puede estar vacio/);
  });

  it('validates that cert and key paths exist and contain a valid PEM', () => {
    const certPath = writePemFile('cert.pem', '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----');
    const keyPath = writePemFile('key.pem', '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----');

    expect(parseConfigValue('cert.testing', certPath)).toBe(certPath);
    expect(parseConfigValue('key.produccion', keyPath)).toBe(keyPath);
  });

  it('rejects cert and key paths with invalid PEM content', () => {
    const invalidPath = writePemFile('invalid.pem', 'NOT-A-PEM');

    expect(() => parseConfigValue('cert.testing', invalidPath)).toThrow(/formato PEM invalido/);
    expect(() => parseConfigValue('key.testing', invalidPath)).toThrow(/formato PEM invalido/);
  });

  it('parses the PDF mode and folder', () => {
    expect(parseConfigValue('pdf', 'Siempre')).toBe('siempre');
    expect(() => parseConfigValue('pdf', 'a-veces')).toThrow();
    expect(parseConfigValue('pdfCarpeta', '/tmp/comprobantes')).toBe('/tmp/comprobantes');
  });

  it('requires the year in the start of activities date', () => {
    expect(parseConfigValue('emisor.inicioActividades', '1/03/2020')).toBe('20200301');
    expect(() => parseConfigValue('emisor.inicioActividades', '1/03')).toThrow(/D\/MM\/YYYY/);
  });

  it('accepts only existing PNG or JPG logos', () => {
    const logoPath = writePemFile('logo.png', 'png');
    const textPath = writePemFile('logo.txt', 'txt');

    expect(parseConfigValue('emisor.logo', logoPath)).toBe(logoPath);
    expect(() => parseConfigValue('emisor.logo', textPath)).toThrow(/PNG o JPG/);
    expect(() => parseConfigValue('emisor.logo', '/no/existe.png')).toThrow(/No se encontro el logo/);
  });

  it('rejects a browser path that does not exist', () => {
    expect(() => parseConfigValue('pdfNavegador', '/no/existe/chrome')).toThrow(/No se encontro el navegador/);
  });
});
