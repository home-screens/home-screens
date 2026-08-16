'use client';

import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import { DEFAULT_TIME_FORMAT } from '@/types/config';

/**
 * Time format card for the "Defaults → Location & language" page.
 *
 * Owns `config.settings.timeFormat` (typed `GlobalSettings`) — the household
 * 12/24-hour preference the calendar module and the meal planner resolve
 * against. Like locale, it has no per-display variant, so this section
 * renders no `OverrideRow` (see LanguageFields for the same stance).
 */
export default function TimeFormatFields() {
  const t = useTranslate('editor');
  const { config, updateSettings, saveConfig } = useEditorStore();
  const currentTimeFormat = config?.settings?.timeFormat ?? DEFAULT_TIME_FORMAT;

  async function handleChange(next: string) {
    // Picking 12h stores `undefined` — the field is dropped, since 12h is
    // the absent-value default — and picking 24h stores the explicit
    // override. Keeps the on-disk JSON tidy, exactly like
    // `formattingLocale`'s empty-string rule in LanguageFields.
    updateSettings({ timeFormat: next === DEFAULT_TIME_FORMAT ? undefined : (next as '24h') });
    // Persist immediately — the settings page's debounced auto-save only
    // watches its own local state, so a direct updateSettings must flush.
    // Unlike the language picker, no `router.refresh()` follows: time
    // format affects only client-rendered module content, not
    // server-rendered chrome.
    await saveConfig();
  }

  return (
    <>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('languageAndRegion.timeFormatLabel')}
      </h3>
      <div className="rounded-lg border border-hs-border bg-hs-panel/40 p-4" data-field-id="location.timeFormat">
        <select
          id="hs-timeformat-select"
          aria-label={t('languageAndRegion.timeFormatLabel')}
          value={currentTimeFormat}
          onChange={(e) => handleChange(e.target.value)}
          className="block w-full rounded-md border border-hs-border bg-hs-card px-3 py-1.5 text-sm text-hs-text-primary focus:border-hs-accent focus:outline-none"
        >
          <option value="12h">{t('languageAndRegion.timeFormat12h')}</option>
          <option value="24h">{t('languageAndRegion.timeFormat24h')}</option>
        </select>
        <p className="mt-1 text-xs text-hs-text-faint">
          {t('languageAndRegion.timeFormatHelp')}
        </p>
      </div>
    </>
  );
}
