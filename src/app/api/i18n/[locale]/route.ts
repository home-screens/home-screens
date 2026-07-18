import { NextRequest, NextResponse } from 'next/server';
import type { Dictionary } from '@/i18n/types';
import { LOCALES, FALLBACK_LOCALE, isRegisteredLocale } from '@/i18n/manifest';
import { readNamespaceWithFallback } from '@/i18n/file-reader';

// `dynamic = 'force-static'` is incompatible with reading
// `request.nextUrl.searchParams` — the route depends on the `?ns=` query
// string, so Next must treat it as dynamic. We still get aggressive caching
// from the explicit `Cache-Control` header below; CDNs and the browser key
// the response by full URL (including the query), so each (locale, ns)
// combination is cached independently.
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ locale: string }> };

// Loose BCP-47 shape. This is not a registration check — it keeps garbage
// out of the X-Locale response header and documents what a locale segment
// may look like. Path safety does not depend on it: readNamespaceWithFallback
// only ever reads registered tags (plus the fallback) from disk.
const LOCALE_SHAPE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

/**
 * GET /api/i18n/{locale}?ns=core[,modules,weather]
 *
 * Returns `{ <namespace>: <dictionary>, ... }`. Unregistered locales walk
 * the same fallback chain as SSR's `buildLocaleBlob` — `de-AT` serves the
 * registered sibling `de-DE`, an unknown language serves en-US — so a
 * client-side dictionary fetch always agrees with what the server rendered.
 * Per-namespace fallback walks the same chain so a partially-translated
 * locale stays usable.
 *
 * Disk reads delegate to `readNamespaceWithFallback` from
 * `@/i18n/file-reader` — that helper is shared with the SSR
 * `buildLocaleBlob` so a future change to file layout / caching only
 * needs to happen in one place.
 */
export async function GET(request: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { locale: rawLocale } = await ctx.params;
  const locale = LOCALE_SHAPE.test(rawLocale) ? rawLocale : FALLBACK_LOCALE;

  const nsParam = request.nextUrl.searchParams.get('ns') ?? 'core';
  const namespaces = nsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Reject anything that doesn't look like a safe namespace identifier.
  // Path traversal would let a caller escape the translations dir.
  const SAFE = /^[a-z][a-z0-9-]*$/i;
  for (const ns of namespaces) {
    if (!SAFE.test(ns)) {
      return NextResponse.json({ error: `Invalid namespace "${ns}"` }, { status: 400 });
    }
  }

  const result: Record<string, Dictionary> = {};
  await Promise.all(
    namespaces.map(async (ns) => {
      result[ns] = await readNamespaceWithFallback(locale, ns);
    }),
  );

  // In production, translations are essentially static — let the browser
  // hold them for an hour and shared caches for a day. In development the
  // long max-age silently breaks the edit-reload loop: hard refresh keeps
  // the document fetch fresh but `fetch('/api/i18n/...')` is still served
  // from the browser's disk cache, so JSON edits never reach the page until
  // the cache TTL expires.
  const cacheControl = process.env.NODE_ENV === 'production'
    ? 'public, max-age=3600, s-maxage=86400'
    : 'no-store';

  return NextResponse.json(result, {
    headers: {
      // Browser + shared caches key by full URL (including `?ns=` query),
      // so different namespace combinations are cached independently.
      'Cache-Control': cacheControl,
      // The tag whose fallback chain was walked (an unregistered tag keeps
      // its own name here; X-Locale-Registered says whether it resolved
      // directly or via the chain).
      'X-Locale': locale,
      'X-Locale-Registered': String(isRegisteredLocale(rawLocale)),
      'X-Available-Locales': Object.keys(LOCALES).join(','),
    },
  });
}
