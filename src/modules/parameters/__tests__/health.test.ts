import { describe, expect, it } from 'vitest';

import { checkArcaHealth } from '../health';

const OK = { app: 'OK', auth: 'OK', db: 'OK' };

/** Reloj falso: cada llamada avanza los milisegundos indicados. */
function clock(...steps: number[]): () => number {
  let time = 0;
  let index = 0;

  return () => (time += steps[index++] ?? 0);
}

describe('checkArcaHealth', () => {
  it('funcionando: los tres servidores en OK y respuesta rapida', async () => {
    await expect(checkArcaHealth({ gateway: { getServerStatus: async () => OK }, now: clock(0, 400) })).resolves.toBe(
      'funcionando',
    );
  });

  it('con demoras: todo OK pero tardo mas del umbral', async () => {
    await expect(checkArcaHealth({ gateway: { getServerStatus: async () => OK }, now: clock(0, 3500) })).resolves.toBe(
      'con-demoras',
    );
  });

  it('con problemas: algun servidor no esta en OK', async () => {
    const gateway = { getServerStatus: async () => ({ ...OK, db: 'ERROR' }) };

    await expect(checkArcaHealth({ gateway })).resolves.toBe('con-problemas');
  });

  it('sin respuesta: error de red', async () => {
    const gateway = {
      getServerStatus: async () => {
        throw new Error('ECONNRESET');
      },
    };

    await expect(checkArcaHealth({ gateway })).resolves.toBe('sin-respuesta');
  });

  it('sin respuesta: no contesto a tiempo', async () => {
    const gateway = { getServerStatus: () => new Promise<typeof OK>(() => undefined) };

    await expect(checkArcaHealth({ gateway, timeoutMs: 10 })).resolves.toBe('sin-respuesta');
  });
});
