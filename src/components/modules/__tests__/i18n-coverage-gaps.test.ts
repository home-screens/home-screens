/**
 * Targeted coverage for two i18n call sites that are easy to miss:
 *
 * 1. `WordOfDayModule` translates a dynamic `word-of-day.pos.<pos>` key
 *    where `<pos>` is the entry's `PartOfSpeech` value. A typo in either
 *    the dictionary or the data file would only surface when the kiosk
 *    happens to roll to that day. Walk every `PartOfSpeech` value
 *    against every shipped locale's dictionary so missing entries are
 *    caught immediately.
 *
 * 2. `todoist.dueDate.daysOverdue` is the one truly-plural-form key
 *    where en-US has byte-identical `one`/`other` branches but de-DE
 *    distinguishes (`Tag` vs `Tage`). Resolve both branches against the
 *    real dictionaries — not via a fake translator — to lock the
 *    German plural agreement.
 */

import { describe, it, expect } from 'vitest';
import enUSModules from '@/translations/en-US/modules.json';
import deDEModules from '@/translations/de-DE/modules.json';
import { lookupKey } from '@/i18n/fallback';
import type { Dictionary } from '@/i18n/types';
import {
  getWordsForLocale,
  type PartOfSpeech,
} from '../word-of-day-data';

const POS_VALUES: PartOfSpeech[] = ['adjective', 'noun', 'verb', 'adverb'];

const LOCALE_DICTS: Array<{ tag: string; dict: Dictionary }> = [
  { tag: 'en-US', dict: enUSModules as Dictionary },
  { tag: 'de-DE', dict: deDEModules as Dictionary },
];

describe('WordOfDay part-of-speech keys', () => {
  for (const { tag, dict } of LOCALE_DICTS) {
    describe(tag, () => {
      for (const pos of POS_VALUES) {
        it(`resolves word-of-day.pos.${pos} to a non-empty string`, () => {
          const value = lookupKey(dict, `word-of-day.pos.${pos}`, undefined, tag);
          expect(value).toBeDefined();
          expect(typeof value).toBe('string');
          expect((value as string).length).toBeGreaterThan(0);
          // Resolved strings must not contain interpolation placeholders —
          // these keys take no vars.
          expect(value).not.toMatch(/\{[a-z]+\}/i);
        });
      }
    });
  }

  it('every WordEntry the seed list emits has a translatable pos', () => {
    // Defense in depth: if a future contributor adds a 5th PartOfSpeech
    // value, both the data file and the dictionary must agree. This
    // walks every entry of every shipped locale's seed list and asserts
    // its `pos` value resolves under every locale's dictionary.
    const entries = [
      ...getWordsForLocale('en-US'),
      ...getWordsForLocale('de-DE'),
    ];
    for (const entry of entries) {
      for (const { tag, dict } of LOCALE_DICTS) {
        const value = lookupKey(dict, `word-of-day.pos.${entry.pos}`, undefined, tag);
        expect(value, `${tag}: word-of-day.pos.${entry.pos}`).toBeDefined();
      }
    }
  });
});

describe('todoist.dueDate.daysOverdue plural agreement', () => {
  // en-US has degenerate one/other branches (both "{count}d overdue").
  // The plural-resolution mechanism still has to fire — we lock the
  // exact resolved string for both 1-day and many-day inputs so a future
  // copy edit that diverges the branches is visible in test output.
  it('resolves to en-US compact form for count=1 and count=5', () => {
    const enDict = enUSModules as Dictionary;
    expect(lookupKey(enDict, 'todoist.dueDate.daysOverdue', { count: 1 }, 'en-US')).toBe(
      '1d overdue',
    );
    expect(lookupKey(enDict, 'todoist.dueDate.daysOverdue', { count: 5 }, 'en-US')).toBe(
      '5d overdue',
    );
  });

  // de-DE branches genuinely differ — `Tag` (singular) vs `Tage` (plural).
  // This is the regression that motivated keeping the plural-form object
  // shape rather than flattening: a future edit that replaces the German
  // values with a shared template would silently break agreement.
  it('selects singular Tag for count=1 and plural Tage for count=5 (de-DE)', () => {
    const deDict = deDEModules as Dictionary;
    expect(lookupKey(deDict, 'todoist.dueDate.daysOverdue', { count: 1 }, 'de-DE')).toBe(
      '1 Tag überfällig',
    );
    expect(lookupKey(deDict, 'todoist.dueDate.daysOverdue', { count: 5 }, 'de-DE')).toBe(
      '5 Tage überfällig',
    );
  });
});
