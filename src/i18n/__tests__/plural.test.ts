import { describe, it, expect } from 'vitest';
import { pluralCategory } from '@/i18n/plural';

describe('pluralCategory', () => {
  describe('en (one / other)', () => {
    it.each([
      [0, 'other'],
      [1, 'one'],
      [2, 'other'],
      [42, 'other'],
    ])('en-US: %i → %s', (n, expected) => {
      expect(pluralCategory('en-US', n)).toBe(expected);
    });
  });

  describe('de (one / other)', () => {
    it.each([
      [0, 'other'],
      [1, 'one'],
      [2, 'other'],
      [10, 'other'],
    ])('de-DE: %i → %s', (n, expected) => {
      expect(pluralCategory('de-DE', n)).toBe(expected);
    });
  });

  describe('pl (one / few / many / other)', () => {
    // Polish: 1 → one; 2-4, 22-24, ... → few; 0, 5-21, 25, ... → many;
    // 1.5 → other (decimals).
    it('1 → one', () => {
      expect(pluralCategory('pl-PL', 1)).toBe('one');
    });
    it('2 → few', () => {
      expect(pluralCategory('pl-PL', 2)).toBe('few');
    });
    it('5 → many', () => {
      expect(pluralCategory('pl-PL', 5)).toBe('many');
    });
    it('1.5 → other', () => {
      expect(pluralCategory('pl-PL', 1.5)).toBe('other');
    });
  });

  describe('ar (zero / one / two / few / many / other)', () => {
    // Arabic exercises every CLDR category. Numbers from CLDR's
    // Arabic plural-rule examples.
    it('0 → zero', () => {
      expect(pluralCategory('ar', 0)).toBe('zero');
    });
    it('1 → one', () => {
      expect(pluralCategory('ar', 1)).toBe('one');
    });
    it('2 → two', () => {
      expect(pluralCategory('ar', 2)).toBe('two');
    });
    it('3 → few', () => {
      expect(pluralCategory('ar', 3)).toBe('few');
    });
    it('11 → many', () => {
      expect(pluralCategory('ar', 11)).toBe('many');
    });
    it('100 → other', () => {
      expect(pluralCategory('ar', 100)).toBe('other');
    });
  });

  it('non-finite numbers fall back to "other"', () => {
    expect(pluralCategory('en-US', NaN)).toBe('other');
    expect(pluralCategory('en-US', Infinity)).toBe('other');
  });

  it('caches the rules instance per locale (smoke test)', () => {
    // Same call twice doesn't throw and returns the same answer — the cache
    // hit path is exercised here too.
    expect(pluralCategory('en-US', 1)).toBe('one');
    expect(pluralCategory('en-US', 1)).toBe('one');
  });
});
