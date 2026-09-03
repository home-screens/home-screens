import { readFile } from 'node:fs/promises';
import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { writeSandboxFile } from '../helpers/sandbox';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * Editor › Defaults › Data › Full Backup, credential opt-in.
 *
 * The whole point of the feature is that keys leave the device only when the
 * user asks, and that a password actually seals them. Both halves have to be
 * checked against a real downloaded file, not against the request that
 * produced it — a bundle that "looks encrypted" but leaks the key in a sibling
 * field would pass any assertion made on the API alone.
 */

const DATA_PAGE = '/editor/settings?section=defaults&page=data';
const API_KEY = 'e2e-secret-weather-key';
const FILE_PASSWORD = 'a good long password';
const EDITOR_PASSWORD = 'e2e-editor-password';

/** The full-backup restore input is the second .json file input on the page. */
const backupInput = 'input[type="file"][accept=".json"]';

// Enables an editor password partway through and never clears it on its own;
// the afterAll below restores the no-auth baseline for any spec that reuses
// this worker's server.
test.describe.configure({ mode: 'serial' });

const DISABLED_AUTH = { passwordHash: null, salt: null, cookieSecret: null, displayToken: null };

/**
 * The export refuses to run without an editor password, because a
 * password-less install cannot tell its owner from anyone else on the network.
 * The opt-in has to say so up front rather than failing at the download.
 */
test('the opt-in is disabled until an editor password is set', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s-alpha', 'Alpha', [textModule('ALPHA CONTENT')])],
  }));
  await page.goto(DATA_PAGE);

  const checkbox = page.getByRole('checkbox', { name: /Include my keys and connected accounts/i });
  await expect(checkbox).toBeDisabled();
  await expect(page.getByText(/Needs a password first/i)).toBeVisible();
});

