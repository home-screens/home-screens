import { NextResponse } from 'next/server';
import { createTTLCache, withAuth } from '@/lib/api-utils';
import { immichFetch, type ImmichAlbum, type ImmichAlbumSummary } from '@/lib/immich';

export const dynamic = 'force-dynamic';

const cache = createTTLCache<ImmichAlbumSummary[]>(60_000);

export const GET = withAuth(async () => {
  const cached = cache.get('albums');
  if (cached) return NextResponse.json(cached);

  const res = await immichFetch('/api/albums');
  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch albums from Immich' }, { status: 502 });

  const albums: ImmichAlbum[] = await res.json();
  const result: ImmichAlbumSummary[] = albums.map((a) => ({
    id: a.id,
    name: a.albumName,
    assetCount: a.assetCount,
  }));

  cache.set('albums', result);
  return NextResponse.json(result);
}, 'Failed to list Immich albums');
