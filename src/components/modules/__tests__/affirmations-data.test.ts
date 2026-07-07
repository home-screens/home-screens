/**
 * Locks the two invariants the Affirmations module depends on:
 *
 * 1. Seed-list integrity — every locale ships exactly 198 entries with
 *    non-empty text, valid categories/time/day metadata, and coverage of
 *    all five categories.
 * 2. Locale parity — every locale list is index-aligned with en-US: only
 *    `text` is translated; `category` / `time` / `days` / `season` /
 *    `weather` / `attribution` are identical at each index, so the
 *    contextual rotation scorer behaves the same in every language.
 */

import { describe, it, expect } from 'vitest';
import type { AffirmationsCategory } from '@/types/config';
import { getAffirmationsForLocale } from '../affirmations-data';
import { EN_US_AFFIRMATIONS } from '../affirmations-content/en-US';
import { DE_DE_AFFIRMATIONS } from '../affirmations-content/de-DE';
import { FR_FR_AFFIRMATIONS } from '../affirmations-content/fr-FR';
import { ES_ES_AFFIRMATIONS } from '../affirmations-content/es-ES';
import { NL_NL_AFFIRMATIONS } from '../affirmations-content/nl-NL';
import { PT_BR_AFFIRMATIONS } from '../affirmations-content/pt-BR';
import { DA_DK_AFFIRMATIONS } from '../affirmations-content/da-DK';

const EXPECTED_COUNT = 198;

const LOCALE_LISTS = [
  { tag: 'en-US', entries: EN_US_AFFIRMATIONS },
  { tag: 'de-DE', entries: DE_DE_AFFIRMATIONS },
  { tag: 'fr-FR', entries: FR_FR_AFFIRMATIONS },
  { tag: 'es-ES', entries: ES_ES_AFFIRMATIONS },
  { tag: 'nl-NL', entries: NL_NL_AFFIRMATIONS },
  { tag: 'pt-BR', entries: PT_BR_AFFIRMATIONS },
  { tag: 'da-DK', entries: DA_DK_AFFIRMATIONS },
];

describe('affirmations seed lists', () => {
  for (const { tag, entries } of LOCALE_LISTS) {
    describe(tag, () => {
      it(`has exactly ${EXPECTED_COUNT} entries`, () => {
        expect(entries).toHaveLength(EXPECTED_COUNT);
      });

      it('every entry has a non-empty text and a valid category', () => {
        const validCategories: AffirmationsCategory[] = [
          'affirmations', 'compliments', 'motivational', 'gratitude', 'mindfulness',
        ];
        for (const entry of entries) {
          expect(entry.text.trim().length).toBeGreaterThan(0);
          expect(validCategories).toContain(entry.category);
        }
      });

      it('every entry has a valid time value if specified', () => {
        const validTimes = ['morning', 'afternoon', 'evening', 'night', 'anytime', undefined];
        for (const entry of entries) {
          expect(validTimes).toContain(entry.time);
        }
      });

      it('every entry with days has valid day-of-week values (0-6)', () => {
        for (const entry of entries) {
          if (entry.days) {
            for (const d of entry.days) {
              expect(d).toBeGreaterThanOrEqual(0);
              expect(d).toBeLessThanOrEqual(6);
            }
          }
        }
      });

      it('has entries across all five categories', () => {
        const categories = new Set(entries.map((e) => e.category));
        expect(categories.size).toBe(5);
      });

      it('has no duplicate texts (case-insensitive)', () => {
        const seen = new Set<string>();
        for (const entry of entries) {
          const key = entry.text.toLowerCase();
          expect(seen.has(key), `duplicate: ${entry.text}`).toBe(false);
          seen.add(key);
        }
      });
    });
  }
});

describe('locale parity with en-US', () => {
  for (const { tag, entries } of LOCALE_LISTS.slice(1)) {
    it(`${tag} is index-aligned: identical metadata, translated text`, () => {
      expect(entries).toHaveLength(EN_US_AFFIRMATIONS.length);
      entries.forEach((entry, i) => {
        const ref = EN_US_AFFIRMATIONS[i];
        const label = `${tag}[${i}] "${entry.text}"`;
        expect(entry.category, label).toBe(ref.category);
        expect(entry.time, label).toBe(ref.time);
        expect(entry.days, label).toEqual(ref.days);
        expect(entry.season, label).toBe(ref.season);
        expect(entry.weather, label).toBe(ref.weather);
        expect(entry.attribution, label).toBe(ref.attribution);
      });
    });
  }
});

describe('getAffirmationsForLocale', () => {
  it('resolves every configured locale directly', () => {
    for (const { tag, entries } of LOCALE_LISTS) {
      expect(getAffirmationsForLocale(tag)).toBe(entries);
    }
  });

  it('walks the fallback chain for regional variants', () => {
    expect(getAffirmationsForLocale('de-AT')).toBe(DE_DE_AFFIRMATIONS);
    expect(getAffirmationsForLocale('fr-CA')).toBe(FR_FR_AFFIRMATIONS);
  });

  it('falls back to en-US for unconfigured locales', () => {
    expect(getAffirmationsForLocale('xx-XX')).toBe(EN_US_AFFIRMATIONS);
  });
});
