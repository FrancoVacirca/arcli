import { describe, expect, it } from 'vitest';

import { configPublicKeySchema } from '../../modules/config/config.schemas';
import { createConfigHelp, createConfigSetHelp, createStorybookHelp } from '../help';

describe('help', () => {
  it.each([
    ['config', createConfigHelp],
    ['config establecer', createConfigSetHelp],
  ])('lists every public config key in `%s --ayuda`', (_command, createHelp) => {
    const help = createHelp();
    const missing = configPublicKeySchema.options.filter((key) => !help.includes(`- ${key}: `));

    expect(missing).toEqual([]);
  });

  it('lists the bordes storybook scene', () => {
    expect(createStorybookHelp()).toContain('arcli storybook bordes');
  });
});
