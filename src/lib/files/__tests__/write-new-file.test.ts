import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { writeNewFile } from '../write-new-file';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'arcli-write-new-file-'));

  directories.push(directory);

  return directory;
}

describe('writeNewFile', () => {
  it('escribe con el nombre pedido si no existe', () => {
    const path = join(createTempDir(), 'factura.pdf');

    expect(writeNewFile(path, new Uint8Array([1]))).toBe(path);
    expect(readFileSync(path)).toEqual(Buffer.from([1]));
  });

  it('nunca pisa un archivo existente: suma -2, -3', () => {
    const folder = createTempDir();
    const path = join(folder, 'factura.pdf');

    writeFileSync(path, 'original');

    expect(writeNewFile(path, new Uint8Array([2]))).toBe(join(folder, 'factura-2.pdf'));
    expect(writeNewFile(path, new Uint8Array([3]))).toBe(join(folder, 'factura-3.pdf'));
    expect(readFileSync(path, 'utf8')).toBe('original');
  });
});
