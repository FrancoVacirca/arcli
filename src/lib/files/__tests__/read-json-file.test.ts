import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { InputValidationError } from '../../errors/app-error';
import { readJsonFile } from '../read-json-file';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('readJsonFile', () => {
  it('throws a clear validation error when the file does not exist', () => {
    expect(() => readJsonFile('/tmp/arcli-no-existe.json')).toThrow(InputValidationError);
    expect(() => readJsonFile('/tmp/arcli-no-existe.json')).toThrow(/La ruta del archivo JSON no existe/);
  });

  it('throws a clear validation error when the file contains invalid json', () => {
    const directory = mkdtempSync(join(tmpdir(), 'arcli-read-json-'));

    temporaryDirectories.push(directory);

    const inputPath = join(directory, 'broken.json');

    writeFileSync(inputPath, '{ inválido', 'utf8');

    expect(() => readJsonFile(inputPath)).toThrow(InputValidationError);
    expect(() => readJsonFile(inputPath)).toThrow(/No se pudo leer el archivo JSON/);
  });
});
