import { test, expect } from '../fixtures';
import type { Page, Route } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig } from '../helpers/config-fixtures';

/**
 * Coverage for the /remote Settings sheet (SettingsSheet.tsx): system stats,
 * theme persistence, backup download, restore-from-file (happy + malformed),
 * and the restart-service power action.
 *
 * Safety: system endpoints (`/api/system/stats`, `/api/system/power`) are
 * intercepted at the browser boundary via page.route so the real server never
 * runs a stats gather or a `systemctl restart`. The reboot control is asserted
 * present but NEVER clicked — it maps to a real `sudo reboot`.
 */

// A fully-formed /api/system/stats payload matching the SystemStats shape the
// sheet reads (os.hostname, os.uptime, memory.used/total, disk.used/total).
const STATS = {
  os: { hostname: 'e2e-test-pi', platform: 'linux', arch: 'arm64', uptime: 93784, nodeVersion: 'v22.0.0' },
  memory: { total: 8_000_000_000, free: 4_000_000_000, used: 4_000_000_000 }, // 50%
  disk: { total: 100_000_000_000, used: 25_000_000_000, free: 75_000_000_000 }, // 25%
  app: { screens: 1, modules: 1, profiles: 0 },
};

/** Stub GET /api/system/stats with a known payload so the sheet renders it. */
async function stubStats(page: Page, stats: unknown = STATS) {
  await page.route('**/api/system/stats', (route) => route.fulfill({ json: stats }));
}

/** Open the settings sheet from the /remote status bar and wait for it. */
async function openSheet(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await putConfig(request, baseConfig());
});

test('system stats render from GET /api/system/stats', async ({ page }) => {
  await stubStats(page);
  await page.goto('/remote');
  await openSheet(page);

  // Host + uptime rows render the stubbed values.
  await expect(page.getByText('e2e-test-pi')).toBeVisible();
  await expect(page.getByText('1d 2h 3m')).toBeVisible(); // formatUptime(93784)

  // Memory (50%) and Disk (25%) usage bars render their computed percentages.
  await expect(page.getByText('50%')).toBeVisible();
  await expect(page.getByText('25%')).toBeVisible();
});

test('theme toggle applies data-theme and persists across reload', async ({ page }) => {
  await stubStats(page);
  await page.goto('/remote');
  await openSheet(page);

  // Switch to Light: setThemeChoice writes localStorage + sets data-theme.
  await page.getByRole('button', { name: 'Light', exact: true }).click();

  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
    .toBe('light');
  const stored = await page.evaluate(() => localStorage.getItem('hs-theme-remote'));
  expect(stored).toBe('light');

  // Reload — the root layout bootstrap script re-applies data-theme from the
  // persisted `hs-theme-remote` value before first paint.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
    .toBe('light');
  expect(await page.evaluate(() => localStorage.getItem('hs-theme-remote'))).toBe('light');
});

test('backup downloads a bundle file with sane name and content', async ({ page }) => {
  await stubStats(page);
  await page.goto('/remote');
  await openSheet(page);

  // Let the real GET /api/backup serve so we exercise the actual bundle build.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Backup All Data' }).click();
  const download = await downloadPromise;

  // Filename: home-screens-backup-YYYY-MM-DD.json
  expect(download.suggestedFilename()).toMatch(/^home-screens-backup-\d{4}-\d{2}-\d{2}\.json$/);

  // Content is a valid backup bundle.
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const bundle = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  expect(bundle._type).toBe('home-screens-backup');
  expect(bundle.config).toBeTruthy();

  // The button flips to the success state after a successful download.
  await expect(page.getByText('Backup Saved')).toBeVisible();
});

