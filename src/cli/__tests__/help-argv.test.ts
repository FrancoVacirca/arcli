import { describe, expect, it } from 'vitest';

import { normalizeHelpArgv } from '../help-argv';

const run = (...args: string[]) => ['node', 'arcli', ...args];

describe('normalizeHelpArgv', () => {
  it('opens the wizard without arguments only in an interactive terminal', () => {
    expect(normalizeHelpArgv(run(), true)).toEqual(run('interactivo'));
    expect(normalizeHelpArgv(run(), false)).toEqual(run());
  });

  it.each([
    [['ayuda'], ['--ayuda']],
    [
      ['ayuda', 'fc'],
      ['fc', '--ayuda'],
    ],
    [
      ['fc', 'ayuda'],
      ['fc', '--ayuda'],
    ],
    [
      ['config', 'revisar', 'ayuda'],
      ['config', 'revisar', '--ayuda'],
    ],
  ])('turns %j into help', (args, expected) => {
    expect(normalizeHelpArgv(run(...args), true)).toEqual(run(...expected));
  });

  it('keeps ayuda as the value of a flag', () => {
    const args = run('fc', '-m', '100', '--descripcion', 'ayuda');

    expect(normalizeHelpArgv(args, true)).toEqual(args);
  });
});
