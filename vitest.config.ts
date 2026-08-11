import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV_HARNESS__: 'false',
    __BUILD_SHA__: '"test"',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environmentMatchGlobs: [['tests/shell/**', 'happy-dom']],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