test('restore-from-file happy path POSTs the bundle to /api/backup', async ({ page }) => {
  await stubStats(page);

  // Intercept only POST /api/backup (the restore write); let any GET flow through.
  const posted: unknown[] = [];
  await page.route('**/api/backup', (route: Route) => {
    if (route.request().method() === 'POST') {
      try {
        posted.push(route.request().postDataJSON());
      } catch {
        posted.push(route.request().postData());
      }
      return route.fulfill({ json: { restored: { config: true } } });
    }
    return route.fallback();
  });

  await page.goto('/remote');
  await openSheet(page);

  // Build a valid bundle in-test and feed it to the hidden file input.
  const bundle = {
    _type: 'home-screens-backup',
    _version: 1,
    config: baseConfig(),
    chores: {},
    meals: {},
    rewards: {},
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: 'home-screens-backup-2026-07-09.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle)),
  });

  // The client validates shape, then arms the tap-again confirmation.
  await expect(page.getByText('Tap again to restore')).toBeVisible();
  await page.getByRole('button', { name: 'Tap again to restore' }).click();

  // Success state after the POST resolves.
  await expect(page.getByText('Restored', { exact: true })).toBeVisible();

  // Prove the UI POSTed the bundle to /api/backup.
  expect(posted.length).toBe(1);
  expect((posted[0] as { _type?: string })._type).toBe('home-screens-backup');
});

test('malformed backup file is rejected with a friendly message', async ({ page }) => {
  await stubStats(page);

  // A restore write must never fire for a bad file — fail loudly if it does.
  let posted = false;
  await page.route('**/api/backup', (route: Route) => {
    if (route.request().method() === 'POST') {
      posted = true;
      return route.fulfill({ json: {} });
    }
    return route.fallback();
  });

  await page.goto('/remote');
  await openSheet(page);

  // Valid JSON but not a backup bundle (no _type, no screens/settings).
  await page.locator('input[type="file"]').setInputFiles({
    name: 'not-a-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ hello: 'world' })),
  });

  await expect(page.getByText('Invalid backup file')).toBeVisible();
  expect(posted).toBe(false);
});

test('restart-service confirms then POSTs to /api/system/power (reboot untouched)', async ({ page }) => {
  await stubStats(page);

  // Hard safety net: intercept power so no real systemctl/reboot can run.
  const powerPosts: Array<{ action?: string }> = [];
  await page.route('**/api/system/power', (route: Route) => {
    try {
      powerPosts.push(route.request().postDataJSON());
    } catch {
      powerPosts.push({});
    }
    return route.fulfill({ json: { ok: true, message: 'Service restart scheduled' } });
  });

  await page.goto('/remote');
  await openSheet(page);

  // The row opens a confirm sheet that says what to expect; Cancel is inert.
  await page.getByRole('button', { name: 'Restart Service' }).click();
  await expect(page.getByText('Restart Home Screens?')).toBeVisible();
  await expect(page.getByText(/reconnects in about 20 seconds/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Restart Home Screens?')).toBeHidden();
  expect(powerPosts.length).toBe(0);

  await page.getByRole('button', { name: 'Restart Service' }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();

  // Exactly one restart-service call, and reboot was never issued.
  await expect.poll(() => powerPosts.length).toBe(1);
  expect(powerPosts[0]?.action).toBe('restart-service');
  expect(powerPosts.some((p) => p?.action === 'reboot')).toBe(false);

  // The sheet closes and the silence that follows is announced as expected,
  // not as a lost connection.
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeHidden();
  const banner = page.getByTestId('connection-banner');
  await expect(banner).toHaveAttribute('data-mode', 'restart-service');
  await expect(banner).toHaveText(/Home Screens is restarting/);
});

test('reboot asks first and is never sent from a cancelled sheet', async ({ page }) => {
  await stubStats(page);
  const powerPosts: Array<{ action?: string }> = [];
  await page.route('**/api/system/power', (route: Route) => {
    powerPosts.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto('/remote');
  await openSheet(page);
  // The reboot control is present; it maps to a real `sudo reboot`, so the
  // only tap made here is the one that backs out.
  await page.getByRole('button', { name: 'Reboot Device' }).click();
  await expect(page.getByText('Reboot the device?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Reboot the device?')).toBeHidden();
  expect(powerPosts.length).toBe(0);
});
