import { test, expect } from '../fixtures';
import { LOCALES } from '@/i18n/manifest';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';

/**
 * Display-surface locale matrix. The editor i18n spec covers switching the
 * locale from the settings UI; this spec covers what the KIOSK actually
 * renders per locale: (a) a dictionary-driven module string and (b)
 * locale-correct date formatting, for every manifest locale, plus the
 * formattingLocale override and the sibling fallback chain end-to-end.
 *
 * The meta locale-surface ratchet (e2e/meta/coverage.spec.ts) requires every
 * manifest locale to be referenced here — the LOCALE_CONDITION table plus the
 * `toBeDefined()` guard make an unreferenced new locale fail at collection.
 */

/**
 * Per-locale translated string: the current-weather icon's aria-label
 * (`weather.conditions.sunny`, via getLocalizedConditionLabel — the stub
 * fixture's icon is 'sun'). Every value differs from the en-US "Sunny", so a
 * fallback-to-English bug fails the assertion in every locale.
 */
const LOCALE_CONDITION: Record<string, string> = {
  'en-US': 'Sunny',
  'de-DE': 'Sonnig',
  'fr-FR': 'Ensoleillé',
  'es-ES': 'Soleado',
  'nl-NL': 'Zonnig',
  'pt-BR': 'Ensolarado',
  'da-DK': 'Sol',
};

/**
 * Weather body whose icon id ('sun') maps to conditions.sunny — the shared
 * fixture uses 'clear-day', which is not in the condition-label map and would
 * fall back to the generic conditions.weather label.
 */
const WEATHER_SUN = {
  hourly: [{ time: '2099-07-07T12:00:00Z', temp: 72, feelsLike: 70, humidity: 55, icon: 'sun', description: 'Clear', windSpeed: 8, precipProbability: 10 }],
  forecast: [{ date: '2099-07-07', high: 78, low: 61, icon: 'sun', description: 'Sunny' }],
};

/** Weather (current view) + a month-name date module on one screen. */
function localeScreenModules() {
  const weather = buildModuleInstance('weather', { view: 'current' });
  const date = buildModuleInstance('date', {
    view: 'minimal', dateFormat: 'MMMM',
    showDayName: false, showYear: false, showWeekNumber: false, showDayOfYear: false,
  });
  return [weather, date];
}

for (const locale of Object.keys(LOCALES)) {
  test(`display renders translated strings and locale formatting in ${locale}`, async ({ page, request }) => {
    const condition = LOCALE_CONDITION[locale];
    expect(condition, `add a LOCALE_CONDITION entry for ${locale}`).toBeDefined();

    await stubModuleData(page, { overrides: { weather: WEATHER_SUN } });
    await putConfig(request, baseConfig({
      screens: [makeScreen('s1', 'S1', localeScreenModules())],
      settings: { ...matrixSettings(), locale },
    }));
    await page.goto('/display');

    // (a) Dictionary string: the weather icon's localized condition label.
    const weather = page.locator('[data-module-id="weather-1"]');
    await expect(weather.locator(`[aria-label="${condition}"]`)).toBeAttached();
    if (locale !== 'en-US') {
      await expect(weather.locator(`[aria-label="${LOCALE_CONDITION['en-US']}"]`)).toHaveCount(0);
    }

    // (b) Formatting: the date module's month name follows the locale. Both
    // date-fns and Intl draw month names from CLDR; compare case-insensitively
    // since casing conventions differ (German capitalizes, Danish does not).
    const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date());
    await expect(page.locator('[data-module-id="date-1"]')).toContainText(new RegExp(month, 'i'));
  });
}

test('formattingLocale overrides display formatting without changing dictionary strings', async ({ page, request }) => {
  await stubModuleData(page, { overrides: { weather: WEATHER_SUN } });
  const weather = buildModuleInstance('weather', { view: 'current' });
  const date = buildModuleInstance('date', {
    view: 'minimal', dateFormat: 'P',
    showDayName: false, showYear: false, showWeekNumber: false, showDayOfYear: false,
  });
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [weather, date])],
    settings: { ...matrixSettings(), locale: 'de-DE', formattingLocale: 'en-US' },
  }));
  await page.goto('/display');

  // Strings stay German…
  await expect(page.locator('[data-module-id="weather-1"] [aria-label="Sonnig"]')).toBeAttached();
  // …while the short date takes the en-US month-first slash shape instead of
  // the German dot-separated shape.
  await expect(page.locator('[data-module-id="date-1"]')).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/);
});

/**
 * Fallback chain end-to-end. `de-AT` is not registered; the chain resolves
 * the registered sibling `de-DE` on every surface — SSR (resolveLocaleChain
 * → readNamespaceWithFallback) and the API route walk the same chain, so
 * server render and client dictionary fetches agree.
 */
test('an unregistered sibling locale falls back to its registered language sibling on the display', async ({ page, request }) => {
  await stubModuleData(page, { overrides: { weather: WEATHER_SUN } });
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', localeScreenModules())],
    settings: { ...matrixSettings(), locale: 'de-AT' },
  }));
  await page.goto('/display');

  // The SSR blob walked de-AT → de-DE, so the German dictionary renders.
  await expect(page.locator('[data-module-id="weather-1"] [aria-label="Sonnig"]')).toBeAttached();
});

test('the i18n API serves the fallback chain per namespace', async ({ request }) => {
  // A registered, partially-translated locale serves its own files for every
  // namespace it ships.
  const de = await request.get('/api/i18n/de-DE?ns=core,modules,weather');
  expect(de.ok()).toBe(true);
  expect(de.headers()['x-locale']).toBe('de-DE');
  const deBody = await de.json();
  expect(Object.keys(deBody).sort()).toEqual(['core', 'modules', 'weather']);
  expect(deBody.weather.conditions.sunny).toBe('Sonnig');

  // An unregistered tag walks the same sibling chain as SSR (de-AT →
  // de-DE), observably via the response headers.
  const at = await request.get('/api/i18n/de-AT?ns=weather');
  expect(at.ok()).toBe(true);
  expect(at.headers()['x-locale']).toBe('de-AT');
  expect(at.headers()['x-locale-registered']).toBe('false');
  expect((await at.json()).weather.conditions.sunny).toBe('Sonnig');

  // Unsafe namespace identifiers are rejected, not path-joined.
  const bad = await request.get('/api/i18n/en-US?ns=../secrets');
  expect(bad.status()).toBe(400);
});
