import { test, expect } from '../fixtures';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance } from '@/types/config';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';

/**
 * i18n locale switching (plan Task 15).
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
 * language tab was merged into it (see `settings-route.ts`). `LanguageFields`
 * associates the picker with a `<label>Language</label>` (htmlFor
 * `hs-language-select`), so `getByLabel('Language')` addresses it.
 *
 * Reload note: `LanguageFields.handleLocaleChange` awaits `saveConfig()` then
 * calls `router.refresh()`. The editor layout is `force-dynamic` and re-reads
 * `globalSettings.locale` server-side, re-rendering `<I18nProvider locale>`
 * with a fresh de-DE blob. So the chrome flips live — no `page.reload()` is
 * required for the new dictionary to take effect. The test below asserts the
 * German copy appears after `router.refresh()` alone, which confirms this.
 */

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

test('switching the UI locale persists and changes visible editor copy', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor/settings?section=defaults&page=location');

  // Sanity: the Language card renders in English before we switch.
  await expect(page.getByRole('heading', { name: 'Language & region' })).toBeVisible();

  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/config') && r.request().method() === 'PUT' && r.ok(),
  );
  await page.getByLabel('Language', { exact: true }).selectOption('de-DE');
  await saved;

  // The picker persisted the new tag to the shared config.
  await expect.poll(async () => (await getConfig(request)).settings.locale).toBe('de-DE');

  // …and `router.refresh()` re-rendered the editor chrome in German with no
  // full page reload. The card title is the tightest en/de translated pair:
  // "Language & region" → "Sprache & Region".
  await expect(page.getByRole('heading', { name: 'Sprache & Region' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Language & region' })).toHaveCount(0);
});

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
