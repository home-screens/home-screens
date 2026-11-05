import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { immichFetch } from '@/lib/immich';
import { readConfig } from '@/lib/config';
import { pruneRotationFiles } from '@/lib/background-rotation-prune';
import { IMMICH_PICK_PREFIX, rotationCacheStore } from '@/lib/background-rotation-cache';
import { saveRotationFile, extFromContentType } from '@/lib/background-sources/save';

export const dynamic = 'force-dynamic';

const ID_RE = /^[a-f0-9-]+$/i;

/** Save a hand-picked Immich photo (its preview rendition) as a hidden rotation file. */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json().catch(() => null) as { assetId?: unknown } | null;
  const assetId = body?.assetId;
  if (typeof assetId !== 'string' || !ID_RE.test(assetId)) {
    return NextResponse.json({ error: 'Invalid assetId' }, { status: 400 });
  }

  const res = await immichFetch(`/api/assets/${assetId}/thumbnail?size=preview`, { timeout: 15_000 });
  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch image from Immich' }, { status: 502 });

  const ext = extFromContentType(res.headers.get('content-type') ?? '');
  const path = await saveRotationFile(`${IMMICH_PICK_PREFIX}${assetId}${ext}`, res.body);

  // A new pick is the moment to drop the picks no screen names any more.
  try {
    await pruneRotationFiles(await rotationCacheStore.read(), await readConfig());
  } catch { /* housekeeping only */ }

  return NextResponse.json({ path }, { status: 201 });
}, 'Failed to save Immich photo');
