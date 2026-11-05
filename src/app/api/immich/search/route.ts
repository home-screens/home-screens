import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { immichFetch } from '@/lib/immich';

export const dynamic = 'force-dynamic';

/** Photos per page: a 3x3 grid in the picker. */
const PAGE_SIZE = 9;

const ID_RE = /^[a-f0-9-]+$/i;

interface SearchAsset {
  id: string;
  originalFileName?: string;
  fileCreatedAt?: string;
}

/**
 * One page of the library (or one album) for the background picker.
 *
 * Immich's `search/metadata` reports `total` as the size of the returned page,
 * not of the whole result set, and an album's `assetCount` also counts videos,
 * so a page count cannot be derived reliably. Only `hasNext` (from `nextPage`)
 * is trustworthy, and it is all the picker needs.
 */
export const GET = withAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const albumId = params.get('albumId') || undefined;
  if (albumId && !ID_RE.test(albumId)) {
    return NextResponse.json({ error: 'Invalid albumId' }, { status: 400 });
  }
  const page = Math.max(Math.floor(Number(params.get('page'))) || 1, 1);

  const body: Record<string, unknown> = { type: 'IMAGE', page, size: PAGE_SIZE };
  if (albumId) body.albumIds = [albumId];

  const res = await immichFetch('/api/search/metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return NextResponse.json({ error: 'Failed to search photos' }, { status: 502 });

  const data = await res.json();
  const items: SearchAsset[] = data?.assets?.items ?? [];
  const nextPage = data?.assets?.nextPage;

  return NextResponse.json({
    photos: items.map((asset) => ({
      id: asset.id,
      thumb: `/api/immich/serve?assetId=${asset.id}&size=thumbnail`,
      alt: asset.originalFileName ?? '',
      date: asset.fileCreatedAt ? asset.fileCreatedAt.slice(0, 10) : '',
    })),
    page,
    hasNext: nextPage != null && nextPage !== '',
  });
}, 'Failed to search Immich photos');
