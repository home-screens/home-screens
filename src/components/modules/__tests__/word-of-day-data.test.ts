/**
 * Locks the two invariants the Word of the Day module depends on:
 *
 * 1. Seed-list integrity — every locale ships exactly 732 entries
 *    (2 × 366, a full two-year cycle), all unique, with valid parts of
 *    speech and non-empty definitions.
 * 2. Selection math — `getWordEntryForDate` is deterministic, never
 *    repeats a word within a cycle, and re-shuffles between cycles so
 *    the word→date pairing doesn't repeat year over year.
 */

import { describe, it, expect } from 'vitest';
import {
  getWordsForLocale,
  getWordEntryForDate,
  type PartOfSpeech,
} from '../word-of-day-data';
import { EN_US_WORDS } from '../word-of-day-words/en-US';
import { DE_DE_WORDS } from '../word-of-day-words/de-DE';

const VALID_POS: PartOfSpeech[] = ['adjective', 'noun', 'verb', 'adverb'];
const EXPECTED_COUNT = 732; // 2 × 366

const LOCALE_LISTS = [
  { tag: 'en-US', words: EN_US_WORDS },
  { tag: 'de-DE', words: DE_DE_WORDS },
];

describe('word-of-day seed lists', () => {
  for (const { tag, words } of LOCALE_LISTS) {
    describe(tag, () => {
      it(`has exactly ${EXPECTED_COUNT} entries`, () => {
        expect(words).toHaveLength(EXPECTED_COUNT);
      });

      it('has no duplicate words (case-insensitive)', () => {
        const seen = new Map<string, string>();
        for (const entry of words) {
          const key = entry.word.toLowerCase();
          expect(seen.has(key), `duplicate: ${entry.word}`).toBe(false);
          seen.set(key, entry.word);
        }
      });

      it('every entry has a valid pos and non-empty word/definition', () => {
        for (const entry of words) {
          expect(VALID_POS, `${entry.word}: pos=${entry.pos}`).toContain(entry.pos);
          expect(entry.word.trim().length).toBeGreaterThan(0);
          expect(entry.definition.trim().length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe('getWordsForLocale', () => {
  it('resolves configured locales directly', () => {
    expect(getWordsForLocale('en-US')).toBe(EN_US_WORDS);
    expect(getWordsForLocale('de-DE')).toBe(DE_DE_WORDS);
  });

  it('walks the fallback chain for regional variants', () => {
    expect(getWordsForLocale('de-AT')).toBe(DE_DE_WORDS);
  });

  it('falls back to en-US for unconfigured locales', () => {
    expect(getWordsForLocale('fr-FR')).toBe(EN_US_WORDS);
    expect(getWordsForLocale('xx-XX')).toBe(EN_US_WORDS);
  });
});

/** Every calendar day in [startYear, endYear], inclusive. */
function everyDay(startYear: number, endYear: number): Date[] {
  const days: Date[] = [];
  const d = new Date(startYear, 0, 1);
  while (d.getFullYear() <= endYear) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

describe('getWordEntryForDate', () => {
  it('is deterministic for the same date', () => {
    const date = new Date(2026, 6, 3);
    const a = getWordEntryForDate(EN_US_WORDS, date);
    const b = getWordEntryForDate(EN_US_WORDS, new Date(2026, 6, 3));
    expect(a).toBe(b);
  });

  it('never repeats a word within a two-year cycle', () => {
    // 2026–2027 sit inside one cycle (2026/2 === 2027/2 === 1013).
    const seen = new Set<string>();
    for (const day of everyDay(2026, 2027)) {
      const entry = getWordEntryForDate(EN_US_WORDS, day);
      expect(seen.has(entry.word), `${entry.word} repeated on ${day.toDateString()}`).toBe(
        false,
      );
      seen.add(entry.word);
    }
    // 730 days (neither year is a leap year) → 730 distinct words.
    expect(seen.size).toBe(730);
  });

  it('covers leap years without breaking uniqueness', () => {
    // 2028–2029: 2028 is a leap year → 731 days, all distinct.
    const seen = new Set<string>();
    for (const day of everyDay(2028, 2029)) {
      seen.add(getWordEntryForDate(EN_US_WORDS, day).word);
    }
    expect(seen.size).toBe(731);
  });

  it('re-shuffles the word→date pairing between cycles', () => {
    // Compare the same calendar year position across two adjacent
    // cycles. A fixed mapping would match on every date; a re-shuffled
    // deck matches only by rare coincidence (< 1% of dates).
    const days2026 = everyDay(2026, 2026);
    let matches = 0;
    for (const day of days2026) {
      const nextCycle = new Date(day);
      nextCycle.setFullYear(2028);
      if (
        getWordEntryForDate(EN_US_WORDS, day).word ===
        getWordEntryForDate(EN_US_WORDS, nextCycle).word
      ) {
        matches++;
      }
    }
    expect(matches).toBeLessThan(10);
  });

  it('handles short lists without crashing', () => {
    const tiny = EN_US_WORDS.slice(0, 3);
    for (const day of everyDay(2026, 2026)) {
      expect(tiny).toContain(getWordEntryForDate(tiny, day));
    }
  });
});
