import { describe, expect, it } from 'vitest';

import { maskPath } from '../mask-path';

describe('mask-path', () => {
  it('keeps the filename and last directory only', () => {
    expect(maskPath('/Users/ana/secretos/cert.pem')).toBe('.../secretos/cert.pem');
  });

  it('handles plain filenames', () => {
    expect(maskPath('cert.pem')).toBe('.../cert.pem');
  });
});
