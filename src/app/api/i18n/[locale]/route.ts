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

/**
 * GET /api/i18n/{locale}?ns=core[,modules,weather]
 *
 * Returns `{ <namespace>: <dictionary>, ... }`. Unknown locales fall back
 * to en-US silently. Per-namespace fallback walks the same chain so a
 * partially-translated locale stays usable.
 *
 * Disk reads delegate to `readNamespaceWithFallback` from
 * `@/i18n/file-reader` — that helper is shared with the SSR
 * `buildLocaleBlob` so a future change to file layout / caching only
 * needs to happen in one place.
 */
export async function GET(request: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { locale: rawLocale } = await ctx.params;
  // Normalise: if the locale isn't registered, serve the fallback. The
  // resolveLocaleChain helper still walks language siblings, so a request
  // for an unregistered tag like `de-AT` retains its language fallback
  // when `de-DE` is in `LOCALES`.
  const locale = isRegisteredLocale(rawLocale) ? rawLocale : FALLBACK_LOCALE;

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

  return NextResponse.json(result, {
    headers: {
      // Browser + shared caches key by full URL (including `?ns=` query),
      // so different namespace combinations are cached independently.
      // 1h browser, 24h CDN — translations are essentially static.
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Locale': locale,
      'X-Locale-Registered': String(isRegisteredLocale(rawLocale)),
      'X-Available-Locales': Object.keys(LOCALES).join(','),
    },
  });
}
