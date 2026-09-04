import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig, choreChartModule, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * The editor address the launcher is entitled to print, resolved the way
 * `useOrigin` resolves it.
 *
 * Not simply the page's own origin: the worker's server binds 127.0.0.1, and a
 * loopback address on a phone screen is no use to anyone, so the app swaps it
 * for the hub's LAN address from `/api/system/address`. Asserting the page
 * origin instead made these specs pass only on a machine with no LAN IPv4.
 */
async function expectedEditorAddress(page: Page, request: APIRequestContext): Promise<string> {
  const own = new URL(page.url()).origin;
  const res = await request.get('/api/system/address');
  const lan = res.ok() ? ((await res.json()) as { origin: string | null }).origin : null;
  return `${lan ?? own}/editor`;
}

test.beforeEach(async ({ request }) => {
  await putConfig(request, baseConfig());
});

test('display renders the seeded screen', async ({ page }) => {
  await page.goto('/display');
  await expect(page.getByText('E2E HOME SCREEN')).toBeVisible();
});

test('editor loads with the module palette', async ({ page }) => {
  await page.goto('/editor');
  await expect(page.getByRole('heading', { name: 'Modules' })).toBeVisible();
  await expect(page.getByPlaceholder('Search modules…')).toBeVisible();
});

test('remote loads the control tab', async ({ page }) => {
  await page.goto('/remote');
  await expect(page.getByRole('button', { name: 'Sleep Display' })).toBeVisible();
});

test('login redirects to the editor while auth is disabled', async ({ page }) => {
  await page.goto('/login');
  await page.waitForURL('**/editor');
});

test.describe('the hub root', () => {
  test('a laptop-width visitor lands on the editor', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('shows the launcher with the family surfaces and the editor address', async ({ page, request }) => {
      await page.goto('/');
      const launcher = page.getByTestId('root-launcher');
      await expect(launcher).toBeVisible();
      await expect(launcher.getByRole('link', { name: /Family remote/ })).toHaveAttribute('href', '/remote');
      await expect(launcher.getByRole('link', { name: /Display/ })).toHaveAttribute('href', '/display');
      // No chore chart on any screen yet, so /chores (an empty state a phone
      // visitor cannot act on) is not offered.
      await expect(launcher.getByRole('link', { name: /Kids' chores/ })).toHaveCount(0);
      // The editor is not offered as a link (it would dead-end on this
      // viewport); its address is shown to carry to a laptop instead.
      await expect(page.getByLabel('Editor address')).toHaveValue(await expectedEditorAddress(page, request));
      // Still the same page: no redirect to the editor happened.
      expect(new URL(page.url()).pathname).toBe('/');
    });

    test('a plain fetch of / gets the launcher server-rendered, not an empty body', async ({ request }) => {
      const res = await request.get('/');
      expect(res.status()).toBe(200);
      expect(await res.text()).toContain('Where do you want to go?');
    });

    test('the too-narrow editor screen hands off to the phone surfaces', async ({ page, request }) => {
      await page.goto('/editor');
      const narrow = page.getByTestId('editor-too-narrow');
      await expect(narrow).toBeVisible();
      await expect(narrow.getByRole('link', { name: /Family remote/ })).toHaveAttribute('href', '/remote');
      await expect(narrow.getByRole('link', { name: /Kids' chores/ })).toHaveCount(0);
      await expect(narrow.getByLabel('Editor address')).toHaveValue(await expectedEditorAddress(page, request));
    });

    test('both offer the kids\' chores page once a chore chart is on a screen', async ({ page, request }) => {
      await putConfig(request, baseConfig({
        screens: [makeScreen('screen-1', 'Screen 1', [textModule('E2E HOME SCREEN'), choreChartModule()])],
      }));
      await page.goto('/');
      await expect(page.getByTestId('root-launcher').getByRole('link', { name: /Kids' chores/ })).toHaveAttribute('href', '/chores');
      await page.goto('/editor');
      await expect(page.getByTestId('editor-too-narrow').getByRole('link', { name: /Kids' chores/ })).toHaveAttribute('href', '/chores');
    });
  });
});
