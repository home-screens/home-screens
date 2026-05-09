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
    console.warn(
      `[i18n] buildLocaleBlob: locale "${locale}" is not a valid BCP-47-ish ` +
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

/**
 * Convenience: build the blob and return a JSON-encoded string ready to
 * be embedded inside a `<script type="application/json">` tag. The
 * encoding intentionally escapes any embedded `</script>` so the inline
 * blob can't break out of its host tag, and rejects U+2028 / U+2029
 * which would terminate the script as a JS line break in older
 * runtimes.
 *
 * Built as an explicit char-by-char pass rather than a regex literal so
 * the source file stays plain ASCII — embedding U+2028 / U+2029 in the
 * source itself would defeat the protection it provides downstream.
 *
 * **Currently unused** — the display layout switched to passing the
 * blob directly via the `<I18nProvider blob={...}>` prop instead of
 * round-tripping through an inline script tag. The function is kept
 * (and tested) so that a future SSR-streaming path can reintroduce the
 * inline-tag delivery without re-deriving the security-critical
 * escaping rules.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

export function encodeBlobForScriptTag(blob: Record<string, Dictionary>): string {
  return JSON.stringify(blob)
    .replace(/</g, '\\u003c')
    .split(LINE_SEPARATOR).join('\\u2028')
    .split(PARAGRAPH_SEPARATOR).join('\\u2029');
}
