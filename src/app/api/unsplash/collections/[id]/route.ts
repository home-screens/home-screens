import { NextResponse } from 'next/server';
import { UNSPLASH_API, getUnsplashAccessKey } from '@/lib/unsplash';
import { fetchWithTimeout, withAuth } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

const log = logger('unsplash');

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteContext>(async (_request, ctx) => {
  const accessKey = await getUnsplashAccessKey();
  if (!accessKey) {
    return NextResponse.json(
      { error: 'Unsplash API key not configured. Add it in Settings.' },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;

  const res = await fetchWithTimeout(`${UNSPLASH_API}/collections/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });

  if (!res.ok) {
    log.error(`API error ${res.status} for collection ${id}`);
    return NextResponse.json({ error: 'Collection not found' }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({
    id,
    title: data.title,
    totalPhotos: data.total_photos,
    coverPhotoUrl: data.cover_photo?.urls?.small ?? null,
  });
}, 'Failed to fetch Unsplash collection');
