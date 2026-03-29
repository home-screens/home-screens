import { describe, it, expect } from 'vitest';
import { timeToWords, timeToFuzzy } from '../word-time';

// ── timeToWords ──────────────────────────────────────────────────────

describe('timeToWords', () => {
  it('returns "o\'clock" when minutes is 0', () => {
    expect(timeToWords(3, 0)).toBe("It is three o'clock");
    expect(timeToWords(12, 0)).toBe("It is twelve o'clock");
  });

  it('handles midnight (hour 0) as twelve', () => {
    expect(timeToWords(0, 0)).toBe("It is twelve o'clock");
    expect(timeToWords(0, 15)).toBe('It is twelve fifteen');
  });

  it('handles noon (hour 12) as twelve', () => {
    expect(timeToWords(12, 0)).toBe("It is twelve o'clock");
    expect(timeToWords(12, 30)).toBe('It is twelve thirty');
  });

  it('wraps 24-hour values to 12-hour (e.g. 13 → one)', () => {
    expect(timeToWords(13, 0)).toBe("It is one o'clock");
    expect(timeToWords(23, 45)).toBe('It is eleven forty-five');
  });

  // Single-digit minutes (1–9)
  it('converts single-digit minutes to words', () => {
    expect(timeToWords(8, 1)).toBe('It is eight one');
    expect(timeToWords(8, 5)).toBe('It is eight five');
    expect(timeToWords(8, 9)).toBe('It is eight nine');
  });

  // Teen minutes (10–19)
  it('converts teen minutes to words', () => {
    expect(timeToWords(2, 10)).toBe('It is two ten');
    expect(timeToWords(2, 11)).toBe('It is two eleven');
    expect(timeToWords(2, 15)).toBe('It is two fifteen');
    expect(timeToWords(2, 19)).toBe('It is two nineteen');
  });

  // Tens (20, 30, 40, 50)
  it('converts exact tens to words', () => {
    expect(timeToWords(5, 20)).toBe('It is five twenty');
    expect(timeToWords(5, 30)).toBe('It is five thirty');
    expect(timeToWords(5, 40)).toBe('It is five forty');
    expect(timeToWords(5, 50)).toBe('It is five fifty');
  });

  // Hyphenated compound minutes (21, 35, 59, etc.)
  it('converts compound minutes to hyphenated words', () => {
    expect(timeToWords(7, 21)).toBe('It is seven twenty-one');
    expect(timeToWords(7, 35)).toBe('It is seven thirty-five');
    expect(timeToWords(7, 42)).toBe('It is seven forty-two');
    expect(timeToWords(7, 59)).toBe('It is seven fifty-nine');
  });

  // Edge: minute 1 and minute 59
  it('handles first and last minute of the hour', () => {
    expect(timeToWords(10, 1)).toBe('It is ten one');
    expect(timeToWords(10, 59)).toBe('It is ten fifty-nine');
  });
});

// ── timeToFuzzy ──────────────────────────────────────────────────────

describe('timeToFuzzy', () => {
  // Bucket boundaries — each test verifies the exact edge of a range

  it(':00–:02 → "X o\'clock"', () => {
    expect(timeToFuzzy(3, 0)).toBe("three o'clock");
    expect(timeToFuzzy(3, 2)).toBe("three o'clock");
  });

  it(':03–:07 → "just past X"', () => {
    expect(timeToFuzzy(3, 3)).toBe('just past three');
    expect(timeToFuzzy(3, 7)).toBe('just past three');
  });

  it(':08–:12 → "ten past X"', () => {
    expect(timeToFuzzy(3, 8)).toBe('ten past three');
    expect(timeToFuzzy(3, 12)).toBe('ten past three');
  });

  it(':13–:17 → "quarter past X"', () => {
    expect(timeToFuzzy(3, 13)).toBe('quarter past three');
    expect(timeToFuzzy(3, 15)).toBe('quarter past three');
    expect(timeToFuzzy(3, 17)).toBe('quarter past three');
  });

  it(':18–:22 → "twenty past X"', () => {
    expect(timeToFuzzy(3, 18)).toBe('twenty past three');
    expect(timeToFuzzy(3, 22)).toBe('twenty past three');
  });

  it(':23–:27 → "twenty-five past X"', () => {
    expect(timeToFuzzy(3, 23)).toBe('twenty-five past three');
    expect(timeToFuzzy(3, 27)).toBe('twenty-five past three');
  });

  it(':28–:32 → "half past X"', () => {
    expect(timeToFuzzy(3, 28)).toBe('half past three');
    expect(timeToFuzzy(3, 30)).toBe('half past three');
    expect(timeToFuzzy(3, 32)).toBe('half past three');
  });

  it(':33–:37 → "twenty-five to NEXT"', () => {
    expect(timeToFuzzy(3, 33)).toBe('twenty-five to four');
    expect(timeToFuzzy(3, 37)).toBe('twenty-five to four');
  });

  it(':38–:42 → "twenty to NEXT"', () => {
    expect(timeToFuzzy(3, 38)).toBe('twenty to four');
    expect(timeToFuzzy(3, 42)).toBe('twenty to four');
  });

  it(':43–:47 → "quarter to NEXT"', () => {
    expect(timeToFuzzy(3, 43)).toBe('quarter to four');
    expect(timeToFuzzy(3, 45)).toBe('quarter to four');
    expect(timeToFuzzy(3, 47)).toBe('quarter to four');
  });

  it(':48–:52 → "ten to NEXT"', () => {
    expect(timeToFuzzy(3, 48)).toBe('ten to four');
    expect(timeToFuzzy(3, 52)).toBe('ten to four');
  });

  it(':53–:57 → "almost NEXT"', () => {
    expect(timeToFuzzy(3, 53)).toBe('almost four');
    expect(timeToFuzzy(3, 57)).toBe('almost four');
  });

  it(':58–:59 → "NEXT o\'clock"', () => {
    expect(timeToFuzzy(3, 58)).toBe("four o'clock");
    expect(timeToFuzzy(3, 59)).toBe("four o'clock");
  });

  // Hour wrapping
  it('wraps from hour 11 to hour 12 for "to" phrases', () => {
    expect(timeToFuzzy(11, 45)).toBe('quarter to twelve');
  });

  it('wraps from hour 12 to hour 1 for "to" phrases', () => {
    expect(timeToFuzzy(12, 45)).toBe('quarter to one');
  });

  it('wraps from hour 23 to hour 12 for "to" phrases', () => {
    expect(timeToFuzzy(23, 45)).toBe('quarter to twelve');
  });

  it('handles midnight (hour 0)', () => {
    expect(timeToFuzzy(0, 0)).toBe("twelve o'clock");
    expect(timeToFuzzy(0, 45)).toBe('quarter to one');
  });

  it('handles noon (hour 12)', () => {
    expect(timeToFuzzy(12, 0)).toBe("twelve o'clock");
    expect(timeToFuzzy(12, 30)).toBe('half past twelve');
  });
});
