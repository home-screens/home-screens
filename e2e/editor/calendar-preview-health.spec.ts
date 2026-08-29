import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { sourceStatusBody } from '../helpers/calendar-status-fixture';

/**
 * The editor canvas fetches the same `/api/calendar` payload as the kiosk and
 * must badge a failing source the same way, or a user looking at the editor
 * cannot tell that the rows on screen are a saved copy rather than live
 * (the report that prompted this: a month grid quietly showing a stale
 * slice with no visible hint).
 */
test('editor preview badges a failing calendar source like the kiosk does', async ({ page, request }) => {
  // The agenda view fetches with no window params, so match the bare path too.
  await page.route(
    (url) => url.pathname.endsWith('/api/calendar'),
    (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(sourceStatusBody()) }),
  );
  const mod = buildModuleInstance('fullscreen-calendar', { view: 'agenda', showLegend: 'header' });
  await putConfig(request, baseConfig({
    screens: [makeScreen('screen-1', 'Screen 1', [mod])],
    settings: matrixSettings(),
  }));

  await page.goto('/editor');
  const preview = page.locator(`[data-module-id="${mod.id}"]`);
  await expect(preview).toContainText('School not updating since 7:10');
  await expect(preview.locator('[data-source-failing]')).toContainText('School');
  await expect(preview.locator('[data-event-id="bad-1"]').first()).toContainText('saved');
  await expect(preview.locator('[data-event-id="ok-1"]').first()).not.toContainText('saved');
});
