import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchWithTimeout, withDisplayAuth } from '@/lib/api-utils';
import { findICloudItem, icloudPhotoBytesCache, isICloudAlbumLink } from '@/lib/icloud-media';
import { servePicture } from '@/lib/picture-proxy';
import { isAppleContentUrl } from '@/lib/icloud-parse';

export const dynamic = 'force-dynamic';

/** Apple's guids are short: a UUID, or a base64 fingerprint. */
const MAX_GUID_LENGTH = 200;

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

  // A newer album's files all come as `application/octet-stream`; servePicture
  // tells the wall what the picture is.
  return servePicture(icloudPhotoBytesCache, `${link}#${id}#${poster ? 'poster' : 'photo'}`, 'image/jpeg', async () => {
    const item = await findICloudItem(link, id);
    // A video's own bytes are streamed by /api/icloud/video, never buffered here.
    const url = poster ? item?.posterUrl : item?.type === 'image' ? item.previewUrl ?? item.url : undefined;
    if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!isAppleContentUrl(url)) return NextResponse.json({ error: 'Failed to fetch photo from iCloud' }, { status: 502 });

    const res = await fetchWithTimeout(url, { timeout: 30_000 });
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch photo from iCloud' }, { status: 502 });
    return { data: await res.arrayBuffer(), declaredType: res.headers.get('Content-Type') };
  });
}, 'Could not serve iCloud photo');
