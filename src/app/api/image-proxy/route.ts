import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchWithTimeout, withDisplayAuth } from '@/lib/api-utils';
import { createPictureBytesCache, servePicture } from '@/lib/picture-proxy';

export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = ['a.espncdn.com'];

/** @internal */
export const cache = createPictureBytesCache();

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

  return servePicture(cache, url, 'image/png', async () => {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 });
    return { data: await res.arrayBuffer(), declaredType: res.headers.get('Content-Type') };
  });
}, 'Failed to proxy image');
