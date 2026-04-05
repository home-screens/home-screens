import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createTTLCache, withDisplayAuth } from '@/lib/api-utils';
import { immichFetch, type ImmichAsset } from '@/lib/immich';

export const dynamic = 'force-dynamic';

const cache = createTTLCache<string[]>(5 * 60_000); // 5 minutes

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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

  let assets: ImmichAsset[] = [];

  if (albumId && !personId) {
    // Fetch album assets and sample randomly
    // (search/random doesn't reliably support albumIds in all Immich versions)
    const res = await immichFetch(`/api/albums/${albumId}`);
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch album' }, { status: 502 });
    const album = await res.json();
    assets = (album.assets as ImmichAsset[]).filter((a) => a.type === 'IMAGE');
    if (favorites) assets = assets.filter((a) => a.isFavorite);
    assets = shuffle(assets).slice(0, count);
  } else {
    // Use random search endpoint for non-album queries (or album + person combos)
    const body: Record<string, unknown> = { type: 'IMAGE', size: count };
    if (personId) body.personIds = [personId];
    if (favorites) body.isFavorite = true;

    const res = await immichFetch('/api/search/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return NextResponse.json({ error: 'Failed to search photos' }, { status: 502 });
    assets = await res.json();
  }

  const urls = assets.map(assetToUrl);
  cache.set(cacheKey, urls);
  return NextResponse.json(urls);
}, 'Failed to fetch Immich photos');
