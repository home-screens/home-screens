import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { isPickImportKind } from '@/lib/photo-source';
import { getPickableSource, photoSourceErrorResponse } from '@/lib/photo-sources';

export const dynamic = 'force-dynamic';

/**
 * GET /api/photo-source/browse?kind=immich|unsplash|nasa&collection=<id>&page=N[&query=words][&orientation=portrait|landscape]
 *
 * One page of the Image Library's grid for a source: `{ items, nextPage }`.
 * `collection` is the sidebar entry (`all`, `favorites`, `album:<id>`,
 * `person:<id>` for Immich; `apod` or `search` for NASA; `search` for
 * Unsplash, whose ideas are search words). Editor only: browsing is for
 * choosing a picture to copy, never for a wall.
 */
export const GET = withAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const kind = params.get('kind');
  if (!isPickImportKind(kind)) return NextResponse.json({ error: 'Unknown photo source' }, { status: 400 });
  const page = Math.min(Math.max(Math.floor(Number(params.get('page')) || 1), 1), 1000);
  const collection = params.get('collection') || (kind === 'immich' ? 'all' : 'search');
  const query = (params.get('query') ?? '').slice(0, 100);
  const orientation = params.get('orientation');
  try {
    const result = await getPickableSource(kind).browse({
      collection,
      page,
      query,
      ...(orientation === 'portrait' || orientation === 'landscape' ? { orientation } : {}),
    });
    return NextResponse.json(result);
  } catch (error) {
    const explained = photoSourceErrorResponse(error);
    if (explained) return explained;
    throw error;
  }
}, 'Failed to browse photos');
