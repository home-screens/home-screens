import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { clampPhotoCount, isMediaTypes, parsePhotoSourceParams } from '@/lib/photo-source';
import { listPhotoSource, photoSourceErrorResponse } from '@/lib/photo-sources';
import { artCount, artMuseums } from '@/lib/photo-sources/art';
import { LIBRARY_REVISION_HEADER, libraryRevision } from '@/lib/library-revision';

export const dynamic = 'force-dynamic';

/**
 * GET /api/photo-source/media?kind=<kind>&<source fields>&count=N&media=photos|videos|both
 *
 * A refresh of pictures for Photo Slideshow and Full-screen Photo, from any
 * photo source, always as MediaListItem[]. The source travels as the flat
 * query `photoSourceParams` writes. Sources that can't play video answer
 * pictures only; a library folder plays all of itself and ignores `count`.
 *
 * `info=count` and `info=museums` (art) answer `{ count, approximate }` and
 * `[{ id, count }]` instead of pictures.
 *
 * A library list carries the library revision it reflects, taken before the
 * folder is read, so a wall whose heartbeat names a newer one re-reads it.
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const source = parsePhotoSourceParams(params);
  if (!source) return NextResponse.json({ error: 'Unknown photo source' }, { status: 400 });
  const info = params.get('info');
  if (info) {
    if (source.kind !== 'art' || (info !== 'count' && info !== 'museums')) return NextResponse.json({ error: 'Unknown info' }, { status: 400 });
    try {
      return NextResponse.json(info === 'count' ? await artCount(source) : await artMuseums());
    } catch (error) {
      const explained = photoSourceErrorResponse(error);
      if (explained) return explained;
      throw error;
    }
  }
  const media = params.get('media') ?? 'photos';
  if (!isMediaTypes(media)) return NextResponse.json({ error: 'Invalid media parameter' }, { status: 400 });
  const count = clampPhotoCount(params.get('count'), source.kind);

  const headers: Record<string, string> = {};
  if (source.kind === 'library') headers[LIBRARY_REVISION_HEADER] = libraryRevision();
  try {
    const items = await listPhotoSource(source, count, media);
    return NextResponse.json(items, { headers });
  } catch (error) {
    const explained = photoSourceErrorResponse(error);
    if (explained) return explained;
    throw error;
  }
}, 'Failed to load photos');
