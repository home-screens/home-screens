import { test, expect } from '../fixtures';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { putConfig } from '../helpers/api';

/**
 * A module flagged "Show on every screen" is drawn once, in the pinned
 * layer above the rotating canvas, on every screen of the display: present
 * on its home screen (once, not twice), still present after a jump to
 * another screen, and the same DOM node throughout, which is what keeps a
 * dock's state and stops it blinking on rotation.
 */

function config() {
  return baseConfig({
    screens: [
      makeScreen('s1', 'Home', [
        textModule('HOME ONLY', { position: { x: 100, y: 100 } }),
        textModule('PINNED EVERYWHERE', { showOnEveryScreen: true, position: { x: 100, y: 1500 } }),
      ]),
      makeScreen('s2', 'Weather', [textModule('PAGE 2', { position: { x: 100, y: 100 } })]),
    ],
    settings: { rotationIntervalMs: 60_000 },
  });
}

test('a pinned module shows on every screen, once, without remounting across a jump', async ({ page, request }) => {
  await renderOnDisplay(page, request, config());
  await expect(page.getByText('HOME ONLY', { exact: true })).toBeVisible();

  const pinned = page.getByText('PINNED EVERYWHERE', { exact: true });
  await expect(pinned).toHaveCount(1);
  await expect(pinned).toBeVisible();
  // Drawn by the layer, not by the home screen's renderer.
  await expect(page.getByTestId('pinned-layer').getByText('PINNED EVERYWHERE', { exact: true })).toBeVisible();
  await expect(page.getByTestId('display-canvas').getByText('PINNED EVERYWHERE', { exact: true })).toHaveCount(0);

  // Tag the live node so a remount would be visible as a lost mark.
  await page.evaluate(() => {
    const node = document.querySelector('[data-pinned="true"]') as (HTMLElement & { __mark?: number }) | null;
    if (node) node.__mark = 42;
  });

  await page.getByRole('button', { name: 'Go to screen 2: Weather' }).click();
  await expect(page.getByText('PAGE 2', { exact: true })).toBeVisible();
  await expect(page.getByText('HOME ONLY', { exact: true })).toBeHidden();

  await expect(pinned).toHaveCount(1);
  await expect(pinned).toBeVisible();
  const mark = await page.evaluate(() => {
    const node = document.querySelector('[data-pinned="true"]') as (HTMLElement & { __mark?: number }) | null;
    return node?.__mark ?? null;
  });
  expect(mark).toBe(42);
});

test('a pinned module follows the display, not the profile: it stays up over a profile of empty screens', async ({ page, request }) => {
  const cfg = config();
  cfg.screens.push(makeScreen('s3', 'Blank', []));
  cfg.profiles = [{ id: 'blank', name: 'Blank', screenIds: ['s3'] }];
  cfg.settings.activeProfile = 'blank';
  await putConfig(request, cfg);
  await page.goto('/display');
  // The profile leaves nothing to rotate, so the display shows its hint...
  await expect(page.getByTestId('empty-display-hint')).toBeVisible();
  await expect(page.getByText('HOME ONLY', { exact: true })).toHaveCount(0);
  // ...and the pinned module from Home, outside the profile, is still there.
  await expect(page.getByText('PINNED EVERYWHERE', { exact: true })).toBeVisible();
});

test('a pinned module on a switched-off screen, or switched off itself, is not drawn', async ({ page, request }) => {
  const cfg = config();
  cfg.screens[0].modules[1].enabled = false;
  cfg.screens.push(makeScreen('s3', 'Off', [textModule('FROM OFF SCREEN', { showOnEveryScreen: true, position: { x: 100, y: 1200 } })], { enabled: false }));
  await renderOnDisplay(page, request, cfg);
  await expect(page.getByText('HOME ONLY', { exact: true })).toBeVisible();
  await expect(page.getByText('PINNED EVERYWHERE', { exact: true })).toHaveCount(0);
  await expect(page.getByText('FROM OFF SCREEN', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('pinned-layer')).toHaveCount(0);
});
