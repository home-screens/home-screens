import { describe, it, expect } from 'vitest';
import { LOCALES, FALLBACK_LOCALE } from '@/i18n/manifest';
import { BUILT_IN_NAMESPACES } from '@/i18n/types';
import { flatten, loadDict } from './helpers/dict';

/**
 * Missing-key ratchet — the *reverse* direction of `locale-parity.test.ts`.
 *
 * `locale-parity.test.ts` asserts no locale invents a key that en-US lacks
 * (orphans). This file asserts the opposite: every key that exists in the
 * en-US baseline also exists in every other shipped locale. A new English
 * string merged without its translations turns this red.
 *
 * Why a hard ratchet and not a coverage report: as of this writing all seven
 * shipped locales carry 100% of the en-US key set for every namespace (3350
 * keys each). The older comment in `locale-parity.test.ts` about da-DK being a
 * work-in-progress is stale. Since parity is complete, enforcing it prevents
 * regressions rather than blocking WIP work.
 *
 * Escape hatch: if a locale legitimately ships incomplete for a namespace,
 * add an explicit `{ locale, namespace }` entry to `KNOWN_INCOMPLETE` with a
 * comment explaining why. An empty list means "100% parity is required."
 */

/**
 * Explicit allowlist for locale/namespace pairs that are knowingly partial.
 * Empty by design — every locale is currently at full parity. Add entries
 * here (with a reason comment) instead of weakening the assertion.
 */
const KNOWN_INCOMPLETE: ReadonlyArray<{ locale: string; namespace: string }> = [];

function isAllowlisted(locale: string, namespace: string): boolean {
  return KNOWN_INCOMPLETE.some((e) => e.locale === locale && e.namespace === namespace);
}

describe('dictionary completeness (missing-key ratchet)', () => {
  const locales = Object.keys(LOCALES).filter((l) => l !== FALLBACK_LOCALE);

  for (const ns of BUILT_IN_NAMESPACES) {
    describe(`namespace: ${ns}`, () => {
      const baseline = loadDict(FALLBACK_LOCALE, ns);
      if (!baseline) {
        it('fallback file exists', () => expect(baseline).not.toBeNull());
        return;
      }
      const baselineKeys = Object.keys(flatten(baseline));

      for (const locale of locales) {
        it(`${locale}: has every en-US key`, () => {
          if (isAllowlisted(locale, ns)) return;
          const dict = loadDict(locale, ns);
          expect(dict, `${locale}/${ns}.json is missing entirely`).not.toBeNull();
          const localeKeys = new Set(Object.keys(flatten(dict!)));
          const missing = baselineKeys.filter((k) => !localeKeys.has(k));
          expect(missing, `keys present in en-US/${ns}.json but missing from ${locale}/${ns}.json`).toEqual([]);
        });
      }
    });
  }

  it('every registered locale is at full parity (no allowlisted gaps drift unnoticed)', () => {
    // Guards the allowlist itself: if someone allowlists a pair, this test
    // documents the current expectation that the allowlist is empty. Update
    // this count deliberately when adding a genuine WIP locale.
    expect(KNOWN_INCOMPLETE).toEqual([]);
  });
});
