import { test, expect } from '../fixtures';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { renderOnDisplay } from '../helpers/display';

/**
 * A Display Control dock with buttons of its own: only the listed screens,
 * in that order, under their own names; a button for a screen outside the
 * rotation (off-profile here) still shows that screen; a button whose
 * screen is gone is skipped.
 */

function dock(dockButtons: Array<{ screenId: string; label?: string; icon?: string; color?: string }>) {
  return {
    ...buildModuleInstance('display-control', { layout: 'dock', dockButtons }),
    position: { x: 100, y: 1600 },
    size: { w: 880, h: 200 },
    showOnEveryScreen: true,
  };
}

function config(rotationIntervalMs: number) {
  const cfg = baseConfig({
    screens: [
      makeScreen('home', 'Home', [
        textModule('HOME ONLY', { position: { x: 100, y: 100 } }),
        dock([
          { screenId: 'home', label: 'Start', icon: '🏠', color: '#ef4444' },
          { screenId: 'gone' },
          { screenId: 'extra' },
        ]),
      ]),
      makeScreen('weather', 'Weather', [textModule('PAGE 2', { position: { x: 100, y: 100 } })]),
      makeScreen('extra', 'Extra', [textModule('EXTRA SCREEN', { position: { x: 100, y: 100 } })]),
    ],
    settings: { rotationIntervalMs, activeProfile: 'day' },
  });
  cfg.profiles = [{ id: 'day', name: 'Day', screenIds: ['home', 'weather'] }];
  return cfg;
}

test('lists its own buttons in order with their names, skips a gone screen, and reaches one outside the rotation', async ({ page, request }) => {
  await renderOnDisplay(page, request, config(60_000));
  await expect(page.getByText('HOME ONLY', { exact: true })).toBeVisible();

  const buttons = page.locator('[data-testid="display-control-dock"] button[aria-label^="Go to"]');
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveAttribute('aria-label', 'Go to Start');
  await expect(buttons.nth(1)).toHaveAttribute('aria-label', 'Go to Extra');
  await expect(buttons.nth(0)).toHaveAttribute('aria-current', 'true');
  await expect(buttons.nth(0)).toContainText('🏠');
  const tile = buttons.nth(0).locator('span').first();
  await expect(tile).toHaveCSS('background-color', 'rgb(239, 68, 68)');

  // Extra is switched on but not in the day profile: the button still shows it.
  await buttons.nth(1).click();
  await expect(page.getByText('EXTRA SCREEN', { exact: true })).toBeVisible();
  await expect(page.getByText('HOME ONLY', { exact: true })).toBeHidden();
  await expect(buttons.nth(1)).toHaveAttribute('aria-current', 'true');

  await buttons.nth(0).click();
  await expect(page.getByText('HOME ONLY', { exact: true })).toBeVisible();
  await expect(page.getByText('EXTRA SCREEN', { exact: true })).toBeHidden();
});

test('with rotation off, a screen shown from outside the rotation stays up', async ({ page, request }) => {
  await renderOnDisplay(page, request, config(0));
  await page.locator('[data-testid="display-control-dock"] button[aria-label="Go to Extra"]').click();
  await expect(page.getByText('EXTRA SCREEN', { exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByText('EXTRA SCREEN', { exact: true })).toBeVisible();
});
