import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { fetchWithAllowedRedirects } from '@/lib/guarded-fetch';
import { createPictureBytesCache, servePicture } from '@/lib/picture-proxy';
import { isSafeExternalUrl } from '@/lib/url-safety';

export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = ['a.espncdn.com'];

/**
 * The most one picture may weigh. These are team logos, a few hundred
 * kilobytes at the outside; the cap is there so an answer that never ends
 * cannot fill the hub's memory.
 */
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

/** @internal */
export const cache = createPictureBytesCache();

/** An https address on its usual port with no sign-in in it. */
function isPlainHttps(url: URL): boolean {
  return url.protocol === 'https:' && url.port === '' && !url.username && !url.password;
}

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
    }
    if (!isPlainHttps(parsed)) {
      return NextResponse.json({ error: 'Only https addresses are allowed' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  return servePicture(cache, url, 'image/png', async () => {
    // The host check above is about the address that was asked for. What
    // answers may redirect, so every hop is held to the same host and to
    // https before it is fetched, and the body is read against a cap.
    const result = await fetchWithAllowedRedirects(url, {
      allowHosts: ALLOWED_HOSTS,
      maxBytes: MAX_PICTURE_BYTES,
      timeoutMs: 10_000,
      retries: 2,
      isSafe: async (hop) => isPlainHttps(new URL(hop)) && isSafeExternalUrl(hop),
    });
    if (!result.ok) {
      // A connection that failed is this route's ordinary error, as before.
      if (result.reason === 'timeout' || result.reason === 'unreachable') {
        throw new Error(`image fetch failed: ${result.reason}`);
      }
      return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 });
    }
    if (result.status < 200 || result.status >= 300) {
      return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 });
    }
    return { data: result.body.buffer, declaredType: result.responseHeaders.get('Content-Type') };
  });
}, 'Failed to proxy image');
