import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  type CompletionEnvironment,
  detectShell,
  getCompletionState,
  installCompletion,
  resolveCompletionPath,
  uninstallCompletion,
} from '../installer';

const homes: string[] = [];

function createEnvironment(overrides: Partial<CompletionEnvironment> = {}): CompletionEnvironment {
  const home = mkdtempSync(join(tmpdir(), 'arcli-completado-'));

  homes.push(home);

  return { home, platform: 'linux', ...overrides };
}

afterEach(() => {
  for (const home of homes.splice(0)) {
    rmSync(home, { force: true, recursive: true });
  }
});

describe('detectShell', () => {
  it('reads the shell from $SHELL', () => {
    expect(detectShell('/bin/zsh')).toBe('zsh');
    expect(detectShell('/opt/homebrew/bin/fish')).toBe('fish');
    expect(detectShell('/bin/sh')).toBeUndefined();
    expect(detectShell(undefined)).toBeUndefined();
  });
});

describe('resolveCompletionPath', () => {
  it('uses the rc file of each shell', () => {
    const environment = createEnvironment();

    expect(resolveCompletionPath('zsh', environment)).toBe(join(environment.home, '.zshrc'));
    expect(resolveCompletionPath('zsh', { ...environment, zdotdir: '/z' })).toBe('/z/.zshrc');
    expect(resolveCompletionPath('bash', environment)).toBe(join(environment.home, '.bashrc'));
    expect(resolveCompletionPath('fish', environment)).toBe(
      join(environment.home, '.config', 'fish', 'completions', 'arcli.fish'),
    );
  });

  it('on macOS uses the bash login file that already exists, so .profile keeps working', () => {
    const environment = createEnvironment({ platform: 'darwin' });

    expect(resolveCompletionPath('bash', environment)).toBe(join(environment.home, '.bash_profile'));

    writeFileSync(join(environment.home, '.profile'), 'export A=1\n');

    expect(resolveCompletionPath('bash', environment)).toBe(join(environment.home, '.profile'));
  });
});

describe('installCompletion y uninstallCompletion', () => {
  it('appends the block once and removes exactly that, leaving the rest of the file as it was', () => {
    const environment = createEnvironment();
    const rc = join(environment.home, '.zshrc');
    const original = 'export PATH=$HOME/bin:$PATH\n';

    writeFileSync(rc, original);

    expect(installCompletion('zsh', environment)).toMatchObject({ changed: true, installed: true, path: rc });
    expect(readFileSync(rc, 'utf8')).toContain('eval "$(arcli completado zsh)"');
    expect(installCompletion('zsh', environment)).toMatchObject({ changed: false, installed: true });
    expect(readFileSync(rc, 'utf8').match(/arcli completado zsh/g)).toHaveLength(1);
    expect(getCompletionState('zsh', environment).installed).toBe(true);

    expect(uninstallCompletion('zsh', environment)).toMatchObject({ changed: true, installed: false });
    expect(readFileSync(rc, 'utf8')).toBe(original);
    expect(uninstallCompletion('zsh', environment)).toMatchObject({ changed: false, installed: false });
  });

  it('creates the rc file if it does not exist, and skips arcli if it is not installed', () => {
    const environment = createEnvironment();

    installCompletion('bash', environment);

    expect(readFileSync(join(environment.home, '.bashrc'), 'utf8')).toContain(
      'command -v arcli >/dev/null 2>&1 && eval "$(arcli completado bash)"',
    );
  });

  it('recognizes and removes a line added by hand', () => {
    const environment = createEnvironment();
    const rc = join(environment.home, '.zshrc');

    writeFileSync(rc, 'alias ll="ls -l"\neval "$(arcli completado zsh)"\n');

    expect(installCompletion('zsh', environment).changed).toBe(false);
    expect(uninstallCompletion('zsh', environment).changed).toBe(true);
    expect(readFileSync(rc, 'utf8')).toBe('alias ll="ls -l"\n');
  });

  it('writes and deletes its own file in fish', () => {
    const environment = createEnvironment();
    const path = resolveCompletionPath('fish', environment);

    installCompletion('fish', environment);

    expect(readFileSync(path, 'utf8')).toContain('arcli completado fish | source');

    uninstallCompletion('fish', environment);

    expect(existsSync(path)).toBe(false);
  });
});
