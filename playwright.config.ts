import { defineConfig } from '@playwright/test';

/**
 * E2E suite. Each worker boots its own production `next start` server from a
 * sandboxed cwd (see e2e/fixtures.ts), so there is no global webServer here.
 * Requires `npm run build` first — the server helper fails fast if .next/ is
 * missing.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // files parallel across workers; tests within a file share the worker's server sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 30_000,
  expect: { timeout: 10_000 }, // display live-update assertions ride a 3s config poll
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Pure assertions (no browser/server) — the coverage ratchet lives here.
    { name: 'meta',    testDir: './e2e/meta',    use: { viewport: { width: 1280, height: 800 } } },
    { name: 'smoke',   testDir: './e2e/smoke',   use: { viewport: { width: 1280, height: 800 } } },
    { name: 'editor',  testDir: './e2e/editor',  use: { viewport: { width: 1440, height: 900 } } },
    { name: 'display', testDir: './e2e/display', use: { viewport: { width: 1080, height: 1920 } } },
    { name: 'remote',  testDir: './e2e/remote',  use: { viewport: { width: 390, height: 844 } } },
    { name: 'chores',  testDir: './e2e/chores',  use: { viewport: { width: 390, height: 844 } } },
    { name: 'auth',    testDir: './e2e/auth',    use: { viewport: { width: 1280, height: 800 } } },
  ],
});
