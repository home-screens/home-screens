/**
 * Shared server-side namespace reader.
 *
 * Both the server-rendered display layout (via `server-blob.ts`) and the
 * `/api/i18n/<locale>` route reach into `src/translations/<tag>/<ns>.json`
 * and walk the locale fallback chain. The two used to carry near-identical
 * implementations; this module is the single source of truth so a behavior
 * change (e.g. cache-friendlier reads, atomic-write awareness) only has to
 * happen in one place.
 *
 * **Server-only.** Imports `node:fs` / `node:path` so any accidental use
 * from a client component would fail the build at the Node-builtin
 * import. (We don't pull `import 'server-only'` because that package
 * isn't installed in this repo; the Node-only imports below provide the
 * same compile-time guard.)
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import type { Dictionary } from './types';
import { FALLBACK_LOCALE, isRegisteredLocale } from './manifest';
import { resolveLocaleChain } from './fallback';

const TRANSLATIONS_DIR = path.join(process.cwd(), 'src', 'translations');

/**
 * Read `src/translations/<locale>/<namespace>.json`. Returns `null` on any
 * file or parse error so the caller can keep walking the fallback chain
 * without surfacing the error to the client.
 *
 * Both `locale` and `namespace` MUST be validated by the caller (the
 * registered-locale predicate plus the safe-namespace regex in the API
 * route) — this helper does no validation of its own and trusts its
 * inputs as path components.
 */
async function readNamespaceFile(
  locale: string,
  namespace: string,
): Promise<Dictionary | null> {
  const file = path.join(TRANSLATIONS_DIR, locale, `${namespace}.json`);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as Dictionary;
  } catch {
    return null;
  }
}

/**
 * Walk the locale fallback chain for `namespace`, returning the first
 * dictionary that exists. If even the fallback locale's file is missing,
 * an empty dictionary is returned so the client sees "key not found"
 * lookups instead of a hard failure.
 */
export async function readNamespaceWithFallback(
  locale: string,
  namespace: string,
): Promise<Dictionary> {
  const chain = resolveLocaleChain(locale, FALLBACK_LOCALE);
  for (const tag of chain) {
    if (!isRegisteredLocale(tag) && tag !== FALLBACK_LOCALE) continue;
    const dict = await readNamespaceFile(tag, namespace);
    if (dict) return dict;
  }
  const fallback = await readNamespaceFile(FALLBACK_LOCALE, namespace);
  return fallback ?? {};
}
