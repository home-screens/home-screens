import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // Sandbox every test file's cwd so nothing can write to the real data/
    // directory (see vitest.setup.ts for why per-test overrides fall short).
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['.worktrees/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/test-utils.ts',
        'src/types/**',
      ],
    },
  },
});
