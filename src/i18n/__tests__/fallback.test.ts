import { describe, it, expect } from 'vitest';
import { resolveLocaleChain, lookupKey } from '@/i18n/fallback';
import type { Dictionary } from '@/i18n/types';

describe('resolveLocaleChain', () => {
  it('exact tag match — locale equals fallback', () => {
    expect(resolveLocaleChain('en-US', 'en-US')).toEqual(['en-US']);
  });

  it('registered regional tag prepends ahead of fallback', () => {
    expect(resolveLocaleChain('de-DE', 'en-US')).toEqual(['de-DE', 'en-US']);
  });

  it('regional tag falls back to registered sibling (no bare language)', () => {
    // de-AT isn't registered, but de-DE is — surface that as the first
    // fallback. Bare `de` is skipped because `de-DE` already covers it.
    expect(resolveLocaleChain('de-AT', 'en-US')).toEqual(['de-AT', 'de-DE', 'en-US']);
  });

  it('language-only tag falls through to fallback', () => {
    expect(resolveLocaleChain('de', 'en-US')).toEqual(['de', 'en-US']);
  });

  it('unknown language falls back via bare-language → fallback', () => {
    // No siblingDefault for `xx` — bare language stays in the chain.
    expect(resolveLocaleChain('xx-YY', 'en-US')).toEqual(['xx-YY', 'xx', 'en-US']);
  });

  it('chain never contains duplicates', () => {
    const chain = resolveLocaleChain('en-US', 'en-US');
    expect(new Set(chain).size).toBe(chain.length);
  });
});

describe('lookupKey', () => {
  const dict: Dictionary = {
    today: 'Today',
    nested: {
      hello: 'Hello, {name}!',
      count: {
        one: '{count} item',
        other: '{count} items',
      },
    },
    polish: {
      one: '{count} książka',
      few: '{count} książki',
      many: '{count} książek',
      other: '{count} książki',
    },
    arabic: {
      zero: 'لا شيء',
      one: 'واحد',
      two: 'اثنان',
      few: 'قليل',
      many: 'كثير',
      other: 'آخر',
    },
  };

  it('exact match returns the string', () => {
    expect(lookupKey(dict, 'today')).toBe('Today');
  });

  it('returns undefined for missing keys', () => {
    expect(lookupKey(dict, 'doesNotExist')).toBeUndefined();
  });

  it('walks dotted paths', () => {
    expect(lookupKey(dict, 'nested.hello', { name: 'Ada' })).toBe('Hello, Ada!');
  });

  it('returns undefined for partial paths landing on a sub-dictionary', () => {
    // `nested` is an object, not a string — translating to it would be
    // garbage, so the lookup reports a miss and lets the chain continue.
    expect(lookupKey(dict, 'nested')).toBeUndefined();
  });

  it('interpolates {name} placeholders', () => {
    expect(lookupKey(dict, 'nested.hello', { name: 'World' })).toBe('Hello, World!');
  });

  it('leaves unknown {placeholders} untouched (forensic friendly)', () => {
    expect(lookupKey(dict, 'nested.hello')).toBe('Hello, {name}!');
  });

  it('interpolates numeric vars', () => {
    expect(
      lookupKey(dict, 'nested.count', { count: 1 }, 'en-US'),
    ).toBe('1 item');
    expect(
      lookupKey(dict, 'nested.count', { count: 5 }, 'en-US'),
    ).toBe('5 items');
  });

  it('plural selection in Polish (one / few / many / other)', () => {
    expect(lookupKey(dict, 'polish', { count: 1 }, 'pl-PL')).toBe('1 książka');
    expect(lookupKey(dict, 'polish', { count: 2 }, 'pl-PL')).toBe('2 książki');
    expect(lookupKey(dict, 'polish', { count: 5 }, 'pl-PL')).toBe('5 książek');
  });

  it('plural selection in Arabic (every category)', () => {
    expect(lookupKey(dict, 'arabic', { count: 0 }, 'ar')).toBe('لا شيء');
    expect(lookupKey(dict, 'arabic', { count: 1 }, 'ar')).toBe('واحد');
    expect(lookupKey(dict, 'arabic', { count: 2 }, 'ar')).toBe('اثنان');
    expect(lookupKey(dict, 'arabic', { count: 3 }, 'ar')).toBe('قليل');
    expect(lookupKey(dict, 'arabic', { count: 11 }, 'ar')).toBe('كثير');
    expect(lookupKey(dict, 'arabic', { count: 100 }, 'ar')).toBe('آخر');
  });

  it('plural object without a count returns undefined (forces fallback)', () => {
    // Without `count`, we can't pick a form — let the caller try another locale.
    expect(lookupKey(dict, 'polish')).toBeUndefined();
  });

  it('plural fallback to "other" when locale category is absent', () => {
    const sparse: Dictionary = {
      foo: { other: '{count} fallback' },
    };
    // Polish "few" → 2; not present → falls back to `other`.
    expect(lookupKey(sparse, 'foo', { count: 2 }, 'pl-PL')).toBe('2 fallback');
  });
});
