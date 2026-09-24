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
  test('looking up a place persists lat/lon and the place\'s own time zone', async ({ page, request }) => {
    await putConfig(request, baseConfig()); // settings.latitude/longitude start at 0, no timezone
    // /api/geocode is an external-service proxy (Nominatim, plus Open-Meteo for
    // the zone), stubbed so no real upstream call fires. Response shape
    // matches src/app/api/geocode/route.ts.
    await page.route('**/api/geocode?q=*', (route) =>
      route.fulfill({ json: { latitude: 40.7128, longitude: -74.006, displayName: 'New York, NY', timezone: 'America/New_York' } }),
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
    // No zone was saved, so the town's own zone comes with it, whatever zone
    // the browser running this test is in.
    await expect
      .poll(async () => (await getConfig(request)).settings.timezone)
      .toBe('America/New_York');
  });

  test('manual coordinate entry persists', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    // With no zone saved, the page asks the hub for the typed place's zone to
    // offer it; stub that proxy too so no real upstream call fires.
    await page.route('**/api/geocode?lat=*', (route) =>
      route.fulfill({ json: { timezone: 'Europe/London' } }),
    );
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
    // baseConfig has no settings.timeFormat (absent = the en-US 12h), so the select
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

  test('timezone picker persists a zone and resets to not picked', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto('/editor/settings?section=defaults&page=location');

    // No zone saved: the picker says so, and the warning notice asks for one.
    const tz = page.getByRole('combobox', { name: 'Time zone' });
    const notice = page.getByTestId('timezone-unset');
    await expect(tz).toHaveValue('Not picked yet');
    await expect(notice.getByText('Pick your time zone')).toBeVisible();

    // The timezone combobox opens on click and filters as you type; the
    // pinned "Not picked yet" row sits at highlight 0, the filtered matches
    // below it. Saving rides the debounced settings autosave, so poll.
    // (The combobox's aria-label also lands on its listbox, so address the
    // input by role to stay strict-mode-clean.)
    await tz.click();
    await tz.fill('kiri');
    await tz.press('ArrowDown'); // highlight 0: the pinned default row
    await tz.press('ArrowDown'); // highlight 1: Pacific/Kiritimati
    await tz.press('Enter');

    await expect
      .poll(async () => (await getConfig(request)).settings.timezone)
      .toBe('Pacific/Kiritimati');
    await expect(notice).toHaveCount(0);

    // Reopening resets the filter, so the pinned row is highlight 0 again;
    // picking "Not picked yet" serializes the key out of the settings object
    // entirely (empty string = follow the hub's zone, stored as absent).
    await tz.click();
    await tz.press('ArrowDown'); // highlight 0: "Not picked yet"
    await tz.press('Enter');

    await expect
      .poll(async () => (await getConfig(request)).settings.timezone)
      .toBeUndefined();
    await expect(notice).toBeVisible();
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

test('Defaults › Screen: touch alignment saves six numbers, refuses anything else, and goes back to following the rotation', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=screen');

  const row = page.locator('[data-field-id="display.touchAlignment"]');
  const select = row.locator('select');
  const numbers = row.getByLabel('Touch alignment numbers');
  await expect(select).toHaveValue('follow');

  await select.selectOption('leave');
  await expect.poll(async () => (await getConfig(request)).settings.touchMatrix).toEqual([1, 0, 0, 0, 1, 0]);

  // Text that is not six numbers snaps back and leaves what was saved alone.
  await select.selectOption('custom');
  await numbers.fill('1 0 0 sideways');
  await numbers.blur();
  await expect(numbers).toHaveValue('');

  await numbers.fill('-1, 0, 1, 0, 1, 0');
  await numbers.blur();
  await expect.poll(async () => (await getConfig(request)).settings.touchMatrix).toEqual([-1, 0, 1, 0, 1, 0]);

  // The saved numbers come back after a reload, which lands after first render.
  await page.reload();
  await expect(select).toHaveValue('custom');
  await expect(numbers).toHaveValue('-1 0 1 0 1 0');

  await select.selectOption('follow');
  await expect.poll(async () => (await getConfig(request)).settings.touchMatrix).toBeUndefined();
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
  // Seed: no household global (absent = the en-US 12h), meals override 24h.
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

test('Defaults › Meals: the last meal slot cannot be turned off', async ({ page, request }) => {
  // Seeded with the three default slots, so two clicks leave exactly one.
  await putConfig(request, baseConfig());
  const seeded = await request.put('/api/meals/data', {
    data: { settings: { enabledSlots: ['breakfast', 'lunch', 'dinner'] } },
  });
  expect(seeded.ok()).toBe(true);

  await page.goto('/editor/settings?section=defaults&page=meals');
  const dinner = page.locator('[data-field-id="meals.enabledSlots"]').getByRole('button', { name: 'Dinner' });

  for (const name of ['Breakfast', 'Lunch']) {
    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/meals/data') && r.request().method() === 'PUT' && r.ok(),
    );
    await page.locator('[data-field-id="meals.enabledSlots"]').getByRole('button', { name }).click();
    await saved;
  }
  await expect(dinner).toHaveAttribute('aria-pressed', 'true');

  // A week with nothing to fill is not a state the page offers a way out of,
  // so the click is refused outright and there is nothing to save.
  await dinner.click();
  await expect(dinner).toHaveAttribute('aria-pressed', 'true');

  await expect
    .poll(async () => (await (await request.get('/api/meals/data')).json()).settings.enabledSlots)
    .toEqual(['dinner']);
});

test('Defaults › Screen: pause and progress-line controls follow the screen dots', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=screen');

  const pause = page.locator('[data-field-id="display.pauseEnabled"]');
  const progress = page.locator('[data-field-id="display.showRotationProgress"]');
  await expect(pause).toBeVisible();
  await expect(progress).toBeVisible();

  // Both live on the dots, so they leave with them.
  await page.locator('[data-field-id="display.showPaginationDots"]').getByRole('switch').click();
  await expect(pause).toHaveCount(0);
  await expect(progress).toHaveCount(0);
});

test('settings search only offers the pause control while a display shows the dots', async ({ page, request }) => {
  const nav = page.locator('nav');
  const search = nav.getByPlaceholder('Search settings…');
  const pauseResult = nav.getByRole('button', { name: /Allow pause on touchscreen/ });

  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=screen');
  await search.fill('pause');
  await expect(pauseResult).toBeVisible();

  // With the dots off the page has no pause control, so a result would lead
  // nowhere. Search still answers, because the Screen dots help says the
  // gesture lives on the dots — which is the control that brings pause back.
  await putConfig(request, baseConfig({ settings: { showPaginationDots: false } }));
  await page.reload();
  await expect(page.locator('[data-field-id="display.showPaginationDots"]')).toBeVisible();
  await search.fill('pause');
  await expect(pauseResult).toHaveCount(0);
  await expect(nav.getByRole('button', { name: /Screen dots/ })).toBeVisible();
  await expect(nav.getByText('No settings found')).toHaveCount(0);
});

test('Defaults › Screen: a display that turns the dots back on keeps the shared pause controls editable', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    settings: { showPaginationDots: false },
    displays: [
      { id: 'main', name: 'Main', screens: [makeScreen('m1', 'M1', [textModule('MAIN')])] },
      { id: 'kitchen', name: 'Kitchen', screens: [makeScreen('k1', 'K1', [textModule('KIT')])], settings: { showPaginationDots: true } },
    ],
  }));
  await page.goto('/editor/settings?section=defaults&page=screen');
  await expect(page.locator('[data-field-id="display.showPaginationDots"]')).toBeVisible();
  // Kitchen still inherits these, so they stay on the page.
  await expect(page.locator('[data-field-id="display.pauseEnabled"]')).toBeVisible();
  await expect(page.locator('[data-field-id="display.showRotationProgress"]')).toBeVisible();
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

  test('touch alignment is offered on the hub\'s own display only, and saves to that display', async ({ page, request }) => {
    await putConfig(request, multiDisplayConfig());
    const row = page.locator('[data-field-id="display.touchAlignment"]');

    // A display-only Pi keeps its own touch setup, so the row promises nothing there.
    await page.goto('/editor/settings?section=display&id=kitchen&subtab=overrides');
    await expect(page.getByText('Rotation', { exact: true })).toBeVisible();
    await expect(row).toHaveCount(0);

    await page.goto('/editor/settings?section=display&id=main&subtab=overrides');
    await row.locator('select').selectOption('custom');
    await row.getByLabel('Touch alignment numbers').fill('0 1 0 -1 0 1');
    await row.getByLabel('Touch alignment numbers').blur();

    await expect
      .poll(async () => {
        const config = (await getConfig(request)) as unknown as { displays?: DisplayNode[]; settings: { touchMatrix?: number[] } };
        return [config.displays?.find((d) => d.id === 'main')?.touchMatrix, config.settings.touchMatrix];
      })
      .toEqual([[0, 1, 0, -1, 0, 1], undefined]);
  });

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

  test('overriding the screen dots off hides the pause rows and names the override on the overview', async ({ page, request }) => {
    await putConfig(request, multiDisplayConfig());
    await page.goto('/editor/settings?section=display&id=kitchen&subtab=overrides');

    await expect(overrideRow(page, 'Allow pause on touchscreen')).toBeVisible();
    await expect(overrideRow(page, 'Progress line under the screen dots')).toBeVisible();

    const dots = overrideRow(page, 'Screen dots');
    await dots.getByRole('button', { name: 'Override', exact: true }).click();
    await dots.getByRole('switch').click();
    await expect
      .poll(async () => (await kitchenSettings(request)).showPaginationDots)
      .toBe(false);

    await expect(page.getByText('Allow pause on touchscreen', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Auto-resume timeout', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Progress line under the screen dots', { exact: true })).toHaveCount(0);

    await page.goto('/editor/settings?section=display&id=kitchen&subtab=overview');
    await expect(page.getByText('Screen dots: Off (default: On)', { exact: true })).toBeVisible();
  });

  test('a progress-line override is named with its value on the overview and the Defaults banner', async ({ page, request }) => {
    const config = multiDisplayConfig();
    const kitchen = (config as unknown as { displays: DisplayNode[] }).displays.find((d) => d.id === 'kitchen')!;
    kitchen.settings = { showRotationProgress: false };
    await putConfig(request, config);

    await page.goto('/editor/settings?section=display&id=kitchen&subtab=overview');
    await expect(page.getByText('Progress line: Off (default: On)', { exact: true })).toBeVisible();

    await page.goto('/editor/settings?section=defaults&page=screen');
    await expect(page.locator('a[href*="section=display&id=kitchen"]')).toBeVisible();
    await expect(page.locator('strong', { hasText: /^Progress line$/ })).toBeVisible();
    await expect(page.getByText('showRotationProgress')).toHaveCount(0);
  });
});
