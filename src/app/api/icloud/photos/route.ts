import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { fetchICloudMedia } from '@/lib/icloud-media';
import { shuffleArray } from '@/lib/shuffle';
import type { MediaListItem } from '@/types/config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/icloud/photos?album=<share-url-or-token>&media=photos|videos|both&count=N
 *
 * Same typed contract as /api/immich/photos. Asset URLs are Apple-signed and
 * public — the browser loads media straight from Apple's CDN, so no `mt`
 * tokens and no streaming proxy; the hub only makes two small JSON calls per
 * album refresh.
 *
 * A missing or malformed album link resolves to an empty list rather than an
 * error: the slideshow's iCloud empty state tells the user to check the link,
 * which is friendlier than a red error card for what's almost always a
 * paste-or-settings problem.
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const media = params.get('media');
  if (media && !['photos', 'videos', 'both'].includes(media)) {
    return NextResponse.json({ error: 'Invalid media parameter' }, { status: 400 });
  }
  const count = Math.min(Math.max(Number(params.get('count')) || 50, 1), 200);

  // fetchICloudMedia dispatches by link shape (new CloudKit album vs. legacy
  // sharedstreams) and caches per token (5 min); shuffling per request keeps
  // the rotation varied between refreshes without re-hitting Apple.
  const all = await fetchICloudMedia(params.get('album') || '');

  // No media param → legacy string[] of image URLs, matching the other list
  // endpoints so photo-only configs never see the typed shape.
  if (!media) {
    const urls = shuffleArray(all.filter((item) => item.type === 'image'))
      .slice(0, count)
      .map((item) => item.url);
    return NextResponse.json(urls);
  }

  const wanted = media === 'both' ? all : all.filter((item) =>
    media === 'videos' ? item.type === 'video' : item.type === 'image');
  // Map explicitly so internal fields (guid) never leak into the wire shape.
  const items: MediaListItem[] = shuffleArray(wanted).slice(0, count).map((item) => ({
    url: item.url,
    type: item.type,
    ...(item.posterUrl ? { posterUrl: item.posterUrl } : {}),
  }));
  return NextResponse.json(items);
}, 'Failed to fetch iCloud album');
