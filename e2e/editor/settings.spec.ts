import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { getConfig, putConfig } from '../helpers/api';
import { autosaved } from '../helpers/editor';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import type { DisplayNode } from '@/types/config';

async function kitchenSettings(request: APIRequestContext) {
  const config = await getConfig(request);
  const displays = (config as unknown as { displays?: DisplayNode[] }).displays ?? [];
  return displays.find((d) => d.id === 'kitchen')?.settings ?? {};
}

test('Defaults › Weather: switching units persists to the shared config', async ({ page, request }) => {
  await putConfig(request, baseConfig()); // default units: imperial
  await page.goto('/editor/settings?section=defaults&page=weather');
  await expect(page.getByText('Units')).toBeVisible();

  await page.getByRole('button', { name: /^Metric/ }).click();

  await expect
    .poll(async () => (await getConfig(request)).settings.weather.units)
    .toBe('metric');
});

test.describe('Defaults › Location', () => {
  test('looking up a place persists lat/lon', async ({ page, request }) => {
    await putConfig(request, baseConfig()); // settings.latitude/longitude start at 0
    // /api/geocode is an external-service proxy (Nominatim) — stub it so no
    // real upstream call fires. Response shape matches src/app/api/geocode/route.ts.
    await page.route('**/api/geocode?q=*', (route) =>
      route.fulfill({ json: { latitude: 40.7128, longitude: -74.006, displayName: 'New York, NY' } }),
    );

    await page.goto('/editor/settings?section=defaults&page=location');
    await page.getByPlaceholder('Zip code or city name').fill('New York');
    await page.getByRole('button', { name: 'Look up' }).click();

    // LocationSection has no save button; the settings page's 500ms debounced
    // autosave PUTs the config, so poll rather than wait on a single response.
    await expect
      .poll(async () => (await getConfig(request)).settings.latitude)
      .toBeCloseTo(40.7128, 3);
    await expect
      .poll(async () => (await getConfig(request)).settings.longitude)
      .toBeCloseTo(-74.006, 3);
  });

  test('manual coordinate entry persists', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto('/editor/settings?section=defaults&page=location');

    // The lat/lon fields live inside a <details> disclosure.
    await page.getByText('Edit coordinates manually', { exact: true }).click();
    await page.getByLabel('Latitude').fill('51.5074');
    await page.getByLabel('Longitude').fill('-0.1278');
    await page.getByLabel('Longitude').blur();

    await expect
      .poll(async () => (await getConfig(request)).settings.latitude)
      .toBeCloseTo(51.5074, 3);
    await expect
      .poll(async () => (await getConfig(request)).settings.longitude)
      .toBeCloseTo(-0.1278, 3);
  });
});

test('Defaults › Alerts: editing the shared duration persists', async ({ page, request }) => {
  await putConfig(request, baseConfig()); // no alerts block → form hydrates enabled, duration 0
  await page.goto('/editor/settings?section=defaults&page=screen&panel=alerts');

  // "Default duration (seconds)" is a range Slider — drive it by keyboard
  // (step = 5, so Home → 0, then 9× ArrowRight → 45s). It persists to
  // settings.alerts.defaultDuration in MILLISECONDS (slider-seconds × 1000).
  const slider = page
    .locator('label', { hasText: 'Default duration (seconds)' })
    .locator('input[type="range"]');
  await expect(slider).toBeVisible();

  await autosaved(page, async () => {
    await slider.focus();
    await slider.press('Home');
    for (let i = 0; i < 9; i++) await slider.press('ArrowRight');
  });

  await expect
    .poll(async () => (await getConfig(request)).settings.alerts?.defaultDuration)
    .toBe(45_000);
});

test('Defaults › Meals: changing week start persists to data/meals.json', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=meals');

  // MealsSection self-saves to /api/meals/data (data/meals.json), not the
  // config PUT, so wait on that endpoint and assert via GET /api/meals/data.
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/meals/data') && r.request().method() === 'PUT' && r.ok(),
  );
  await page.getByRole('button', { name: 'Monday' }).click();
  await saved;

  const res = await request.get('/api/meals/data');
  const body = await res.json();
  expect(body.settings.weekStartDay).toBe('monday');
});

test.describe('per-display overrides', () => {
  function multiDisplayConfig() {
    return baseConfig({
      displays: [
        { id: 'main', name: 'Main', screens: [makeScreen('m1', 'M1', [textModule('MAIN')])] },
        { id: 'kitchen', name: 'Kitchen', screens: [makeScreen('k1', 'K1', [textModule('KIT')])] },
      ],
    });
  }

  /** The OverrideRow whose label is `label`, addressed via its label span's row ancestor. */
  function overrideRow(page: Page, label: string) {
    return page.getByText(label, { exact: true }).locator('xpath=ancestor::div[contains(@class,"px-4")][1]');
  }

  test('overriding a display field writes to the node, shows the backlink banner, and resets', async ({ page, request }) => {
    await putConfig(request, multiDisplayConfig());
    await page.goto('/editor/settings?section=display&id=kitchen&subtab=overrides');

    const row = overrideRow(page, 'Transition effect');
    await expect(row).toBeVisible();

    // Fork the field, then pick a distinct value.
    await row.getByRole('button', { name: 'Override', exact: true }).click();
    await row.locator('select').selectOption('crossfade');

    await expect
      .poll(async () => (await kitchenSettings(request)).transitionEffect)
      .toBe('crossfade');

    // The Defaults › Display page's backlink banner now lists the kitchen display.
    await page.goto('/editor/settings?section=defaults&page=screen');
    await expect(page.locator('a[href*="section=display&id=kitchen"]')).toBeVisible();

    // Reset clears the override.
    await page.goto('/editor/settings?section=display&id=kitchen&subtab=overrides');
    const forkedRow = overrideRow(page, 'Transition effect');
    await forkedRow.getByRole('button', { name: 'Reset to default', exact: true }).click();

    await expect
      .poll(async () => (await kitchenSettings(request)).transitionEffect)
      .toBeUndefined();
  });
});
