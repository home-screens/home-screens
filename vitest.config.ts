import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        target: 'esnext',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    exclude: ['.worktrees/**', '**/node_modules/**'],
    // Several tests read/write real files under data/ (audit.log,
    // telemetry.json, config.json). Parallel workers race those writes
    // and produce flaky failures. Run files serially; tests within a
    // file still execute in-order.
    fileParallelism: false,
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
