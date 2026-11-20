import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { clearedWithImmich, immichFetch, isImmichAssetId } from '@/lib/immich';
import { createPictureBytesCache, servePicture } from '@/lib/picture-proxy';

export const dynamic = 'force-dynamic';

const cache = clearedWithImmich(createPictureBytesCache());

const VALID_SIZES = new Set(['preview', 'thumbnail']);
const VALID_TYPES = new Set(['asset', 'person']);

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const assetId = params.get('assetId');
  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });
  if (!isImmichAssetId(assetId)) return NextResponse.json({ error: 'Invalid assetId' }, { status: 400 });

  const size = VALID_SIZES.has(params.get('size') || '') ? params.get('size')! : 'preview';
  const type = VALID_TYPES.has(params.get('type') || '') ? params.get('type')! : 'asset';

  return servePicture(cache, `${type}-${assetId}-${size}`, 'image/jpeg', async () => {
    const immichPath = type === 'person' ? `/api/people/${assetId}/thumbnail` : `/api/assets/${assetId}/thumbnail?size=${size}`;
    const res = await immichFetch(immichPath, { timeout: 15_000 });
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch image from Immich' }, { status: 502 });
    return { data: await res.arrayBuffer(), declaredType: res.headers.get('Content-Type') };
  });
}, 'Failed to serve Immich image');
