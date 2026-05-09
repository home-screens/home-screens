import { describe, it, expect } from 'vitest';
import { timeToWords, timeToFuzzy } from '../word-time';
import type { Dictionary, TranslateFn } from '@/i18n/types';
import enUSModules from '@/translations/en-US/modules.json';
import deDEModules from '@/translations/de-DE/modules.json';
import { lookupKey } from '@/i18n/fallback';

// Build a real translator that walks the en-US `modules.json` dictionary —
// keeps the assertions tied to the shipped strings (not synthetic test data),
// so any en-US wording change has to be reflected in the dictionary AND the
// tests rather than only the helper.
const t: TranslateFn = (key, vars) => {
  const value = lookupKey(enUSModules as unknown as Dictionary, key, vars, 'en-US');
  return value ?? key;
};

// Same translator wrapper bound to the de-DE modules dictionary. Used by
// the de-DE describe block to prove that:
//   1. `halfPast` reads "halb drei" (= 2:30, *next* hour) — Critical #1.
//   2. Compound minutes use "ein…" not "eins…" — Critical #2.
const tDe: TranslateFn = (key, vars) => {
  const value = lookupKey(deDEModules as unknown as Dictionary, key, vars, 'de-DE');
  return value ?? key;
};

// ── timeToWords ──────────────────────────────────────────────────────

describe('timeToWords', () => {
  it('returns "o\'clock" when minutes is 0', () => {
    expect(timeToWords(t, 3, 0)).toBe("It is three o'clock");
    expect(timeToWords(t, 12, 0)).toBe("It is twelve o'clock");
  });

  it('handles midnight (hour 0) as twelve', () => {
    expect(timeToWords(t, 0, 0)).toBe("It is twelve o'clock");
    expect(timeToWords(t, 0, 15)).toBe('It is twelve fifteen');
  });

  it('handles noon (hour 12) as twelve', () => {
    expect(timeToWords(t, 12, 0)).toBe("It is twelve o'clock");
    expect(timeToWords(t, 12, 30)).toBe('It is twelve thirty');
  });

  it('wraps 24-hour values to 12-hour (e.g. 13 → one)', () => {
    expect(timeToWords(t, 13, 0)).toBe("It is one o'clock");
    expect(timeToWords(t, 23, 45)).toBe('It is eleven forty-five');
  });

  // Single-digit minutes (1–9)
  it('converts single-digit minutes to words', () => {
    expect(timeToWords(t, 8, 1)).toBe('It is eight one');
    expect(timeToWords(t, 8, 5)).toBe('It is eight five');
    expect(timeToWords(t, 8, 9)).toBe('It is eight nine');
  });

  // Teen minutes (10–19)
  it('converts teen minutes to words', () => {
    expect(timeToWords(t, 2, 10)).toBe('It is two ten');
    expect(timeToWords(t, 2, 11)).toBe('It is two eleven');
    expect(timeToWords(t, 2, 15)).toBe('It is two fifteen');
    expect(timeToWords(t, 2, 19)).toBe('It is two nineteen');
  });

  // Tens (20, 30, 40, 50)
  it('converts exact tens to words', () => {
    expect(timeToWords(t, 5, 20)).toBe('It is five twenty');
    expect(timeToWords(t, 5, 30)).toBe('It is five thirty');
    expect(timeToWords(t, 5, 40)).toBe('It is five forty');
    expect(timeToWords(t, 5, 50)).toBe('It is five fifty');
  });

  // Hyphenated compound minutes (21, 35, 59, etc.)
  it('converts compound minutes to hyphenated words', () => {
    expect(timeToWords(t, 7, 21)).toBe('It is seven twenty-one');
    expect(timeToWords(t, 7, 35)).toBe('It is seven thirty-five');
    expect(timeToWords(t, 7, 42)).toBe('It is seven forty-two');
    expect(timeToWords(t, 7, 59)).toBe('It is seven fifty-nine');
  });

  // Edge: minute 1 and minute 59
  it('handles first and last minute of the hour', () => {
    expect(timeToWords(t, 10, 1)).toBe('It is ten one');
    expect(timeToWords(t, 10, 59)).toBe('It is ten fifty-nine');
  });
});

