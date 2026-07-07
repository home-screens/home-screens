/**
 * Per-locale affirmations seed content and locale resolution.
 *
 * The seed lists are content (not UI chrome), so they live alongside the
 * module (in `affirmations-content/`) rather than in the translation
 * dictionaries — keeping `src/translations/*.json` to plain user-facing
 * strings. Same layout as `word-of-day-data.ts` / `word-of-day-words/`.
 *
 * Every locale ships the same 198 entries, index-aligned with en-US: only
 * `text` is translated; the scoring metadata (`category` / `time` / `days` /
 * `season` / `weather`) and `attribution` are identical at each index, so
 * the contextual rotation in AffirmationsModule behaves the same in every
 * language (locked by affirmations-logic.test.ts).
 *
 * `getAffirmationsForLocale(tag)` returns the closest-match list, walking
 * the locale fallback chain so e.g. `de-AT` reuses the `de-DE` list.
 * Unconfigured locales fall back to en-US.
 */

import { resolveLocaleChain } from '@/i18n/fallback';
import { EN_US_AFFIRMATIONS } from './affirmations-content/en-US';
import { DE_DE_AFFIRMATIONS } from './affirmations-content/de-DE';
import { FR_FR_AFFIRMATIONS } from './affirmations-content/fr-FR';
import { ES_ES_AFFIRMATIONS } from './affirmations-content/es-ES';
import { NL_NL_AFFIRMATIONS } from './affirmations-content/nl-NL';
import { PT_BR_AFFIRMATIONS } from './affirmations-content/pt-BR';
import { DA_DK_AFFIRMATIONS } from './affirmations-content/da-DK';
import type { AffirmationEntry } from './affirmations-content/types';

export type { AffirmationEntry };

const AFFIRMATIONS_BY_LOCALE: Record<string, AffirmationEntry[]> = {
  'en-US': EN_US_AFFIRMATIONS,
  'de-DE': DE_DE_AFFIRMATIONS,
  'fr-FR': FR_FR_AFFIRMATIONS,
  'es-ES': ES_ES_AFFIRMATIONS,
  'nl-NL': NL_NL_AFFIRMATIONS,
  'pt-BR': PT_BR_AFFIRMATIONS,
  'da-DK': DA_DK_AFFIRMATIONS,
};

/**
 * Resolve the seed list for `locale`, walking the same fallback chain as
 * the rest of the i18n runtime (so `de-AT` picks up `de-DE`, etc.). Locales
 * with no seed list fall through to en-US.
 */
export function getAffirmationsForLocale(locale: string): AffirmationEntry[] {
  for (const tag of resolveLocaleChain(locale)) {
    const entries = AFFIRMATIONS_BY_LOCALE[tag];
    if (entries) return entries;
  }
  return EN_US_AFFIRMATIONS;
}
