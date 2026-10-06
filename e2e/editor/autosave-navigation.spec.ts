import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { stubModuleData } from '../helpers/stubs';

/**
 * The editor saves 800ms after an edit. These leave the page inside that
 * window, by every door that keeps the store alive, and expect the edit on
 * the hub anyway: the auto-save lives in the (editor) layout, not on the
 * page, so a move between editor routes never clears its timer.
 *
 * None of these waits for the PUT before moving (the `autosaved` helper
 * would), since arriving outside the debounce is exactly what makes them
 * pass on the old code too.
 */

async function editTextModule(page: import('@playwright/test').Page) {
  await page.locator('[data-module-id="em"]').click();
  await page.getByLabel('Content').fill('EDITED');
}

test('an edit followed at once by the Settings button still lands', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('screen-1', 'S1', [textModule('ORIGINAL', { id: 'em' })])],
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await editTextModule(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/editor\/settings/);

  await expect.poll(async () => (await getConfig(request)).screens[0].modules[0].config.content).toBe('EDITED');
});

test("an edit followed at once by a config section's link into Settings still lands", async ({ page, request }) => {
  await stubModuleData(page);
  const weather = buildModuleInstance('weather');
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [weather])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await page.locator(`[data-module-id="${weather.id}"]`).click();
  const humidity = page.getByRole('switch', { name: 'Humidity' });
  const wasOn = (await humidity.getAttribute('aria-checked')) === 'true';
  await humidity.click();
  // A plain link here reloaded the whole page, which raised the leave-page
  // prompt and, once confirmed, dropped the edit. It is a client-side move
  // now, so neither happens.
  await page.getByTestId('location-status-row').getByRole('link', { name: 'Set your location' }).click();
  await expect(page).toHaveURL(/\/editor\/settings\?section=defaults&page=location/);

  await expect.poll(async () => (await getConfig(request)).screens[0].modules[0].config.showHumidity).toBe(!wasOn);
});

test('an edit made on the way out survives browser Back and forward', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('screen-1', 'S1', [textModule('ORIGINAL', { id: 'em' })])],
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/editor\/settings/);
  await page.goBack();
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await editTextModule(page);
  await page.goForward();
  await expect(page).toHaveURL(/\/editor\/settings/);

  await expect.poll(async () => (await getConfig(request)).screens[0].modules[0].config.content).toBe('EDITED');
});

test('Preview starts the pending save before it opens the display', async ({ page, request, context }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('screen-1', 'S1', [textModule('ORIGINAL', { id: 'em' })])],
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await editTextModule(page);
  const put = page.waitForRequest((r) => r.url().includes('/api/config') && r.method() === 'PUT');
  const opened = context.waitForEvent('page');
  const clickedAt = Date.now();
  await page.getByRole('button', { name: 'Preview' }).click();
  // The PUT goes out with the click, not when the 800ms debounce would have
  // sent it; the margin below is what tells the two apart.
  await put;
  expect(Date.now() - clickedAt).toBeLessThan(600);
  const preview = await opened;
  await preview.close();
  await expect.poll(async () => (await getConfig(request)).screens[0].modules[0].config.content).toBe('EDITED');
});

test('a Settings edit followed at once by Back to the editor still lands', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=screen');
  const dots = page.locator('[data-field-id="display.showPaginationDots"]').getByRole('switch');
  await expect(dots).toBeVisible();

  // Inside the form's own 500ms debounce, which used to be cleared with the
  // edit still only in form state, and Back then reloaded the hub's copy.
  await dots.click();
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await expect.poll(async () => (await getConfig(request)).settings.showPaginationDots).toBe(false);
});

test('Settings asks before the tab is closed with an edit the hub does not have', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.route('**/api/config', async (route) => {
    if (route.request().method() === 'PUT') {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
    }
    return route.continue();
  });
  await page.goto('/editor/settings?section=defaults&page=screen');
  const dots = page.locator('[data-field-id="display.showPaginationDots"]').getByRole('switch');
  await expect(dots).toBeVisible();
  const failed = page.waitForResponse(
    (r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.status() === 500,
  );
  await dots.click();
  // The failing save leaves the store dirty; the page is now guarded.
  await failed;

  let prompted = false;
  page.on('dialog', (dialog) => {
    prompted = dialog.type() === 'beforeunload';
    void dialog.accept();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => prompted).toBe(true);
});
