import os from 'os';
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
  // Local: scale to the machine (each worker is a full next-server + browser,
  // so a hardcoded count either wastes cores on a big box or thrashes a small
  // one) — leave a couple cores free for the OS/editor. CI runners stay fixed
  // since the shard count already tunes total parallelism there.
  workers: process.env.CI ? 2 : Math.max(2, os.cpus().length - 2),
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
    // Pixel gallery — local only, never CI. It proves a settings-pipeline
    // change did not repaint an existing wall (see .claude/plans/51); CI runs
    // `playwright test` with no project filter, and pixel snapshots in CI are
    // what 66e4d7cf removed on purpose, so it is gated on an env var rather
    // than on `process.env.CI` being falsy.
    //
    //   capture baseline:  HS_GALLERY=1 npx playwright test --project=gallery --update-snapshots
    //   compare:           HS_GALLERY=1 npx playwright test --project=gallery
    //
    // Snapshots land under .claude/mockups/, which is gitignored: they are a
    // working artifact of one machine on one day, not a committed baseline.
    ...(process.env.HS_GALLERY ? [{
      name: 'gallery',
      testDir: './e2e/gallery',
      // The pixel threshold stays at zero; this absorbs load-dependent noise
      // instead. Measured over three full runs (630 shots): one shot differed,
      // by 18 pixels, on a row highlight, and passed 3/3 when re-run alone.
      //
      // The protocol that makes this safe: a shot that passes on retry is
      // noise, a shot that fails twice is a real change. Never widen
      // `threshold` or `maxDiffPixels` to make a diff go away - that is where a
      // real repaint would hide.
      retries: 1,
      // Screenshots retry until two consecutive captures match, and a
      // fullscreen module is a 1080x1920 paint; 30s is not enough headroom.
      timeout: 120_000,
      snapshotPathTemplate: '.claude/mockups/gallery/{arg}{ext}',
      use: { viewport: { width: 1080, height: 1920 } },
    }] : []),
  ],
});
