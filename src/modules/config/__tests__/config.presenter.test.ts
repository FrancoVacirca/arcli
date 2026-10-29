import { describe, expect, it } from 'vitest';

import { stripAnsi } from '../../../ui';
import { formatConfig, formatConfigAsText, formatConfigDoctor, formatConfigDoctorAsText } from '../config.presenter';
import { buildConfigDoctorReport } from '../config-doctor';

describe('config.presenter', () => {
  it('masks certificate and key paths in config output', () => {
    const text = formatConfigAsText(
      {
        cert: {
          testing: '/Users/lucas/secretos/cert.pem',
        },
        emisor: {},
        entornoPorDefecto: 'testing',
        key: {
          testing: '/Users/lucas/secretos/key.pem',
        },
        output: {
          emitirPorDefecto: false,
          brutoPorDefecto: false,
          jsonPorDefecto: false,
        },
      },
      { pdfFolder: '/Users/lucas/arcli/comprobantes', ticketPath: '/Users/lucas/secretos/tickets' },
    );

    const json = formatConfig(
      {
        cert: {
          testing: '/Users/lucas/secretos/cert.pem',
        },
        emisor: {},
        entornoPorDefecto: 'testing',
        key: {
          testing: '/Users/lucas/secretos/key.pem',
        },
        output: {
          emitirPorDefecto: false,
          brutoPorDefecto: false,
          jsonPorDefecto: false,
        },
      },
      { pdfFolder: '/Users/lucas/arcli/comprobantes', ticketPath: '/Users/lucas/secretos/tickets' },
    );

    expect(text).toContain('.../secretos/cert.pem');
    expect(text).toContain('.../secretos/key.pem');
    expect(text).toContain('.../secretos/tickets');
    expect(text).not.toContain('/Users/lucas/secretos/cert.pem');
    expect(json).toContain('.../secretos/cert.pem');
    expect(json).not.toContain('/Users/lucas/secretos/key.pem"');
    expect(json).not.toContain('/Users/lucas/secretos/tickets"');

    // Por secciones, en el orden del modo interactivo; los certificados van juntos con los tickets.
    const plain = stripAnsi(text);
    const order = ['Cuenta', 'Certificados', 'Al facturar', 'FCE', 'Datos del emisor', 'PDF', 'Salida y listados'];

    expect(order.map((title) => plain.indexOf(title))).toEqual(
      [...order.map((title) => plain.indexOf(title))].sort((a, b) => a - b),
    );
    expect(plain.indexOf('Carpeta de tickets WSAA')).toBeGreaterThan(plain.indexOf('Certificados'));
    expect(plain.indexOf('Carpeta de tickets WSAA')).toBeLessThan(plain.indexOf('Al facturar'));
  });

  it('serializes revision with masked runtime-friendly details', () => {
    const report = buildConfigDoctorReport(
      {
        cert: {
          testing: '/Users/lucas/secretos/cert.pem',
        },
        cuit: '20123456786',
        emisor: {},
        entornoPorDefecto: 'testing',
        key: {
          testing: '/Users/lucas/secretos/key.pem',
        },
        output: {
          emitirPorDefecto: false,
          jsonPorDefecto: false,
          brutoPorDefecto: false,
        },
      },
      [{ environment: 'testing', error: 'Falta el punto de venta.' }],
    );

    expect(formatConfigDoctor(report)).toContain('"etiqueta": "Validacion testing"');
    expect(formatConfigDoctorAsText(report)).toContain('REVISION DE CONFIGURACION');
    expect(formatConfigDoctorAsText(report)).toContain('Falta el punto de venta.');
  });
});
