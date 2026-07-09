import { test, expect } from '../fixtures';
import { putConfig, getConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * Editor toolbar save-state indicator (src/app/(editor)/editor/page.tsx). The
 * editor auto-saves 800ms after any edit; when that PUT fails the toolbar swaps
 * its "Saved" pill for an alert with a Retry action. This drives the failure by
 * blocking PUT /api/config at the browser boundary (the APIRequestContext used
 * by getConfig is a separate client, so read-back still hits the real server).
 */

test('a failed save surfaces the alert + Retry, and retrying recovers', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('screen-1', 'S1', [textModule('EDIT ME', { id: 'em' })])],
  }));

  // Fail every PUT while blocked; let GETs (and later PUTs) reach the server.
  let blockSaves = true;
  await page.route('**/api/config', async (route) => {
    if (route.request().method() === 'PUT' && blockSaves) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'boom' }),
      });
    }
    return route.continue();
  });

  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  // Dirty the config by dragging the placed module; the autosave PUT hits the 500.
  const placed = page.locator('[data-module-id="em"]');
  const box = (await placed.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 120, { steps: 15 });
  await page.mouse.up();

  // Error state: an aria-live alert reading "Save failed", plus a Retry button.
  // (isDirty stays set on failure, so autosave keeps retrying and the alert
  // persists until a save succeeds.)
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert.getByText('Save failed')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible();

  // Unblock and retry → the PUT lands, the toolbar returns to "Saved".
  blockSaves = false;
  await retry.click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();

  // The dragged position actually persisted server-side.
  await expect
    .poll(async () => (await getConfig(request)).screens[0].modules[0].position.x)
    .toBeGreaterThan(100);
});
