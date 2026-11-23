/**
 * Words for text the server writes whole, in the household's language.
 *
 * Server-only. Most pages hand the browser a dictionary and translate there.
 * A few things are finished on the server instead: a page's tab name, the
 * small page a plugin's sign-in window lands on. They read the saved locale
 * here, and a key that language has not translated yet reads in English.
 */

import { readConfig } from '@/lib/config';
import { lookupKey, resolveShippedLocale } from '@/i18n/fallback';
import { DEFAULT_LOCALE, FALLBACK_LOCALE } from '@/i18n/manifest';
import { buildLocaleBlob } from '@/i18n/server-blob';
import type { Namespace } from '@/i18n/types';

export interface HouseholdWords {
  /** The shipped locale the words are in, for a page's `lang`. */
  locale: string;
  /** The text for `key` with its `{name}` slots filled; the key itself when no dictionary has it. */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

/** The `namespace` dictionary in the saved locale, English behind it. */
export async function householdWords(namespace: Namespace): Promise<HouseholdWords> {
  const config = await readConfig().catch(() => null);
  const locale = resolveShippedLocale(config?.settings?.locale ?? DEFAULT_LOCALE);
  const chain = locale === FALLBACK_LOCALE ? [locale] : [locale, FALLBACK_LOCALE];
  const dictionaries = await Promise.all(
    chain.map(async (tag) => (await buildLocaleBlob(tag, [namespace]))[namespace]),
  );
  return {
    locale,
    t: (key, vars) => {
      for (const [i, dictionary] of dictionaries.entries()) {
        const text = lookupKey(dictionary, key, vars, chain[i]);
        if (text) return text;
      }
      return key;
    },
  };
}
