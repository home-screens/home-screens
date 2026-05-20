/**
 * Cached `Intl.PluralRules` lookup. Constructing a `PluralRules` instance is
 * cheap-ish but not free, and key lookup happens on every render — so we
 * memoize per locale tag.
 */

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

const CACHE = new Map<string, Intl.PluralRules>();

function getRules(locale: string): Intl.PluralRules {
  let rules = CACHE.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    CACHE.set(locale, rules);
  }
  return rules;
}

/**
 * Return the CLDR plural category for `n` in `locale`.
 *
 * Falls back to `'other'` if `Intl.PluralRules` is missing (e.g. some test
 * runtimes) or if `n` is not a finite number.
 */
export function pluralCategory(locale: string, n: number): PluralCategory {
  if (typeof Intl === 'undefined' || typeof Intl.PluralRules !== 'function') {
    return 'other';
  }
  if (!Number.isFinite(n)) return 'other';
  return getRules(locale).select(n) as PluralCategory;
}
