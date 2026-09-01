import { test, expect } from '../fixtures';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';

/**
 * Display URL parameters and the pagination control:
 *   - `?screen=<id>` starts on that screen (the editor's Preview button relies
 *     on it), even when the screen is out of the rotation;
 *   - `?preview=1` holds rotation and stays out of the hub's command/status
 *     traffic, so a preview window never masquerades as the real display;
 *   - past 10 screens the dot row collapses to `‹ n / N ›` (24 dots do not
 *     fit a 1080px panel), and a tap flashes the destination screen's name.
 */

function screens(n: number) {
  return Array.from({ length: n }, (_, i) =>
    makeScreen(`s${i + 1}`, `Screen ${i + 1}`, [textModule(`PAGE ${i + 1}`)]));
}

test('?screen= starts the rotation on that screen', async ({ page, request }) => {
  await renderOnDisplay(page, request, baseConfig({ screens: screens(3), settings: { rotationIntervalMs: 60_000 } }), '/display?screen=s2');
  await expect(page.getByText('PAGE 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause rotation (double-tap)' })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: 'Go to screen 1: Screen 1' })).toBeVisible();
});

test('?preview=1 holds rotation, shows the requested off-rotation screen, and stays silent to the hub', async ({ page, request }) => {
  const list = screens(3);
  list[1].enabled = false;
  const hubCalls: string[] = [];
  page.on('request', (r) => {
    if (/\/api\/display\/(commands|status)/.test(r.url())) hubCalls.push(r.url());
  });

  await renderOnDisplay(page, request, baseConfig({ screens: list, settings: { rotationIntervalMs: 1_000 } }), '/display?screen=s2&preview=1');
  // A disabled screen is out of the rotation, and still what the preview shows.
  await expect(page.getByText('PAGE 2', { exact: true })).toBeVisible();
  await expect(page.getByText('PAUSED', { exact: true })).toBeVisible();

  // Three intervals later it is still there, and the hub never heard from us.
  await page.waitForTimeout(3_200);
  await expect(page.getByText('PAGE 2', { exact: true })).toBeVisible();
  expect(hubCalls).toEqual([]);

  // A tap on a dot leaves the pinned screen for the rotation proper.
  await page.getByRole('button', { name: 'Go to screen 2: Screen 3' }).click();
  await expect(page.getByText('PAGE 3', { exact: true })).toBeVisible();
});

test('more than ten screens collapse the dots to a counter with arrows, and a tap names the screen', async ({ page, request }) => {
  await renderOnDisplay(page, request, baseConfig({ screens: screens(12), settings: { rotationIntervalMs: 60_000 } }));

  const compact = page.getByTestId('pagination-compact');
  await expect(compact).toBeVisible();
  await expect(compact).toContainText('1 / 12');
  await expect(page.getByRole('button', { name: /^Go to screen/ })).toHaveCount(0);
  // The whole control fits the panel with room to spare.
  const box = (await compact.boundingBox())!;
  expect(box.width).toBeLessThan(300);

  await page.getByRole('button', { name: 'Next screen' }).click();
  await expect(page.getByText('PAGE 2', { exact: true })).toBeVisible();
  await expect(compact).toContainText('2 / 12');
  await expect(page.getByTestId('pagination-label')).toHaveText('Screen 2');
  await expect(page.getByTestId('pagination-label')).toHaveCount(0, { timeout: 5_000 });

  await page.getByRole('button', { name: 'Previous screen' }).click();
  await page.getByRole('button', { name: 'Previous screen' }).click();
  await expect(page.getByText('PAGE 12', { exact: true })).toBeVisible();
  await expect(compact).toContainText('12 / 12');
});
