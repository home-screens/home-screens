import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { fetchThumbnail, onedrivePhotoBytesCache, OneDriveError } from '@/lib/onedrive';
import { isOneDriveItemId } from '@/lib/onedrive-shared';
import { servePicture } from '@/lib/picture-proxy';

export const dynamic = 'force-dynamic';

/**
 * Byte proxy so the display never holds Graph's short-lived download URLs.
 * The 24-hour cache lives in lib/onedrive.ts so disconnecting can empty it —
 * otherwise photos would keep serving for a day after the grant is dropped.
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const itemId = params.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  if (!isOneDriveItemId(itemId)) {
    return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 });
  }
  const size = params.get('size') === 'thumbnail' ? 'thumbnail' : 'preview';

  try {
    return await servePicture(onedrivePhotoBytesCache, `${itemId}-${size}`, 'image/jpeg', async () => {
      const { data, contentType } = await fetchThumbnail(itemId, size);
      return { data, declaredType: contentType };
    });
  } catch (error) {
    if (error instanceof OneDriveError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}, 'Could not serve OneDrive photo');
