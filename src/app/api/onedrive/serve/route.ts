import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createTTLCache, withDisplayAuth } from '@/lib/api-utils';
import { fetchThumbnail, OneDriveError } from '@/lib/onedrive';

export const dynamic = 'force-dynamic';

const cache = createTTLCache<{ data: ArrayBuffer; contentType: string }>(24 * 60 * 60 * 1000); // 24 hours

function imageResponse(data: ArrayBuffer, contentType: string) {
  return new Response(data, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
}

/** Byte proxy so the display never holds Graph's short-lived download URLs. */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const itemId = params.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  if (!/^[A-Za-z0-9!_.=-]{1,200}$/.test(itemId)) {
    return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 });
  }
  const size = params.get('size') === 'thumbnail' ? 'thumbnail' : 'preview';

  const cached = cache.get(`${itemId}-${size}`);
  if (cached) return imageResponse(cached.data, cached.contentType);

  try {
    const { data, contentType } = await fetchThumbnail(itemId, size);
    cache.set(`${itemId}-${size}`, { data, contentType });
    return imageResponse(data, contentType);
  } catch (error) {
    if (error instanceof OneDriveError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}, 'Could not serve OneDrive photo');
