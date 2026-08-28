import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { listPhotos, onedrivePhotoListCache, OneDriveError } from '@/lib/onedrive';
import { isOneDriveItemId } from '@/lib/onedrive-shared';
import type { MediaListItem } from '@/types/config';

export const dynamic = 'force-dynamic';

/**
 * The slideshow's photo list, covering the folder and all of its
 * subfolders. Always the typed MediaListItem[] shape — this
 * source postdates videos and never served the legacy string[] responses.
 * A missing folderId answers [] so an unconfigured module shows its clean
 * empty state rather than an error.
 *
 * The 5-minute cache lives in lib/onedrive.ts so disconnecting can empty it.
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const folderId = params.get('folderId') || '';
  if (!folderId) return NextResponse.json([]);
  if (!isOneDriveItemId(folderId)) {
    return NextResponse.json({ error: 'Invalid folder ID' }, { status: 400 });
  }
  const count = Math.min(Math.max(Number(params.get('count')) || 50, 1), 200);

  const cacheKey = `${folderId}-${count}`;
  const cached = onedrivePhotoListCache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const photos = await listPhotos(folderId, count);
    const items: MediaListItem[] = photos.map((photo) => ({
      url: `/api/onedrive/serve?itemId=${encodeURIComponent(photo.id)}&size=preview`,
      type: 'image',
    }));
    onedrivePhotoListCache.set(cacheKey, items);
    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof OneDriveError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}, 'Could not fetch OneDrive photos');
