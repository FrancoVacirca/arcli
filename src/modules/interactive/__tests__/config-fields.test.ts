import { describe, expect, it } from 'vitest';

import type { ArcliConfig } from '../../config/config.schemas';
import { CONFIG_FIELDS, describeConfigValue, getConfigField, listMissingSetupKeys } from '../config-fields';
import { currentMonthPeriod, previousMonthPeriod } from '../periods';

const BASE = {
  cert: {},
  emisor: {},
  entornoPorDefecto: 'testing',
  key: {},
  output: { brutoPorDefecto: false, emitirPorDefecto: false, jsonPorDefecto: false },
} satisfies ArcliConfig;

describe('config-fields', () => {
  it('lists what is missing to emit', () => {
    expect(listMissingSetupKeys(BASE)).toEqual(['cuit', 'cert.testing', 'key.testing', 'puntoVenta']);
    expect(
      listMissingSetupKeys({
        ...BASE,
        cert: { testing: '/a.crt' },
        cuit: '20123456789',
        key: { testing: '/a.key' },
        puntoVentaPorDefecto: 3,
      }),
    ).toEqual([]);
  });

  it('masks paths and formats dates when describing values', () => {
    const config = {
      ...BASE,
      cert: { testing: '/Users/x/secretos/cert.crt' },
      emisor: { inicioActividades: '20200301' },
    };

    expect(describeConfigValue(getConfigField('cert.testing'), config)).toBe('.../secretos/cert.crt');
    expect(describeConfigValue(getConfigField('emisor.inicioActividades'), config)).toBe('01/03/2020');
    expect(describeConfigValue(getConfigField('cuit'), config)).toBe('sin configurar');
  });

  it('has one field per key', () => {
    const keys = CONFIG_FIELDS.map((field) => field.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('periods', () => {
  it('builds the current and previous month, also across years', () => {
    expect(currentMonthPeriod(new Date('2026-02-10T15:00:00Z'))).toEqual({ from: '1/02/2026', to: '28/02/2026' });
    expect(previousMonthPeriod(new Date('2026-01-10T15:00:00Z'))).toEqual({ from: '1/12/2025', to: '31/12/2025' });
  });
});
