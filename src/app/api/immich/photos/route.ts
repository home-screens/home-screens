import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createTTLCache, withDisplayAuth } from '@/lib/api-utils';
import { immichFetch, type ImmichAsset } from '@/lib/immich';

export const dynamic = 'force-dynamic';

const cache = createTTLCache<string[]>(5 * 60_000); // 5 minutes

function assetToUrl(asset: ImmichAsset): string {
  return `/api/immich/serve?assetId=${asset.id}&size=preview`;
}

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const albumId = params.get('albumId') || undefined;
  const personId = params.get('personId') || undefined;
  const favorites = params.get('favorites') === 'true';
  const count = Math.min(Math.max(Number(params.get('count')) || 50, 1), 200);

  const cacheKey = `${albumId || ''}-${personId || ''}-${favorites}-${count}`;
  const cached = cache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  // Immich v3 removed `assets` from the album detail response; search/random
  // accepts albumIds on v2+ and handles all filter combinations server-side.
  const body: Record<string, unknown> = { type: 'IMAGE', size: count };
  if (albumId) body.albumIds = [albumId];
  if (personId) body.personIds = [personId];
  if (favorites) body.isFavorite = true;

  const res = await immichFetch('/api/search/random', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return NextResponse.json({ error: 'Failed to search photos' }, { status: 502 });
  const assets: ImmichAsset[] = await res.json();

  const urls = assets.map(assetToUrl);
  cache.set(cacheKey, urls);
  return NextResponse.json(urls);
}, 'Failed to fetch Immich photos');
