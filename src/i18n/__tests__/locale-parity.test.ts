import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, FALLBACK_LOCALE } from '@/i18n/manifest';
import { BUILT_IN_NAMESPACES } from '@/i18n/types';

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

const TRANSLATIONS_ROOT = join(process.cwd(), 'src/translations');
const ALLOWED_PLURAL_BRANCHES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

/**
 * Flatten a nested dictionary to dotted-path keys. Plural-form objects
 * (every value is a string and every key is a CLDR plural category) are
 * kept whole — they're a single logical entry at the call site, not a
 * dotted sub-tree.
 */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>;
      const allStringValues = Object.values(inner).every((x) => typeof x === 'string');
      const allPluralKeys = Object.keys(inner).every((x) => ALLOWED_PLURAL_BRANCHES.has(x));
      if (allStringValues && allPluralKeys && Object.keys(inner).length > 0) {
        out[path] = inner;
      } else {
        Object.assign(out, flatten(inner, path));
      }
    } else {
      out[path] = v;
    }
  }
  return out;
}

function loadDict(locale: string, namespace: string): Record<string, unknown> | null {
  const path = join(TRANSLATIONS_ROOT, locale, `${namespace}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

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
