import { test, expect } from '../fixtures';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance } from '@/types/config';
import { LOCALES } from '@/i18n/manifest';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';

/**
 * i18n locale switching (plan Task 15 + Task 20).
 *
 * Two independent axes:
 *   - `GlobalSettings.locale` drives the UI language across editor / display
 *     / remote. Changing it in the Language card (Defaults › Location page)
 *     persists to config and re-renders the editor chrome in the new tongue.
 *   - `GlobalSettings.formattingLocale` overrides *only* date/number
 *     formatting, independent of the UI language — the classic "read English
 *     UI but format dates the German way" case.
 *
 * The Language card renders on the Location defaults page: the standalone
 * language tab was merged into it (the `location` entry in the settings
 * page renders `<LanguageFields />` above `LocationSection`). `LanguageFields`
 * associates the picker with a `<label>Language</label>` (htmlFor
 * `hs-language-select`), so `getByLabel('Language')` addresses it.
 *
 * Reload note: `LanguageFields.handleLocaleChange` awaits `saveConfig()` then
 * calls `router.refresh()`. The editor layout is `force-dynamic` and re-reads
 * `settings.locale` server-side, re-rendering `<I18nProvider locale>`
 * with a fresh locale blob. So the chrome flips live — no `page.reload()` is
 * required for the new dictionary to take effect. The loop below asserts the
 * translated copy appears after `router.refresh()` alone, which confirms this.
 */

/**
 * One distinctive, translated chrome string per locale — the Location page's
 * `<h1>` (`settings.locationAndLanguagePage.title`), rendered by
 * `src/app/(editor)/editor/settings/page.tsx`. Every locale translates it, so
 * a silent fallback to English fails the assertion for all seven.
 *
 * (Historically this note explained that the Language card heading was a worse
 * anchor because some locales — da-DK especially — still rendered it in
 * English. That gap is closed: `translation-coverage.test.ts` now holds every
 * locale at zero untranslated values, so either string would work.)
 *
 * Each value below is the locale's `settings.sidebar.navLabels.location`,
 * which is now the single source for the sidebar row, the breadcrumb and the
 * page's own H1; they used to be three separate strings per locale, and
 * da-DK had already drifted ("Placering & sprog" as the title against
 * "Placering og sprog" in the nav). Each value is verified to (a) exist in
 * that locale's `src/translations/<locale>/editor.json` and (b) differ from
 * the en-US string
 * (so a silent fallback to English fails the assertion). en-US is included so
 * the loop covers every manifest locale by construction: adding a locale to
 * `manifest.ts` without a row here fails the `expect(chrome).toBeDefined()`
 * guard at test-collection time.
 */
const LOCALE_CHROME: Record<string, string> = {
  'en-US': 'Location & language',
  'de-DE': 'Standort & Sprache',
  'fr-FR': 'Lieu et langue',
  'es-ES': 'Ubicación e idioma',
  'nl-NL': 'Locatie & taal',
  'pt-BR': 'Localização e idioma',
  'da-DK': 'Placering og sprog',
};

for (const locale of Object.keys(LOCALES)) {
  test(`switching the UI locale to ${locale} persists and re-renders editor chrome`, async ({
    page,
    request,
  }) => {
    const heading = LOCALE_CHROME[locale];
    // Manifest ratchet: every registered locale must map to a chrome string.
    expect(heading, `add a LOCALE_CHROME entry for ${locale}`).toBeDefined();

    // Start from a locale guaranteed to differ from the target so the picker
    // fires a real `change` (selecting the already-selected value wouldn't PUT,
    // and the `waitForResponse` below would hang).
    const startLocale = locale === 'en-US' ? 'de-DE' : 'en-US';
    await putConfig(request, baseConfig({ settings: { locale: startLocale } }));
    await page.goto('/editor/settings?section=defaults&page=location');

    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok(),
    );
    // Address the picker by its stable id rather than its `<label>` — the label
    // text ("Language" / "Sprache" / …) is itself translated by `startLocale`,
    // so `getByLabel('Language')` only works when starting from English.
    await page.locator('#hs-language-select').selectOption(locale);
    await saved;

    // The picker persisted the new tag to the shared config.
    await expect.poll(async () => (await getConfig(request)).settings.locale).toBe(locale);

    // `router.refresh()` re-rendered the editor chrome in the new language with
    // no full page reload — the page heading now reads in the target tongue.
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();

    // Fallback-to-English regression guard: once switched away from English,
    // the English heading must be gone (skip when English *is* the target).
    if (locale !== 'en-US') {
      await expect(
        page.getByRole('heading', { name: LOCALE_CHROME['en-US'] }),
      ).toHaveCount(0);
    }
  });
}

/** A minimal `date` module whose short-date format (`P`) is locale-shaped:
 *  en-US renders "07/08/2026" (slash, month-first), de-DE "08.07.2026"
 *  (dot, day-first). The structural slash-vs-dot difference is month/day
 *  independent, so the assertion never depends on the wall-clock date. */
function dateModule(): ModuleInstance {
  return {
    id: 'date-fmt',
    type: 'date',
    position: { x: 100, y: 100 },
    size: { w: 400, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config: {
      view: 'minimal',
      dateFormat: 'P',
      showDayName: false,
      showYear: false,
      showWeekNumber: false,
      showDayOfYear: false,
      accentColor: '#22d3ee',
    },
  } as ModuleInstance;
}

test('formattingLocale overrides date formatting without changing the UI language', async ({
  page,
  request,
}) => {
  const screens = [makeScreen('screen-1', 'Screen 1', [dateModule()])];

  // Baseline: UI + formatting both en-US → slash-separated, month-first date.
  const en = await renderOnDisplay(
    page,
    request,
    baseConfig({ settings: { locale: 'en-US' }, screens }),
  );
  await expect(en.module('date')).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/);

  // Keep the UI language en-US but set formattingLocale=de-DE. Only the date
  // formatting should flip to the German dot-separated, day-first shape; this
  // proves the formatting override is independent of the UI locale.
  const de = await renderOnDisplay(
    page,
    request,
    baseConfig({ settings: { locale: 'en-US', formattingLocale: 'de-DE' }, screens }),
  );
  await expect(de.module('date')).toHaveText(/^\d{2}\.\d{2}\.\d{4}$/);
});
