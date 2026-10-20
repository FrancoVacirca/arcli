import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      exclude: ['src/**/__tests__/**', 'src/modules/storybook/**'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
        'src/modules/billing/**': {
          branches: 65,
          functions: 80,
          lines: 75,
          statements: 75,
        },
      },
    },
  },
});
