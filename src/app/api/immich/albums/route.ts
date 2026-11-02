import { NextResponse } from 'next/server';
import { createTTLCache, withAuth } from '@/lib/api-utils';
import { immichFetch, type ImmichAlbum, type ImmichAlbumSummary } from '@/lib/immich';
import { missingPermissionBody } from '@/lib/immich-permissions';

export const dynamic = 'force-dynamic';

const cache = createTTLCache<ImmichAlbumSummary[]>(60_000);

export const GET = withAuth(async () => {
  const cached = cache.get('albums');
  if (cached) return NextResponse.json(cached);

  // Immich v3 lists owned and shared-with-you albums together; v2 lists only
  // owned ones unless asked for `shared=true`, which v3 ignores. Asking for
  // both and merging by id gives every album on either version.
  const [own, shared] = await Promise.all([immichFetch('/api/albums'), immichFetch('/api/albums?shared=true')]);
  // A key without album.read still shows photos; the editor says what to tick.
  if (own.status === 403) return NextResponse.json(missingPermissionBody('album.read'), { status: 403 });
  if (!own.ok) return NextResponse.json({ error: 'Failed to fetch albums from Immich' }, { status: 502 });

  const albums: ImmichAlbum[] = await own.json();
  const extra: ImmichAlbum[] = shared.ok ? await shared.json() : [];
  const seen = new Set<string>();
  const result: ImmichAlbumSummary[] = [];
  for (const a of [...albums, ...(Array.isArray(extra) ? extra : [])]) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    result.push({ id: a.id, name: a.albumName, assetCount: a.assetCount });
  }

  cache.set('albums', result);
  return NextResponse.json(result);
}, 'Failed to list Immich albums');
