/**
 * Per-locale "Word of the Day" seed data and selection logic.
 *
 * The seed lists are content (not UI chrome), so they live alongside the
 * module (in `word-of-day-words/`) rather than in the translation
 * dictionaries — keeping `src/translations/*.json` to plain user-facing
 * strings.
 *
 * Each locale ships 732 entries (2 × 366): a two-year supply with no
 * repeats inside a cycle. `getWordEntryForDate` deterministically maps a
 * date to an entry via a cycle-seeded Fisher–Yates shuffle, so every
 * display shows the same word on the same day with no stored state, and
 * each new two-year cycle re-deals the word→date pairing.
 *
 * `getWordsForLocale(tag)` returns the closest-match list, walking the
 * locale fallback chain so e.g. `de-AT` reuses the `de-DE` table.
 * Unconfigured locales fall back to en-US.
 */

import { getDayOfYear } from 'date-fns';
import { resolveLocaleChain } from '@/i18n/fallback';
import { EN_US_WORDS } from './word-of-day-words/en-US';
import { DE_DE_WORDS } from './word-of-day-words/de-DE';
import { FR_FR_WORDS } from './word-of-day-words/fr-FR';
import { ES_ES_WORDS } from './word-of-day-words/es-ES';
import { NL_NL_WORDS } from './word-of-day-words/nl-NL';
import { PT_BR_WORDS } from './word-of-day-words/pt-BR';
import { DA_DK_WORDS } from './word-of-day-words/da-DK';
import type { WordEntry, PartOfSpeech } from './word-of-day-words/types';

export type { WordEntry, PartOfSpeech };

/** Days reserved per year of the cycle (leap-year safe). */
const SLOTS_PER_YEAR = 366;

const WORDS_BY_LOCALE: Record<string, WordEntry[]> = {
  'en-US': EN_US_WORDS,
  'de-DE': DE_DE_WORDS,
  'fr-FR': FR_FR_WORDS,
  'es-ES': ES_ES_WORDS,
  'nl-NL': NL_NL_WORDS,
  'pt-BR': PT_BR_WORDS,
  'da-DK': DA_DK_WORDS,
};

/**
 * Resolve the seed list for `locale`, walking the same fallback chain as
 * the rest of the i18n runtime (so `de-AT` picks up `de-DE`, etc.). Locales
 * with no seed list fall through to en-US.
 */
export function getWordsForLocale(locale: string): WordEntry[] {
  for (const tag of resolveLocaleChain(locale)) {
    const words = WORDS_BY_LOCALE[tag];
    if (words) return words;
  }
  return EN_US_WORDS;
}

/**
 * mulberry32 — tiny deterministic PRNG. Seeded with the cycle number so
 * every client derives the identical permutation with no coordination.
 */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle of `[0..length)` driven by a seeded PRNG. */
function seededPermutation(length: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Deterministically pick the entry for `date`.
 *
 * The list is treated as an N-year cycle (N = ceil(length / 366)). Within
 * a cycle every entry appears at most once; when the cycle rolls over, a
 * new seed re-shuffles the deck so words never land on the same calendar
 * date twice in a row. Non-leap years skip the day-366 slot — that one
 * unused word per cycle is the cost of leap-year safety.
 */
export function getWordEntryForDate(words: WordEntry[], date: Date): WordEntry {
  const year = date.getFullYear();
  const cycleYears = Math.max(1, Math.ceil(words.length / SLOTS_PER_YEAR));
  const cycle = Math.floor(year / cycleYears);
  const order = seededPermutation(words.length, cycle);
  const slot =
    ((year % cycleYears) * SLOTS_PER_YEAR + (getDayOfYear(date) - 1)) % words.length;
  return words[order[slot]];
}