// ── timeToFuzzy ──────────────────────────────────────────────────────

describe('timeToFuzzy', () => {
  // Bucket boundaries — each test verifies the exact edge of a range

  it(':00–:02 → "X o\'clock"', () => {
    expect(timeToFuzzy(t, 3, 0)).toBe("three o'clock");
    expect(timeToFuzzy(t, 3, 2)).toBe("three o'clock");
  });

  it(':03–:07 → "just past X"', () => {
    expect(timeToFuzzy(t, 3, 3)).toBe('just past three');
    expect(timeToFuzzy(t, 3, 7)).toBe('just past three');
  });

  it(':08–:12 → "ten past X"', () => {
    expect(timeToFuzzy(t, 3, 8)).toBe('ten past three');
    expect(timeToFuzzy(t, 3, 12)).toBe('ten past three');
  });

  it(':13–:17 → "quarter past X"', () => {
    expect(timeToFuzzy(t, 3, 13)).toBe('quarter past three');
    expect(timeToFuzzy(t, 3, 15)).toBe('quarter past three');
    expect(timeToFuzzy(t, 3, 17)).toBe('quarter past three');
  });

  it(':18–:22 → "twenty past X"', () => {
    expect(timeToFuzzy(t, 3, 18)).toBe('twenty past three');
    expect(timeToFuzzy(t, 3, 22)).toBe('twenty past three');
  });

  it(':23–:27 → "twenty-five past X"', () => {
    expect(timeToFuzzy(t, 3, 23)).toBe('twenty-five past three');
    expect(timeToFuzzy(t, 3, 27)).toBe('twenty-five past three');
  });

  it(':28–:32 → "half past X"', () => {
    expect(timeToFuzzy(t, 3, 28)).toBe('half past three');
    expect(timeToFuzzy(t, 3, 30)).toBe('half past three');
    expect(timeToFuzzy(t, 3, 32)).toBe('half past three');
  });

  it(':33–:37 → "twenty-five to NEXT"', () => {
    expect(timeToFuzzy(t, 3, 33)).toBe('twenty-five to four');
    expect(timeToFuzzy(t, 3, 37)).toBe('twenty-five to four');
  });

  it(':38–:42 → "twenty to NEXT"', () => {
    expect(timeToFuzzy(t, 3, 38)).toBe('twenty to four');
    expect(timeToFuzzy(t, 3, 42)).toBe('twenty to four');
  });

  it(':43–:47 → "quarter to NEXT"', () => {
    expect(timeToFuzzy(t, 3, 43)).toBe('quarter to four');
    expect(timeToFuzzy(t, 3, 45)).toBe('quarter to four');
    expect(timeToFuzzy(t, 3, 47)).toBe('quarter to four');
  });

  it(':48–:52 → "ten to NEXT"', () => {
    expect(timeToFuzzy(t, 3, 48)).toBe('ten to four');
    expect(timeToFuzzy(t, 3, 52)).toBe('ten to four');
  });

  it(':53–:57 → "almost NEXT"', () => {
    expect(timeToFuzzy(t, 3, 53)).toBe('almost four');
    expect(timeToFuzzy(t, 3, 57)).toBe('almost four');
  });

  it(':58–:59 → "NEXT o\'clock"', () => {
    expect(timeToFuzzy(t, 3, 58)).toBe("four o'clock");
    expect(timeToFuzzy(t, 3, 59)).toBe("four o'clock");
  });

  // Hour wrapping
  it('wraps from hour 11 to hour 12 for "to" phrases', () => {
    expect(timeToFuzzy(t, 11, 45)).toBe('quarter to twelve');
  });

  it('wraps from hour 12 to hour 1 for "to" phrases', () => {
    expect(timeToFuzzy(t, 12, 45)).toBe('quarter to one');
  });

  it('wraps from hour 23 to hour 12 for "to" phrases', () => {
    expect(timeToFuzzy(t, 23, 45)).toBe('quarter to twelve');
  });

  it('handles midnight (hour 0)', () => {
    expect(timeToFuzzy(t, 0, 0)).toBe("twelve o'clock");
    expect(timeToFuzzy(t, 0, 45)).toBe('quarter to one');
  });

  it('handles noon (hour 12)', () => {
    expect(timeToFuzzy(t, 12, 0)).toBe("twelve o'clock");
    expect(timeToFuzzy(t, 12, 30)).toBe('half past twelve');
  });
});

