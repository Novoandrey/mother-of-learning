import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Native tsconfig-paths support (Vite 6+). Resolves `@/…` aliases
    // from mat-ucheniya/tsconfig.json without the vite-tsconfig-paths plugin.
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'lib/**/__tests__/**/*.test.ts'],
    // Smoke-green on empty test dirs; individual phases add their own
    // tests and a red run means a broken test, not a missing one.
    passWithNoTests: true,
  },
});
