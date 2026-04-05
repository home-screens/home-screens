import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createTTLCache, withDisplayAuth } from '@/lib/api-utils';
import { immichFetch } from '@/lib/immich';

export const dynamic = 'force-dynamic';

const cache = createTTLCache<{ data: ArrayBuffer; contentType: string }>(24 * 60 * 60 * 1000); // 24 hours

function imageResponse(data: ArrayBuffer, contentType: string) {
  return new Response(data, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
}

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const assetId = params.get('assetId');
  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });
  if (!/^[a-f0-9-]+$/i.test(assetId)) return NextResponse.json({ error: 'Invalid assetId' }, { status: 400 });

  const VALID_SIZES = new Set(['preview', 'thumbnail']);
  const VALID_TYPES = new Set(['asset', 'person']);
  const size = VALID_SIZES.has(params.get('size') || '') ? params.get('size')! : 'preview';
  const type = VALID_TYPES.has(params.get('type') || '') ? params.get('type')! : 'asset';

  const cacheKey = `${type}-${assetId}-${size}`;
  const cached = cache.get(cacheKey);
  if (cached) return imageResponse(cached.data, cached.contentType);

  // Route to the correct Immich endpoint
  let immichPath: string;
  if (type === 'person') {
    immichPath = `/api/people/${assetId}/thumbnail`;
  } else {
    immichPath = `/api/assets/${assetId}/thumbnail?size=${size}`;
  }

  const res = await immichFetch(immichPath, { timeout: 15_000 });
  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch image from Immich' }, { status: 502 });

  const data = await res.arrayBuffer();
  const contentType = res.headers.get('Content-Type') || 'image/jpeg';

  cache.set(cacheKey, { data, contentType });
  return imageResponse(data, contentType);
}, 'Failed to serve Immich image');
