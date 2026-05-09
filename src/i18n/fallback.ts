/**
 * Locale fallback chain + dictionary lookup with `{name}` interpolation
 * and CLDR plural selection.
 *
 * Pure functions — no module-level state, no side effects, no React. Tested
 * directly in `__tests__/fallback.test.ts`.
 */

import type { Dictionary } from './types';
import { isRegisteredLocale } from './manifest';
import { pluralCategory, type PluralCategory } from './plural';

/**
 * Build the lookup chain for `locale`.
 *
 * Examples (with `de-DE` registered):
 * - `"de-DE"` → `["de-DE", "en-US"]`
 * - `"de-AT"` → `["de-AT", "de-DE", "en-US"]`  (regional fallback to a registered sibling)
 * - `"de"`    → `["de", "en-US"]`
 *
 * Examples (with `de-DE` NOT registered):
 * - `"de-AT"` → `["de-AT", "de", "en-US"]`     (fall through to language subtag)
 *
 * The chain never contains duplicates and always ends with `fallback` unless
 * the active locale already equals the fallback.
 */
export function resolveLocaleChain(locale: string, fallback = 'en-US'): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();

  const push = (tag: string) => {
    if (!tag) return;
    if (seen.has(tag)) return;
    seen.add(tag);
    chain.push(tag);
  };

  push(locale);

  // Language-subtag handling: for `de-AT`, look at `de-*`.
  const dashIdx = locale.indexOf('-');
  if (dashIdx > 0) {
    const language = locale.slice(0, dashIdx);
    const siblingDefault = languageSiblingDefault(language);

    if (siblingDefault === locale) {
      // The active locale IS the language's preferred regional default.
      // No need for a separate bare-language step — the regional tag
      // already covers everything we'd find under `de` for `de-DE`.
      // Chain stays compact: ['de-DE', fallback].
    } else if (siblingDefault && isRegisteredLocale(siblingDefault)) {
      // Different region (e.g. `de-AT` → prefer `de-DE`). Skip the bare
      // language since the registered sibling supersedes it.
      push(siblingDefault);
    } else {
      // No registered sibling — fall through to the bare language tag so
      // language-only dictionaries (if any are ever shipped) still match.
      push(language);
    }
  }

  push(fallback);
  return chain;
}

/**
 * Map a bare language tag to its preferred regional default. Kept tiny on
 * purpose — only the languages we actually ship as v1 locales. If a language
 * isn't here, the chain falls through to the language subtag and then to the
 * fallback locale.
 */
function languageSiblingDefault(language: string): string | undefined {
  switch (language) {
    case 'en': return 'en-US';
    case 'de': return 'de-DE';
    case 'fr': return 'fr-FR';
    case 'es': return 'es-ES';
    case 'nl': return 'nl-NL';
    case 'pt': return 'pt-BR';
    default: return undefined;
  }
}

/**
 * Look up `key` (dotted path) in `dictionary`, applying `{name}` interpolation
 * from `vars`. Returns `undefined` when the key isn't found, so callers can
 * walk a fallback chain.
 *
 * Plural-form path: when the resolved value is an object whose keys are CLDR
 * plural categories (`zero`/`one`/`two`/`few`/`many`/`other`) and `vars.count`
 * is a number, the matching category is selected (with `'other'` as the safety
 * net). The `locale` argument decides which `Intl.PluralRules` instance to use.
 */
export function lookupKey(
  dictionary: Dictionary,
  key: string,
  vars?: Record<string, string | number>,
  locale = 'en-US',
): string | undefined {
  const parts = key.split('.');
  let cursor: string | Dictionary | undefined = dictionary;

  for (const part of parts) {
    if (cursor == null || typeof cursor === 'string') return undefined;
    cursor = (cursor as Dictionary)[part];
  }

  if (cursor == null) return undefined;

  // Plural-form object — pick the right branch based on `count`.
  if (typeof cursor === 'object') {
    if (vars && typeof vars.count === 'number' && isPluralFormObject(cursor)) {
      const cat = pluralCategory(locale, vars.count);
      const branch = cursor[cat] ?? cursor.other;
      if (typeof branch === 'string') return interpolate(branch, vars);
    }
    // Returning an entire sub-dictionary as a translation makes no sense —
    // surface this as "key not found" so the fallback chain keeps walking.
    return undefined;
  }

  return interpolate(cursor, vars);
}

const PLURAL_CATEGORY_KEYS = new Set<string>([
  'zero', 'one', 'two', 'few', 'many', 'other',
]);

function isPluralFormObject(obj: Dictionary): obj is Record<PluralCategory, string> {
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  // A plural-form object's keys are all CLDR categories AND every value is a
  // string. We require `other` to be present (CLDR rules guarantee it).
  if (!('other' in obj)) return false;
  for (const k of keys) {
    if (!PLURAL_CATEGORY_KEYS.has(k)) return false;
    if (typeof obj[k] !== 'string') return false;
  }
  return true;
}

/** Replace `{name}` placeholders with the matching value from `vars`. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name];
    return v == null ? match : String(v);
  });
}
