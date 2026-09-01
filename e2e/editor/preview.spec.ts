import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * The toolbar's Preview button opens the screen being edited, not the
 * display's first screen: `/display?screen=<id>&preview=1` in a new tab. On
 * the display side `?preview=1` holds rotation (the PAUSED label says so) —
 * see e2e/display/pagination.spec.ts for the rest.
 */
test('Preview opens the selected screen, rotation held, in a new tab', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('a', 'A', [textModule('PREVIEW SCREEN A')]),
      makeScreen('b', 'B', [textModule('PREVIEW SCREEN B')]),
      makeScreen('c', 'C', [textModule('PREVIEW SCREEN C')]),
    ],
  }));
  await page.goto('/editor?screen=b');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await expect(page.locator('[data-module-type="text"]')).toContainText('PREVIEW SCREEN B');

  const popupPromise = page.context().waitForEvent('page');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();

  const url = new URL(popup.url());
  expect(url.pathname).toBe('/display');
  expect(url.searchParams.get('screen')).toBe('b');
  expect(url.searchParams.get('preview')).toBe('1');

  await expect(popup.getByText('PREVIEW SCREEN B', { exact: true })).toBeVisible();
  await expect(popup.getByText('PAUSED', { exact: true })).toBeVisible();
});
