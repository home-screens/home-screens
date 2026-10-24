import type { APIRequestContext } from '@playwright/test';
import { test as base, expect } from '../fixtures';
import { launchServer, type HsServer } from '../helpers/server';
import { baseConfig } from '../helpers/config-fixtures';
import { clearSecrets, getConfig, putConfig } from '../helpers/api';
import { selectModule } from '../helpers/editor';
import { buildModuleInstance } from '../helpers/module-fixtures';

/**
 * Home Screens' own Google apps are on by default, so a hub offers Sign in
 * with Google for Calendar and Photos with nothing to set up. HS_GOOGLE_HOSTED=0
 * switches them off, and that hub must look exactly as it did before the
 * hosted apps existed: the API keys card asks for the household's own client,
 * the Calendar page points at it, the Photos import asks for it, and the
 * return page for a hosted Photos sign-in does not exist.
 *
 * A household that saved its own Google app gets a switch on the card: off
 * hands sign-ins to Home Screens' app with the saved details kept, and the
 * Calendar page follows.
 */

const API_KEYS = '/editor/settings?section=defaults&page=integrations';
const CALENDAR = '/editor/settings?section=defaults&page=calendar';

base.describe('on by default', () => {
  base('the API keys card says Google is ready and offers the own-app fields folded away', async ({ page }) => {
    await page.goto(API_KEYS);
    const ready = page.getByTestId('google-ready');
    await expect(ready).toContainText('Google Calendar and Google Photos are ready to use');
    await expect(page.getByTestId('google-own-app-toggle')).toContainText('Use your own Google app');
    await expect(page.getByTestId('google-own-app')).toHaveCount(0);
    await expect(page.getByPlaceholder('e.g. 123456789-abc.apps.googleusercontent.com')).toHaveCount(0);
  });

  base('the Calendar page shows Google\'s button and no setup hint', async ({ page }) => {
    await page.goto(CALENDAR);
    const signIn = page.getByTestId('google-calendar-hosted-sign-in');
    await expect(signIn.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
    await expect(page.getByText('needs a Google sign-in you create yourself')).toHaveCount(0);
  });

  base('a photo module offers the Google Photos sign-in in place', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('photo-slideshow'));
    const panel = page.getByTestId('google-photos-hosted');
    await expect(panel.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import from Google Photos' })).toHaveCount(0);
  });

  base('a saved own app gets a switch: off hands sign-ins to Home Screens\' app and keeps the details', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await saveOwnCalendarApp(request);
    try {
      await page.goto(API_KEYS);
      const card = page.getByTestId('google-own-app-switch');
      await expect(card).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByText('Using your own Google app')).toBeVisible();
      await expect(page.getByText('In use. Your own Google app signs you in.')).toBeVisible();
      await expect(page.getByTestId('google-ready')).toContainText('Google Photos is ready to use');

      // Off: saved like any setting, and the hub is asked again at once. The
      // calendar reads with another grant now, so its cached answer and the
      // walls' heartbeat move on too.
      const calendarRevision = async () => (await request.get('/api/calendar')).headers()['x-calendar-revision'];
      const revisionBefore = await calendarRevision();
      const saved = page.waitForResponse((r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok());
      await card.click();
      await saved;
      await expect(card).toHaveAttribute('aria-checked', 'false');
      expect((await getConfig(request)).settings.googleApp).toBe('hosted');
      expect(await calendarRevision()).not.toBe(revisionBefore);
      await expect(page.getByTestId('google-ready')).toContainText('Google Calendar and Google Photos are ready to use');
      await expect(page.getByText('Saved, not in use. Home Screens\' app signs you in.')).toBeVisible();
      await expect(page.getByText(/Switching apps signs Google out/)).toBeVisible();
      // The details stay, dimmed and still editable.
      await expect(page.getByTestId('google-own-app-fields')).toHaveClass(/opacity-60/);
      await expect(page.getByTestId('google-own-app-fields').getByText('Calendar Client ID')).toBeVisible();
      expect((await (await request.get('/api/secrets')).json()).google_client_id).toBe(true);

      // The Calendar page follows the hub's answer.
      await page.goto(CALENDAR);
      await expect(page.getByTestId('google-calendar-hosted-sign-in')).toBeVisible();

      // And back on.
      await page.goto(API_KEYS);
      const restored = page.waitForResponse((r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok());
      await page.getByTestId('google-own-app-switch').click();
      await restored;
      await expect(page.getByText('Using your own Google app')).toBeVisible();
      await page.goto(CALENDAR);
      await expect(page.getByTestId('google-calendar-hosted-sign-in')).toHaveCount(0);
      await expect(page.getByText(/Requires a Google OAuth client/)).toBeVisible();
    } finally {
      // Secrets outlive the per-test config reset; leave the worker as found.
      await clearSecrets(request, ['google_client_id', 'google_client_secret']);
      await putConfig(request, baseConfig());
    }
  });
});

/** A household's own Calendar app, through the same door the API keys page uses. */
async function saveOwnCalendarApp(request: APIRequestContext) {
  for (const [key, value] of [['google_client_id', '123456789-abc.apps.googleusercontent.com'], ['google_client_secret', 'GOCSPX-own']]) {
    const res = await request.put('/api/secrets', { data: { key, value } });
    expect(res.ok()).toBe(true);
  }
}

const off = base.extend<object, { offServer: HsServer }>({
  offServer: [async ({}, use) => {
    const server = await launchServer({ 'config.json': baseConfig() }, { HS_GOOGLE_HOSTED: '0' });
    await use(server);
    await server.stop();
  }, { scope: 'worker' }],
  baseURL: async ({ offServer }, use) => {
    await use(offServer.baseURL);
  },
});

off.describe('switched off with HS_GOOGLE_HOSTED=0', () => {
  off('the API keys card asks for the household\'s own client, as before', async ({ page }) => {
    await page.goto(API_KEYS);
    // The card of old: folded shut while nothing is saved, the client fields inside.
    await page.getByRole('button', { name: /^Google Calendar, Maps, Photos/ }).click();
    await expect(page.getByPlaceholder('e.g. 123456789-abc.apps.googleusercontent.com').first()).toBeVisible();
    await expect(page.getByTestId('google-ready')).toHaveCount(0);
    await expect(page.getByTestId('google-own-app-toggle')).toHaveCount(0);
  });

  off('the Calendar page sends people to the API keys page', async ({ page }) => {
    await page.goto(CALENDAR);
    await expect(page.getByText('needs a Google sign-in you create yourself')).toBeVisible();
    await expect(page.getByTestId('google-calendar-hosted-sign-in')).toHaveCount(0);
  });

  off('the Google Photos import opens on the setup hint', async ({ page, request }) => {
    await selectModule(page, request, buildModuleInstance('photo-slideshow'));
    await expect(page.getByTestId('google-photos-hosted')).toHaveCount(0);
    await page.getByRole('button', { name: 'Import from Google Photos' }).click();
    await expect(page.getByText('add a Google Photos import Client ID')).toBeVisible();
  });

  off('the return page does not exist', async ({ page }) => {
    const res = await page.goto('/editor/connect/google?code=good-code&state=anything');
    expect(res?.status()).toBe(404);
  });
});
