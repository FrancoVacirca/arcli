import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { restrictFolderToOwner } from '../restrict-to-owner';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe.skipIf(process.platform === 'win32')('restrictFolderToOwner', () => {
  it('leaves an existing folder only for its owner', () => {
    const root = mkdtempSync(join(tmpdir(), 'arcli-perms-'));
    const tickets = join(root, 'tickets');

    directories.push(root);
    mkdirSync(tickets, { mode: 0o755 });
    writeFileSync(join(tickets, 'TA-20123456786-wsfe.json'), '{}', { mode: 0o644 });

    restrictFolderToOwner(tickets);

    expect(statSync(tickets).mode & 0o777).toBe(0o700);
  });

  it('ignores a folder that does not exist', () => {
    expect(() => restrictFolderToOwner(join(tmpdir(), 'arcli-no-existe', 'tickets'))).not.toThrow();
  });
});
