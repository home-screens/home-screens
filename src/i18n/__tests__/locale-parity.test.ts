import { describe, it, expect } from 'vitest';
import { LOCALES, FALLBACK_LOCALE } from '@/i18n/manifest';
import { BUILT_IN_NAMESPACES } from '@/i18n/types';
import { flatten, loadDict, ALLOWED_PLURAL_BRANCHES } from './helpers/dict';

/**
 * Parity check between every shipped locale and the fallback (`en-US`)
 * for every built-in namespace.
 *
 * What we assert:
 *   1. Every namespace file exists for every registered locale.
 *   2. Non-fallback locales never invent a key that doesn't exist in
 *      en-US — typos would silently 404 against the lookup chain. Plural
 *      branches (`.many` / `.few` / `.two` / `.zero`) are allowed to
 *      exist only in the target locale because en-US only carries
 *      `.one` / `.other`.
 *   3. Plural-form objects use a recognized CLDR plural category so a
 *      copy-paste error (e.g. `many` mis-typed as `meny`) is caught at
 *      test time rather than at runtime.
 *
 * What we do NOT assert here:
 *   - Coverage ratios. Some locales (notably `da-DK`) are a work in
 *     progress and intentionally fall back to en-US for many keys. A
 *     separate coverage report is the right tool for that — failing the
 *     suite on coverage would block partial-translation PRs.
 */

describe('locale parity', () => {
  const locales = Object.keys(LOCALES);

  it('ships every namespace for every registered locale', () => {
    const missing: string[] = [];
    for (const locale of locales) {
      for (const ns of BUILT_IN_NAMESPACES) {
        if (loadDict(locale, ns) === null) missing.push(`${locale}/${ns}.json`);
      }
    }
    expect(missing).toEqual([]);
  });

  for (const ns of BUILT_IN_NAMESPACES) {
    describe(`namespace: ${ns}`, () => {
      const baseline = loadDict(FALLBACK_LOCALE, ns);
      if (!baseline) {
        // Surface the missing fallback explicitly — every other assertion
        // would otherwise compare against an empty set and pass.
        it('fallback file exists', () => expect(baseline).not.toBeNull());
        return;
      }
      const baselineKeys = new Set(Object.keys(flatten(baseline)));

      for (const locale of locales) {
        if (locale === FALLBACK_LOCALE) continue;
        it(`${locale}: every key exists in the fallback`, () => {
          const dict = loadDict(locale, ns);
          if (!dict) return; // covered by the "ships every namespace" test
          const orphans = Object.keys(flatten(dict)).filter((k) => !baselineKeys.has(k));
          expect(orphans, `unexpected keys in ${locale}/${ns}.json`).toEqual([]);
        });
      }
    });
  }

  it('plural-form objects use only recognized CLDR categories', () => {
    const violations: string[] = [];
    for (const locale of locales) {
      for (const ns of BUILT_IN_NAMESPACES) {
        const dict = loadDict(locale, ns);
        if (!dict) continue;
        const flat = flatten(dict);
        for (const [path, value] of Object.entries(flat)) {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const branch of Object.keys(value)) {
              if (!ALLOWED_PLURAL_BRANCHES.has(branch)) {
                violations.push(`${locale}/${ns}.json :: ${path}.${branch}`);
              }
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