test.describe('with an editor password set', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/auth/password', { data: { newPassword: EDITOR_PASSWORD } });
    expect(res.ok()).toBe(true);
  });

  test.afterAll(async ({ server, playwright }) => {
    writeSandboxFile(server.sandboxDir, 'auth.json', DISABLED_AUTH);
    const ctx = await playwright.request.newContext({ baseURL: server.baseURL });
    await expect
      .poll(
        async () => (await (await ctx.get('/api/auth/status')).json()).authEnabled,
        { timeout: 15_000, intervals: [400] },
      )
      .toBe(false);
    await ctx.dispose();
  });

  // Log in through the page's own context so its cookie jar carries the
  // session — `page.request` shares it, so config and secret seeding below are
  // authenticated too.
  test.beforeEach(async ({ page }) => {
    const login = await page.request.post('/api/auth/login', { data: { password: EDITOR_PASSWORD } });
    expect(login.ok()).toBe(true);

    await putConfig(page.request, baseConfig({
      screens: [makeScreen('s-alpha', 'Alpha', [textModule('ALPHA CONTENT')])],
    }));
    const secret = await page.request.put('/api/secrets', {
      data: { key: 'openweathermap_key', value: API_KEY },
    });
    expect(secret.ok()).toBeTruthy();

    await page.goto(DATA_PAGE);
  });

  test('a plain backup carries no keys unless the box is ticked', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save a backup' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).not.toContain('with-keys');
    const bundle = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(bundle.credentials).toBeUndefined();
    expect(JSON.stringify(bundle)).not.toContain(API_KEY);
  });

  test('ticking the box without a password writes the key in the clear, after a warning', async ({ page }) => {
    await page.getByRole('checkbox', { name: /Include my keys and connected accounts/i }).check();

    // The plaintext warning must be visible before the user commits.
    await expect(page.getByText(/Anyone who opens this file can use your accounts/i)).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save a backup' }).click();
    // Confirmation dialog: this is the deliberate, warned-about plaintext path.
    await page.getByRole('button', { name: 'Back up anyway' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('with-keys');
    const bundle = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(bundle.credentials.encrypted).toBe(false);
    expect(bundle.credentials.data.secrets.openweathermap_key).toBe(API_KEY);
  });

  test('a password-protected backup seals the key and needs the password to restore', async ({ page }) => {
    await page.getByRole('checkbox', { name: /Include my keys and connected accounts/i }).check();
    await page.getByRole('checkbox', { name: /Protect them with a password/i }).check();
    await expect(page.getByText(/Anyone who opens this file/i)).toBeHidden();

    await page.getByRole('button', { name: 'Save a backup' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a password' })).toBeVisible();

    await page.getByLabel('Password', { exact: true }).fill(FILE_PASSWORD);
    await page.getByLabel('Confirm password').fill(FILE_PASSWORD);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Back up', exact: true }).click();
    const download = await downloadPromise;

    const raw = await readFile(await download.path(), 'utf8');
    const bundle = JSON.parse(raw);
    expect(bundle.credentials.encrypted).toBe(true);
    expect(bundle.credentials.kdf).toBe('scrypt');
    // The key must not appear anywhere in the file, including outside the envelope.
    expect(raw).not.toContain(API_KEY);

    // Restoring it prompts for the password rather than silently skipping.
    await page.locator(backupInput).nth(1).setInputFiles({
      name: 'home-screens-backup-with-keys.json',
      mimeType: 'application/json',
      buffer: Buffer.from(raw),
    });
    await expect(page.getByRole('heading', { name: 'This backup is locked' })).toBeVisible();

    // A wrong password is rejected in place, leaving the prompt open.
    await page.getByLabel('Password', { exact: true }).fill('definitely not it');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText(/That password did not work/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This backup is locked' })).toBeVisible();
  });

  test('a locked backup can still be restored without its keys', async ({ page }) => {
    await page.getByRole('checkbox', { name: /Include my keys and connected accounts/i }).check();
    await page.getByRole('checkbox', { name: /Protect them with a password/i }).check();
    await page.getByRole('button', { name: 'Save a backup' }).click();
    await page.getByLabel('Password', { exact: true }).fill(FILE_PASSWORD);
    await page.getByLabel('Confirm password').fill(FILE_PASSWORD);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Back up', exact: true }).click();
    const raw = await readFile(await (await downloadPromise).path(), 'utf8');

    // Change the config so we can prove the rest of the bundle still landed.
    await putConfig(page.request, baseConfig({
      screens: [makeScreen('s-changed', 'Changed', [textModule('CHANGED')])],
    }));

    await page.locator(backupInput).nth(1).setInputFiles({
      name: 'home-screens-backup-with-keys.json',
      mimeType: 'application/json',
      buffer: Buffer.from(raw),
    });
    await expect(page.getByRole('heading', { name: 'This backup is locked' })).toBeVisible();
    await page.getByRole('button', { name: 'Restore without my keys' }).click();

    // Losing the password costs the keys, not the config.
    await expect(page.getByRole('heading', { name: 'This backup is locked' })).toBeHidden();
    await expect
      .poll(async () => (await (await page.request.get('/api/config')).json()).screens[0].id)
      .toBe('s-alpha');
  });

  /**
   * A credential section the server rejects outright — hand-edited file,
   * truncated download. The client's cheap `encrypted === true` check lets it
   * through, so without handling the returned error code the restore just
   * stops: no message, nothing changed, no way to tell.
   */
  test('a damaged credential section is reported instead of silently doing nothing', async ({ page }) => {
    const bundle = {
      _type: 'home-screens-backup',
      config: baseConfig({ screens: [makeScreen('s-new', 'New', [textModule('NEW')])] }),
      credentials: { encrypted: false, data: 'not an object' },
    };

    await page.locator(backupInput).nth(1).setInputFiles({
      name: 'damaged.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(bundle)),
    });
    await page.getByRole('button', { name: 'Restore', exact: true }).click();

    await expect(page.getByText(/keys in this file are damaged/i)).toBeVisible();
    // And nothing was written — the server rejects before any disk write.
    await expect
      .poll(async () => (await (await page.request.get('/api/config')).json()).screens[0].id)
      .toBe('s-alpha');
  });

  /**
   * The restore committed on the server; only the editor's own reload failed.
   * Reporting that as "could not restore" would tell the user nothing happened
   * to a device that has already been rewritten.
   */
  test('a failed reload after a committed restore is not reported as a failed restore', async ({ page }) => {
    const bundle = {
      _type: 'home-screens-backup',
      config: baseConfig({ screens: [makeScreen('s-restored', 'Restored', [textModule('R')])] }),
    };

    // Wait until the editor has finished its own config load before breaking
    // the endpoint — installing the intercept first would just hang the page
    // on "Loading…" and never get us to the restore.
    await expect(page.locator(backupInput).nth(1)).toBeAttached();

    // Break only the post-restore config refetch, not the restore itself.
    await page.route('**/api/config', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ status: 500, body: 'boom' });
      return route.continue();
    });

    await page.locator(backupInput).nth(1).setInputFiles({
      name: 'plain.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(bundle)),
    });

    await expect(page.getByText(/could not reload/i)).toBeVisible();
    await expect(page.getByText(/Could not restore that backup/i)).toHaveCount(0);

    // The restore really did land, despite the reload failing.
    await page.unroute('**/api/config');
    await expect
      .poll(async () => (await (await page.request.get('/api/config')).json()).screens[0].id)
      .toBe('s-restored');
  });
});
