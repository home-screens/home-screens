import { NextResponse } from 'next/server';
import { parseItems } from '@/lib/rss';
import { cachedProxyRoute, fetchWithTimeout } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const DEFAULT_FEED = 'https://feeds.bbci.co.uk/news/rss.xml';

const { GET, cache } = cachedProxyRoute<{ items: unknown[] }>({
  auth: 'display',
  ttlMs: 5 * 60 * 1000, // 5 minutes
  cacheKey: (req) => req.nextUrl.searchParams.get('feed') || DEFAULT_FEED,
  execute: async (req) => {
    const feed = req.nextUrl.searchParams.get('feed') || DEFAULT_FEED;

    try {
      const url = new URL(feed);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return NextResponse.json({ error: 'Invalid feed URL scheme' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid feed URL' }, { status: 400 });
    }

    const res = await fetchWithTimeout(feed);
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch RSS feed' }, { status: 502 });

    const xml = await res.text();
    const items = parseItems(xml);
    return { items };
  },
  errorMessage: 'Failed to fetch news',
});

/** @internal */
export { GET, cache };
