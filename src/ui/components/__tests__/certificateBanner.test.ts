import { afterEach, describe, expect, it, vi } from 'vitest';

import { stripAnsi } from '../../primitives/text';
import { certificateBanner } from '../certificateBanner';

const GUIDE = 'https://github.com/LcsGrz/arcli/blob/main/docs/obtencion-certificados.md';

describe('certificateBanner', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows the summary and the guide link on its own line, inside a box', () => {
    const banner = stripAnsi(
      certificateBanner({
        expired: false,
        guideUrl: GUIDE,
        summary: 'El certificado de producción vence el 20/11/2026 (en 10 días).',
      }),
    );
    const lines = banner.split('\n');

    expect(lines.some((line) => line.includes('El certificado de producción vence el 20/11/2026 (en 10 días).'))).toBe(
      true,
    );
    expect(lines.some((line) => line.includes(`Renovalo: ${GUIDE}`))).toBe(true);
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });

  it('paints an expired certificate as danger and one about to expire as warning', () => {
    vi.stubEnv('NO_COLOR', '');
    vi.stubEnv('FORCE_COLOR', '1');

    const props = { guideUrl: GUIDE, summary: 'El certificado de testing venció el 01/10/2026.' };

    expect(certificateBanner({ ...props, expired: true })).toContain('\u001B[31m');
    expect(certificateBanner({ ...props, expired: false })).not.toContain('\u001B[31m');
  });
});
