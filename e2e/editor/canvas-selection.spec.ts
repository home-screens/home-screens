import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { putConfig, getConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * Selection on the canvas and the controls around it:
 *   - a plain click selects what was clicked and never cycles away from it;
 *     Alt/Option+click cycles through the stack under the cursor;
 *   - the module right-click menu (layering, select behind, duplicate,
 *     hide on display, delete);
 *   - a click on the grey workspace around the frame deselects, and the
 *     property panel's "Screen settings" link does the same;
 *   - screen tabs: 24px "…" and hover-only "x", "Stays" and "Off" badges,
 *     Rename first in the menu.
 */

/** A tall module underneath a short one, both starting at (100,100). */
function stackedScreen() {
  return makeScreen('s', 'S', [
    textModule('BACK', { id: 'back', size: { w: 800, h: 400 }, zIndex: 1 }),
    textModule('FRONT', { id: 'front', size: { w: 800, h: 200 }, zIndex: 2 }),
  ]);
}

async function openEditor(page: Page) {
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
}

/** Height of the selection ring in canvas pixels (1080-wide display). */
async function selectedHeight(page: Page): Promise<number> {
  const canvas = (await page.getByTestId('editor-canvas').boundingBox())!;
  const ring = (await page.getByTestId('selection-overlay').boundingBox())!;
  return Math.round(ring.height / (canvas.width / 1080));
}

test('a repeated click keeps the selection; Alt+click cycles to the module behind', async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [stackedScreen()] }));
  await openEditor(page);

  const front = page.locator('[data-module-id="front"]');
  await front.click();
  expect(await selectedHeight(page)).toBe(200);
  await front.click();
  expect(await selectedHeight(page)).toBe(200);

  await front.click({ modifiers: ['Alt'] });
  expect(await selectedHeight(page)).toBe(400);
});

test('the module menu reaches the module behind and reorders the stack', async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [stackedScreen()] }));
  await openEditor(page);

  await page.locator('[data-module-id="front"]').click({ button: 'right' });
  const menu = page.getByTestId('module-context-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Select the module behind' }).click();
  await expect(menu).toHaveCount(0);
  expect(await selectedHeight(page)).toBe(400);

  await page.locator('[data-module-id="front"]').click({ button: 'right' });
  await page.getByTestId('module-context-menu').getByRole('menuitem', { name: 'Send to Back' }).click();
  await expect.poll(async () => {
    const mods = (await getConfig(request)).screens[0].modules;
    const z = Object.fromEntries(mods.map((m) => [m.id, m.zIndex]));
    return z.front < z.back;
  }).toBe(true);

  await page.locator('[data-module-id="back"]').click({ button: 'right' });
  await page.getByTestId('module-context-menu').getByRole('menuitem', { name: 'Hide on display' }).click();
  await expect.poll(async () => (await getConfig(request)).screens[0].modules.find((m) => m.id === 'back')!.enabled).toBe(false);
});

test('Escape and a click on the grey workspace both deselect; the panel links back to screen settings', async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [stackedScreen()] }));
  await openEditor(page);

  const empty = page.getByText('Select a module to edit');
  await page.locator('[data-module-id="front"]').click();
  await expect(empty).toHaveCount(0);

  // The workspace's top-left corner is padding around the centred frame.
  const workspace = (await page.getByTestId('editor-workspace').boundingBox())!;
  await page.mouse.click(workspace.x + 6, workspace.y + 6);
  await expect(empty).toBeVisible();

  await page.locator('[data-module-id="front"]').click();
  await expect(empty).toHaveCount(0);
  await page.getByRole('button', { name: 'Screen settings' }).click();
  await expect(empty).toBeVisible();

  await page.locator('[data-module-id="front"]').click();
  await page.keyboard.press('Escape');
  await expect(empty).toBeVisible();
});

test('screen tabs: "…" opens the menu with Rename first, badges read Stays / Off, delete shows on hover', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('a', 'Alpha', [textModule('A')]),
      makeScreen('b', 'Bravo', [textModule('B')], { rotationDurationMs: 0 }),
      makeScreen('c', 'Charlie', [textModule('C')], { enabled: false }),
    ],
  }));
  await openEditor(page);

  await expect(page.getByText('Stays', { exact: true })).toBeVisible();
  await expect(page.getByText('Off', { exact: true })).toBeVisible();
  await expect(page.getByText('0s', { exact: true })).toHaveCount(0);

  const more = page.getByRole('button', { name: 'Options for Alpha', exact: true });
  const box = (await more.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  await more.click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('button').first()).toHaveText('Rename');
  await page.keyboard.press('Escape');

  const deleteBravo = page.getByRole('button', { name: 'Delete Bravo', exact: true });
  await expect(deleteBravo).toHaveCSS('opacity', '0');
  await page.locator('span.max-w-32', { hasText: 'Bravo' }).hover();
  await expect(deleteBravo).toHaveCSS('opacity', '1');
  const deleteBox = (await deleteBravo.boundingBox())!;
  expect(deleteBox.width).toBeGreaterThanOrEqual(24);
  expect(deleteBox.height).toBeGreaterThanOrEqual(24);
});

test('the canvas shows where the display draws its pagination dots', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('a', 'A', [textModule('A')]), makeScreen('b', 'B', [textModule('B')])],
  }));
  await openEditor(page);
  const guide = page.getByTestId('dots-guide');
  await expect(guide).toBeVisible();
  // No text of its own (it would take canvas room); the dots explain themselves on hover.
  await expect(guide).toHaveText('');
  await expect(guide.locator('[title="Screen dots show here"]')).toHaveCount(2);
});
