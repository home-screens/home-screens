import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createTTLCache, withDisplayAuth } from '@/lib/api-utils';
import { immichFetch, parseImmichDurationMs, type ImmichAsset } from '@/lib/immich';
import { mintMediaToken } from '@/lib/media-token';
import { shuffleArray } from '@/lib/shuffle';
import type { MediaListItem } from '@/types/config';

export const dynamic = 'force-dynamic';

const cache = createTTLCache<string[] | MediaListItem[]>(5 * 60_000); // 5 minutes

function assetToUrl(asset: ImmichAsset): string {
  return `/api/immich/serve?assetId=${asset.id}&size=preview`;
}

async function assetToItem(asset: ImmichAsset): Promise<MediaListItem> {
  if (asset.type !== 'VIDEO') {
    return { url: assetToUrl(asset), type: 'image' };
  }
  // Bind the token to the assetId the video route reads back.
  const token = await mintMediaToken(asset.id);
  const durationMs = parseImmichDurationMs(asset.duration);
  return {
    url: `/api/immich/video?assetId=${asset.id}${token ? `&mt=${encodeURIComponent(token)}` : ''}`,
    type: 'video',
    posterUrl: assetToUrl(asset),
    ...(durationMs ? { durationMs } : {}),
  };
}

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const albumId = params.get('albumId') || undefined;
  const personId = params.get('personId') || undefined;
  const favorites = params.get('favorites') === 'true';
  const count = Math.min(Math.max(Number(params.get('count')) || 50, 1), 200);
  const media = params.get('media');
  if (media && !['photos', 'videos', 'both'].includes(media)) {
    return NextResponse.json({ error: 'Invalid media parameter' }, { status: 400 });
  }

  const cacheKey = `${albumId || ''}-${personId || ''}-${favorites}-${count}-${media || ''}`;
  const cached = cache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  // Immich v3 removed `assets` from the album detail response; search/random
  // accepts albumIds on v2+ and handles all filter combinations server-side.
  // It takes exactly one asset type per call, so 'both' runs two searches.
  async function search(type: 'IMAGE' | 'VIDEO'): Promise<ImmichAsset[]> {
    const body: Record<string, unknown> = { type, size: count };
    if (albumId) body.albumIds = [albumId];
    if (personId) body.personIds = [personId];
    if (favorites) body.isFavorite = true;
    const res = await immichFetch('/api/search/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Response(JSON.stringify({ error: 'Failed to search photos' }), { status: 502 });
    return res.json();
  }

  // No media param → legacy string[] of image URLs, exactly as before videos existed.
  if (!media) {
    const assets = await search('IMAGE');
    const urls = assets.map(assetToUrl);
    cache.set(cacheKey, urls);
    return NextResponse.json(urls);
  }

  let assets: ImmichAsset[];
  if (media === 'photos') {
    assets = await search('IMAGE');
  } else if (media === 'videos') {
    assets = await search('VIDEO');
  } else {
    const [images, videos] = await Promise.all([search('IMAGE'), search('VIDEO')]);
    // Merged photo+video results interleave randomly.
    assets = shuffleArray([...images, ...videos]).slice(0, count);
  }

  const items = await Promise.all(assets.map(assetToItem));
  cache.set(cacheKey, items);
  return NextResponse.json(items);
}, 'Failed to fetch Immich photos');
