/**
 * Server-only helper that builds the inlined translation blob for the
 * display route.
 *
 * The display route ships a fully server-rendered first paint — there is
 * no editor / config form to lazily request translations from. Inlining
 * the merged dictionary into the document `<head>` lets the
 * `<I18nProvider blob={...}>` hydrate the loader cache before the first
 * render and skip the otherwise-mandatory `/api/i18n/<locale>` round-trip.
 */

import type { Dictionary, Namespace } from './types';
import { FALLBACK_LOCALE } from './manifest';
import { readNamespaceWithFallback } from './file-reader';
import { logger } from '@/lib/logger';

const log = logger('i18n');

// Conservative BCP-47-ish guard. Matches a sequence of 1–8 ASCII letters
// followed by zero or more `-`-separated 1–8-alphanumeric subtags. That
// covers every locale we ship today (`en-US`, `pt-BR`, `de`, `de-AT`,
// `zh-Hant-HK`) without permitting path-component characters
// (`.`, `/`, `\`) that would let an attacker traverse outside
// `src/translations`. Rejected tags fall through to the fallback locale
// rather than throwing, since the only path that hits this is a
// server-rendered layout — the route MUST always produce a usable blob.
const VALID_LOCALE_RE = /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/;

/**
 * Build the namespace blob for `locale`. Returns `{ <namespace>: <dict>, ... }`
 * — the same shape `<I18nProvider blob={...}>` accepts, so the caller can
 * pass it through unchanged.
 *
 * Rejects `locale` strings that don't match the BCP-47-ish guard above
 * (logs a warning and substitutes the fallback locale). Concurrent reads
 * via `Promise.all` keep call latency bounded by the slowest namespace,
 * not the sum.
 */
export async function buildLocaleBlob(
  locale: string,
  namespaces: readonly Namespace[] | readonly string[],
): Promise<Record<string, Dictionary>> {
  let safeLocale = locale;
  if (!VALID_LOCALE_RE.test(locale)) {
    log.warn(
      `buildLocaleBlob: locale "${locale}" is not a valid BCP-47-ish ` +
        `tag; falling back to ${FALLBACK_LOCALE}.`,
    );
    safeLocale = FALLBACK_LOCALE;
  }

  const result: Record<string, Dictionary> = {};
  await Promise.all(
    namespaces.map(async (ns) => {
      result[ns] = await readNamespaceWithFallback(safeLocale, ns);
    }),
  );
  return result;
}
