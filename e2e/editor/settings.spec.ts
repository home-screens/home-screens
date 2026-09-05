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

test('Defaults › Weather: a self-hosted radar server persists, blank means the public one', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=weather');

  const field = page.locator('[data-field-id="weather.radarServer"]');
  await expect(field.getByText('Rain radar')).toBeVisible();
  const input = field.getByLabel('Radar server');
  await expect(input).toHaveAttribute('placeholder', 'https://api.librewxr.net');

  // A bare hostname cannot work; say so instead of saving it silently.
  await input.fill('nas.local:8080');
  await expect(field.getByTestId('radar-server-invalid')).toBeVisible();

  await input.fill('http://nas.local:8080');
  await expect(field.getByTestId('radar-server-invalid')).toHaveCount(0);
  await expect
    .poll(async () => (await getConfig(request)).settings.weather.radarServerUrl)
    .toBe('http://nas.local:8080');

  // Clearing the field drops the key so the public server is used again.
  await input.fill('');
  await expect
    .poll(async () => (await getConfig(request)).settings.weather.radarServerUrl)
    .toBeUndefined();
});

test.describe('Defaults › Weather providers', () => {
  test('a rejected key stays in the form with the reason; Save anyway still saves', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    // The key is tried against the provider server-side (POST
    // /api/weather/check-key) before it is saved; stub the probe so no real
    // upstream call fires.
    await page.route('**/api/weather/check-key', (route) =>
      route.fulfill({ json: { ok: false, reason: 'rejected', provider: 'WeatherAPI', detail: 'WeatherAPI API error 401: {"error":{"code":2006,"message":"API key is invalid."}}' } }),
    );
    await page.goto('/editor/settings?section=defaults&page=weather');

    const card = page.locator('[data-field-id="weather.provider.weatherapi"]');
    await card.getByPlaceholder(/./).fill('not-a-real-key');
    await card.getByRole('button', { name: 'Save', exact: true }).click();

    const check = page.getByTestId('secret-check-weatherapi_key');
    await expect(check).toContainText('WeatherAPI.com rejected this key');
    // The raw provider text sits behind a disclosure rather than in the sentence.
    await expect(check.locator('summary')).toHaveText('Details');
    await expect(check).toContainText('API key is invalid');
    expect((await (await request.get('/api/secrets')).json()).weatherapi_key).toBeFalsy();

    // A brand-new key can be rejected until it activates, so saving is still possible.
    await check.getByRole('button', { name: 'Save anyway' }).click();
    await expect(card.getByText('Saved successfully')).toBeVisible();
    await expect.poll(async () => (await (await request.get('/api/secrets')).json()).weatherapi_key).toBe(true);
  });

  test('a key the provider accepts saves without a detour', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.route('**/api/weather/check-key', (route) => route.fulfill({ json: { ok: true } }));
    await page.goto('/editor/settings?section=defaults&page=weather');

    const card = page.locator('[data-field-id="weather.provider.openweathermap"]');
    // Only the default provider's card starts open.
    await card.getByRole('button', { name: /OpenWeatherMap/ }).click();
    await card.getByPlaceholder(/./).fill('a-real-key');
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(card.getByText('Saved successfully')).toBeVisible();
    await expect(page.getByTestId('secret-check-openweathermap_key')).toHaveCount(0);
    await expect.poll(async () => (await (await request.get('/api/secrets')).json()).openweathermap_key).toBe(true);
  });

  test('a keyed default provider with no key is called out at the top, with a one-click switch', async ({ page, request }) => {
    const config = baseConfig();
    config.settings.weather.provider = 'pirateweather';
    await putConfig(request, config);
    await page.goto('/editor/settings?section=defaults&page=weather');

    const notice = page.getByTestId('weather-default-needs-key');
    await expect(notice).toContainText('Pirate Weather');
    await expect(notice).toContainText('needs an API key');

    await notice.getByRole('button', { name: 'Use Open-Meteo' }).click();
    await expect
      .poll(async () => (await getConfig(request)).settings.weather.provider)
      .toBe('open-meteo');
    await expect(notice).toHaveCount(0);
  });
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

  test('time format persists', async ({ page, request }) => {
    // baseConfig has no settings.timeFormat (absent = 12h), so the select
    // starts on 12h; picking 24h stores the explicit global override.
    await putConfig(request, baseConfig());
    await page.goto('/editor/settings?section=defaults&page=location');

    // TimeFormatFields persists immediately on change (direct saveConfig, not
    // the debounced autosave), so poll the config rather than await a response.
    await page.locator('#hs-timeformat-select').selectOption('24h');

    await expect
      .poll(async () => (await getConfig(request)).settings.timeFormat)
      .toBe('24h');
  });

  test('timezone picker persists a zone and resets to system default', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto('/editor/settings?section=defaults&page=location');

    // The timezone combobox opens on click and filters as you type; the
    // pinned "System default" row sits at highlight 0, the filtered matches
    // below it. Saving rides the debounced settings autosave, so poll.
    // (The combobox's aria-label also lands on its listbox, so address the
    // input by role to stay strict-mode-clean.)
    const tz = page.getByRole('combobox', { name: 'Timezone' });
    await tz.click();
    await tz.fill('kiri');
    await tz.press('ArrowDown'); // highlight 0: the pinned default row
    await tz.press('ArrowDown'); // highlight 1: Pacific/Kiritimati
    await tz.press('Enter');

    await expect
      .poll(async () => (await getConfig(request)).settings.timezone)
      .toBe('Pacific/Kiritimati');

    // Reopening resets the filter, so the pinned row is highlight 0 again;
    // picking "System default" serializes the key out of the settings object
    // entirely (empty string = follow the OS zone → stored as absent).
    await tz.click();
    await tz.press('ArrowDown'); // highlight 0: "System default"
    await tz.press('Enter');

    await expect
      .poll(async () => (await getConfig(request)).settings.timezone)
      .toBeUndefined();
  });
});

