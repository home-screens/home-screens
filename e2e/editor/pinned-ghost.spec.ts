import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';

/**
 * The editor's side of "Show on every screen": the switch in the property
 * panel, the ghost every other screen draws where the wall will draw the
 * module, and the ghost's tag that leads back to the home screen.
 */

function config() {
  return baseConfig({
    screens: [
      makeScreen('s1', 'Home', [
        textModule('HOME ONLY', { position: { x: 100, y: 100 } }),
        textModule('PINNED EVERYWHERE', { showOnEveryScreen: true, position: { x: 100, y: 1500 } }),
      ]),
      makeScreen('s2', 'Weather', [textModule('PAGE 2', { position: { x: 100, y: 1500 } })]),
    ],
  });
}

test('the switch persists showOnEveryScreen on the instance and hides the background switch', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'Home', [textModule('PIN ME')])],
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator('[data-module-id="text-pin-me"]').click();
  await page.getByRole('button', { name: 'Visibility' }).click();

  const toggle = page.getByLabel('Show on every screen');
  await expect(toggle).toBeVisible();
  expect(await toggle.isChecked()).toBe(false);

  await autosaved(page, async () => {
    await toggle.check();
  });
  const config = await getConfig(request);
  expect(config.screens[0].modules[0].showOnEveryScreen).toBe(true);

  // The home screen marks it, and the hidden-copy switch is out of reach.
  await expect(page.locator('[data-module-id="text-pin-me"]').getByTitle("Shows on every screen of this display, on top of that screen's modules")).toBeVisible();
  await expect(page.getByLabel('Run hidden in the background')).toHaveCount(0);

  await autosaved(page, async () => {
    await toggle.uncheck();
  });
  expect((await getConfig(request)).screens[0].modules[0].showOnEveryScreen).toBeUndefined();
});

test('another screen draws the ghost where the wall will, leaves the module under it selectable, and its tag jumps home', async ({ page, request }) => {
  await putConfig(request, config());
  await page.goto('/editor?screen=s2');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await expect(page.getByText('PAGE 2', { exact: true })).toBeVisible();

  const ghost = page.getByTestId('pinned-ghost');
  await expect(ghost).toHaveCount(1);
  await expect(ghost).toHaveAttribute('data-module-id', 'text-pinned-everywhere');
  await expect(ghost.getByText('PINNED EVERYWHERE', { exact: true })).toBeVisible();
  // Not a module of this screen: no drag handle, no selection.
  await expect(page.locator('[data-testid="editor-canvas"] [data-module-id="text-pinned-everywhere"]')).toHaveCount(1);

  // PAGE 2 sits in the same box as the ghost; a click in the middle still
  // reaches it because the ghost takes no pointer.
  const box = (await ghost.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.75);
  await expect(page.getByTestId('selection-overlay')).toBeVisible();
  await expect(page.getByTestId('pinned-ghost')).toHaveCount(1);
  // The ring and its handles draw above the ghost, so the selected module
  // can be dragged out from under a pinned box with its handles in view.
  // (Both take no pointer, so this is the stacking order, not a hit test.)
  const stacking = await page.evaluate(() => ({
    ghost: Number(getComputedStyle(document.querySelector('[data-testid="pinned-ghost"]')!).zIndex),
    ring: Number(getComputedStyle(document.querySelector('[data-testid="selection-overlay"]')!).zIndex),
  }));
  expect(stacking.ghost).toBeLessThan(stacking.ring);

  const tag = page.getByTestId('pinned-ghost-tag');
  await expect(tag).toHaveText(/On every screen, from Home/);
  await tag.click();
  await expect(page).toHaveURL(/screen=s1/);
  await expect(page.getByText('HOME ONLY', { exact: true })).toBeVisible();
  await expect(page.getByTestId('pinned-ghost')).toHaveCount(0);
  // Selected on arrival: the Visibility section shows its switch on.
  await page.getByRole('button', { name: 'Visibility' }).click();
  expect(await page.getByLabel('Show on every screen').isChecked()).toBe(true);
});

test('the home screen of a pinned module does not draw a ghost of it', async ({ page, request }) => {
  await putConfig(request, config());
  await page.goto('/editor?screen=s1');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await expect(page.getByText('PINNED EVERYWHERE', { exact: true })).toHaveCount(1);
  await expect(page.getByTestId('pinned-ghost')).toHaveCount(0);
});
