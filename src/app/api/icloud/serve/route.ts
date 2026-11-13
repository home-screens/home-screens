import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchWithTimeout, withDisplayAuth } from '@/lib/api-utils';
import { findICloudItem, icloudPhotoBytesCache, isICloudAlbumLink } from '@/lib/icloud-media';
import { isAppleContentUrl } from '@/lib/icloud-parse';

export const dynamic = 'force-dynamic';

/** Apple's guids are short: a UUID, or a base64 fingerprint. */
const MAX_GUID_LENGTH = 200;

/**
 * The largest picture kept in the day cache. A screen-sized JPEG is well
 * under a megabyte; a camera original Apple has no smaller copy of can be
 * twenty. Fifty of those would take the hub's memory, so the rare big one is
 * served and not kept, and the wall's own cache holds it from there.
 */
const MAX_CACHED_BYTES = 4 * 1024 * 1024;

function imageResponse(data: ArrayBuffer, contentType: string) {
  return new Response(data, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
}

/**
 * GET /api/icloud/serve?link=<album link>&id=<guid>[&poster=1]
 *
 * Byte proxy for one photo of a shared album (or, with `poster=1`, a video's
 * poster frame), so the display never holds Apple's short-lived signed URLs:
 * it asks by the album link and the item's guid, and the hub reads the
 * current URL from the album it keeps. A photo comes at screen size when
 * Apple has such a copy. An item the album no longer has is a 404, which a
 * slideshow skips.
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const link = params.get('link');
  const id = params.get('id');
  if (!link || !id) return NextResponse.json({ error: 'link and id required' }, { status: 400 });
  if (!isICloudAlbumLink(link)) return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
  if (id.length > MAX_GUID_LENGTH) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const poster = params.get('poster') === '1';

  const cacheKey = `${link}#${id}#${poster ? 'poster' : 'photo'}`;
  const cached = icloudPhotoBytesCache.get(cacheKey);
  if (cached) return imageResponse(cached.data, cached.contentType);

  const item = await findICloudItem(link, id);
  // A video's own bytes are streamed by /api/icloud/video, never buffered here.
  const url = poster ? item?.posterUrl : item?.type === 'image' ? item.previewUrl ?? item.url : undefined;
  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isAppleContentUrl(url)) return NextResponse.json({ error: 'Failed to fetch photo from iCloud' }, { status: 502 });

  const res = await fetchWithTimeout(url, { timeout: 30_000 });
  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch photo from iCloud' }, { status: 502 });

  const data = await res.arrayBuffer();
  const contentType = res.headers.get('Content-Type') || 'image/jpeg';
  if (data.byteLength <= MAX_CACHED_BYTES) icloudPhotoBytesCache.set(cacheKey, { data, contentType });
  return imageResponse(data, contentType);
}, 'Could not serve iCloud photo');