test('Defaults › Screen: a custom resolution pick survives a tab switch', async ({ page, request }) => {
  // 1080×1920 is an exact preset match, so nothing but the user's explicit
  // "Custom..." pick keeps the width/height inputs on screen.
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=screen');

  const row = page.locator('[data-field-id="display.canvasResolution"]');
  const select = row.locator('select');
  await expect(select).toHaveValue('1080');

  await select.selectOption('custom');
  await expect(row.getByPlaceholder('Width')).toBeVisible();
  await expect(row.getByPlaceholder('Height')).toBeVisible();

  // The canvas card only mounts on the appearance tab, so the pick has to be
  // held by the page above it to survive a round trip through Sleep.
  await page.getByTestId('screen-tab-sleep').click();
  await expect(row).toHaveCount(0);
  await page.getByTestId('screen-tab-appearance').click();

  await expect(select).toHaveValue('custom');
  await expect(row.getByPlaceholder('Width')).toBeVisible();
  await expect(row.getByPlaceholder('Height')).toBeVisible();
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

test('Defaults › Meals: follow global clears a stored time format override', async ({ page, request }) => {
  // Seed: no household global (absent = 12h), meals override 24h.
  await putConfig(request, baseConfig());
  const seeded = await request.put('/api/meals/data', { data: { settings: { timeFormat: '24h' } } });
  expect(seeded.ok()).toBe(true);

  await page.goto('/editor/settings?section=defaults&page=meals');

  // The stored override drives the UI first: 24-hour is selected, not follow.
  const follow = page.getByRole('button', { name: 'Follow global setting' });
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: '24-hour' })).toHaveAttribute('aria-pressed', 'true');

  // MealsSection persists per click (settings-only PUT), and the follow pick
  // serializes the key out entirely — so the override is gone server-side.
  await follow.click();

  await expect
    .poll(async () => (await (await request.get('/api/meals/data')).json()).settings.timeFormat)
    .toBeUndefined();
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
