import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

test('a single screen renders its modules and never rotates', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('only', 'Only', [textModule('SOLO SCREEN')])],
    settings: { rotationIntervalMs: 1500 },
  }));
  await page.goto('/display');
  await expect(page.getByText('SOLO SCREEN')).toBeVisible();
  // screens.length <= 1 disables the rotation timer entirely (ScreenRotator)
  await page.waitForTimeout(3500);
  await expect(page.getByText('SOLO SCREEN')).toBeVisible();
});

test('two screens rotate on the configured interval', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('a', 'A', [textModule('SCREEN ALPHA')]),
      makeScreen('b', 'B', [textModule('SCREEN BRAVO')]),
    ],
    settings: { rotationIntervalMs: 2000 },
  }));
  await page.goto('/display');
  await expect(page.getByText('SCREEN ALPHA')).toBeVisible();
  await expect(page.getByText('SCREEN BRAVO')).toBeVisible({ timeout: 8000 });
});

test('a sticky screen (rotationDurationMs: 0) never auto-advances', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('sticky', 'Sticky', [textModule('STICKY SCREEN')], { rotationDurationMs: 0 }),
      makeScreen('next', 'Next', [textModule('NEVER SHOWN')]),
    ],
    settings: { rotationIntervalMs: 1500 },
  }));
  await page.goto('/display');
  await expect(page.getByText('STICKY SCREEN')).toBeVisible();
  await page.waitForTimeout(4000);
  await expect(page.getByText('STICKY SCREEN')).toBeVisible();
  await expect(page.getByText('NEVER SHOWN')).toBeHidden();
});

test('the display picks up config changes without a reload', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('live', 'Live', [textModule('BEFORE UPDATE')])],
  }));
  await page.goto('/display');
  await expect(page.getByText('BEFORE UPDATE')).toBeVisible();

  const config = await getConfig(request);
  config.screens[0].modules = [textModule('AFTER UPDATE')];
  await putConfig(request, config);

  // useLiveConfig polls /api/config every 3s
  await expect(page.getByText('AFTER UPDATE')).toBeVisible({ timeout: 9000 });
});

test('empty screens list shows the empty state', async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [] }));
  await page.goto('/display');
  await expect(page.getByText('No screens configured')).toBeVisible();
});

test('per-display routes render each display, and /display resolves main inline', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    displays: [
      { id: 'main', name: 'Main', screens: [makeScreen('m', 'M', [textModule('MAIN DISPLAY')])] },
      { id: 'kitchen', name: 'Kitchen', screens: [makeScreen('k', 'K', [textModule('KITCHEN DISPLAY')])] },
    ],
  }));
  await page.goto('/display/kitchen');
  await expect(page.getByText('KITCHEN DISPLAY')).toBeVisible();
  // Legacy /display renders the main display inline (no 307 — Chromium --app
  // mode duplicates windows on RSC redirects, so this is load-bearing behavior)
  await page.goto('/display');
  await expect(page.getByText('MAIN DISPLAY')).toBeVisible();
  expect(page.url()).toContain('/display');
});
