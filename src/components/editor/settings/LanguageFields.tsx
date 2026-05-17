'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate, revalidateLoaderCache } from '@/i18n';
import { LOCALES, DEFAULT_LOCALE } from '@/i18n/manifest';
import { reloadPluginTranslations } from '@/lib/plugin-loader';

/**
 * Language fields card for the "Defaults → Location & language" page.
 *
 * Owns two fields on `globalSettings`:
 *   - `locale` (BCP-47, drives the i18n provider for editor / display / remote)
 *   - `formattingLocale` (optional override for date/number formatting only)
 *
 * Locale has no per-display variant — every display in the install shares
 * the same setting — so this section does NOT render an `OverrideRow` or a
 * `findDisplaysOverridingFields` backlink banner. Those affordances are
 * reserved for fields that can actually be overridden per display.
 *
 * Renders as a self-contained card; the parent page provides the
 * breadcrumb + page header above it.
 */
export default function LanguageFields() {
  const t = useTranslate('editor');
  const router = useRouter();
  const { config, updateSettings, saveConfig } = useEditorStore();
  const settings = config?.settings;
  const currentLocale = settings?.locale ?? DEFAULT_LOCALE;
  const currentFormattingLocale = settings?.formattingLocale ?? '';

  // Sorted list of locales with the native label, so the dropdown reads
  // "Deutsch / English / …" in each language's own writing system rather
  // than the English exonyms.
  const localeOptions = useMemo(
    () =>
      Object.values(LOCALES)
        .map((entry) => ({ tag: entry.tag, nativeName: entry.nativeName }))
        .sort((a, b) => a.nativeName.localeCompare(b.nativeName)),
    [],
  );

  // The "More options" disclosure stays closed unless the user has
  // already saved a non-empty `formattingLocale`. That way an unconfigured
  // install hides the advanced toggle behind one click without abandoning
  // anyone who already opted into it.
  const [advancedOpen, setAdvancedOpen] = useState(currentFormattingLocale !== '');

  async function handleLocaleChange(next: string) {
    updateSettings({ locale: next });
    // Persist immediately rather than relying on the parent settings
    // page's debounced auto-save. The parent's auto-save only watches
    // its own local React state; direct `updateSettings(...)` calls on
    // the store bypass it, so we must explicitly flush. `await` matters:
    // `router.refresh()` below re-fetches server-side config, and a
    // refresh that lands before the save would render stale data and
    // make the picker appear not to save.
    await saveConfig();
    // Drop any negatively-cached dictionaries under the new tag (e.g. the
    // first time we ever pick `fr-FR`, the loader had previously cached
    // the en-US fallback under `fr-FR:*` keys). Without this, an install
    // that ships a new locale file mid-session won't see the strings
    // until a hard reload. Cheap to do unconditionally on locale change.
    revalidateLoaderCache(next);
    // Plugin translations are namespace-cached per locale. Refill the
    // cache against the new tag so plugin modules re-render with the
    // right strings; without this, plugin namespaces would stay frozen
    // at the previous locale until a hard reload.
    void reloadPluginTranslations();
    // The editor layout reads `globalSettings.locale` server-side and
    // wires it into `<I18nProvider>`. After the save lands, `router.refresh()`
    // re-runs that server function with the freshly-saved value so the
    // editor surface itself flips to the new language without a hard
    // reload. Without this, the picker writes the new tag but the
    // editor stays mounted with the old `<I18nProvider locale={...}>`
    // until the next page navigation.
    router.refresh();
  }

  async function handleFormattingLocaleChange(next: string) {
    // Empty string = "Same as language" → drop the override entirely so
    // the i18n runtime falls back to `locale`. Storing `undefined` here
    // (instead of an empty string) keeps the on-disk JSON tidy.
    updateSettings({ formattingLocale: next === '' ? undefined : next });
    // See `handleLocaleChange` — explicit save + await before refresh.
    await saveConfig();
    // Formatting-locale changes don't affect the i18n provider tag, but
    // they do affect any server-rendered formatter call sites that may
    // be added later. Refreshing keeps both code paths in sync.
    router.refresh();
  }

  return (
    <>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('languageAndRegion.title')}
      </h3>
      <div className="rounded-lg border border-hs-border bg-hs-panel/40 p-4 space-y-4">
        {/* Language */}
        <div>
          <label
            htmlFor="hs-language-select"
            className="block text-sm font-medium text-hs-text-primary mb-1"
          >
            {t('languageAndRegion.languageLabel')}
          </label>
          <select
            id="hs-language-select"
            value={currentLocale}
            onChange={(e) => handleLocaleChange(e.target.value)}
            className="block w-full rounded-md border border-hs-border bg-hs-card px-3 py-1.5 text-sm text-hs-text-primary focus:border-hs-accent focus:outline-none"
          >
            {localeOptions.map((opt) => (
              <option key={opt.tag} value={opt.tag}>
                {opt.nativeName}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-hs-text-faint">
            {t('languageAndRegion.languageHelp')}
          </p>
        </div>

        {/* More options disclosure */}
        <div className="border-t border-hs-border pt-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-hs-text-muted hover:text-hs-text-body transition-colors"
            aria-expanded={advancedOpen}
          >
            {advancedOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            {t('languageAndRegion.moreOptions')}
          </button>

          {advancedOpen && (
            <div className="mt-3">
              <label
                htmlFor="hs-formatting-locale-select"
                className="block text-sm font-medium text-hs-text-primary mb-1"
              >
                {t('languageAndRegion.formattingLocaleLabel')}
              </label>
              <select
                id="hs-formatting-locale-select"
                value={currentFormattingLocale}
                onChange={(e) => handleFormattingLocaleChange(e.target.value)}
                className="block w-full rounded-md border border-hs-border bg-hs-card px-3 py-1.5 text-sm text-hs-text-primary focus:border-hs-accent focus:outline-none"
              >
                <option value="">
                  {t('languageAndRegion.formattingLocaleSameAsLanguage')}
                </option>
                {localeOptions.map((opt) => (
                  <option key={opt.tag} value={opt.tag}>
                    {opt.nativeName}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-hs-text-faint">
                {t('languageAndRegion.formattingLocaleHelp')}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
