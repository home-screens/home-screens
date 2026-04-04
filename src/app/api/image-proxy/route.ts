import { NextRequest, NextResponse } from 'next/server';
import { createTTLCache, fetchWithTimeout, withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = ['a.espncdn.com'];

/** @internal */
export const cache = createTTLCache<{ data: ArrayBuffer; contentType: string }>(24 * 60 * 60 * 1000); // 24 hours

function imageResponse(data: ArrayBuffer, contentType: string) {
  return new Response(data, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
}

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  const cached = cache.get(url);
  if (cached) {
    return imageResponse(cached.data, cached.contentType);
  }

  const res = await fetchWithTimeout(url);
  if (!res.ok) return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 });

  const data = await res.arrayBuffer();
  const contentType = res.headers.get('Content-Type') || 'image/png';

  cache.set(url, { data, contentType });

  return imageResponse(data, contentType);
}, 'Failed to proxy image');