// ── de-DE coverage ──────────────────────────────────────────────────────
//
// Two regression nets:
//   1. `halfPast` must use the *next* hour ("halb drei" = 2:30). The
//      pre-fix string "halb nach {hour}" was both grammatically wrong
//      ("halb nach drei" isn't German) and pointed to the current hour
//      rather than the next.
//   2. Compound minutes (21, 31, 41, 51) must use "ein" not "eins" in
//      the ones slot. The pre-fix `hourWord` lookup produced
//      "einsundzwanzig" — which sounds like a typo to a German speaker.
// Both nets walk the de-DE dictionary the same way the production
// I18nProvider would, so a regression in either the JSON or the helper
// surfaces here.

describe('timeToFuzzy (de-DE)', () => {
  it('14:30 reads "halb drei" (half on the way to three, NOT half past two)', () => {
    expect(timeToFuzzy(tDe, 14, 30)).toBe('halb drei');
  });

  it('13:30 reads "halb zwei"', () => {
    expect(timeToFuzzy(tDe, 13, 30)).toBe('halb zwei');
  });

  it('00:30 reads "halb eins" (half past midnight)', () => {
    expect(timeToFuzzy(tDe, 0, 30)).toBe('halb eins');
  });

  it('"viertel nach" stays on the current hour', () => {
    expect(timeToFuzzy(tDe, 14, 15)).toBe('viertel nach zwei');
  });

  it('"viertel vor" advances to the next hour', () => {
    expect(timeToFuzzy(tDe, 14, 45)).toBe('viertel vor drei');
  });

  it('"kurz vor" is the German "almost NEXT" bucket', () => {
    expect(timeToFuzzy(tDe, 14, 55)).toBe('kurz vor drei');
  });
});

describe('timeToWords (de-DE)', () => {
  it('5:21 uses "ein" (compound) not "eins" (standalone) → "Es ist fünf Uhr einundzwanzig"', () => {
    expect(timeToWords(tDe, 5, 21)).toBe('Es ist fünf Uhr einundzwanzig');
  });

  it('5:31, 5:41, 5:51 also use the compound "ein" form', () => {
    expect(timeToWords(tDe, 5, 31)).toBe('Es ist fünf Uhr einunddreißig');
    expect(timeToWords(tDe, 5, 41)).toBe('Es ist fünf Uhr einundvierzig');
    expect(timeToWords(tDe, 5, 51)).toBe('Es ist fünf Uhr einundfünfzig');
  });

  it('5:23 uses straight ones in compound (no "ein/eins" inflection at digit 3)', () => {
    expect(timeToWords(tDe, 5, 23)).toBe('Es ist fünf Uhr dreiundzwanzig');
  });

  it('1:00 uses "eins" (standalone) for the bare hour', () => {
    expect(timeToWords(tDe, 1, 0)).toBe('Es ist eins Uhr');
  });

  it('8:01 — minute "1" stands alone (digit-only), so it uses "eins"', () => {
    // Minutes 1–9 go through the digit-only path which reads
    // `clock.word.hours.<n>` (the standalone form). German minute "1"
    // therefore reads "eins" here, NOT "ein". This is the convention
    // documented in word-time.ts.
    expect(timeToWords(tDe, 8, 1)).toBe('Es ist acht Uhr eins');
  });
});
