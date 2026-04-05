import { NextResponse } from 'next/server';
import { createTTLCache, withAuth } from '@/lib/api-utils';
import { immichFetch, type ImmichPerson } from '@/lib/immich';

export const dynamic = 'force-dynamic';

const cache = createTTLCache<{ id: string; name: string; thumbnailUrl: string }[]>(60_000);

export const GET = withAuth(async () => {
  const cached = cache.get('people');
  if (cached) return NextResponse.json(cached);

  const res = await immichFetch('/api/people');
  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch people from Immich' }, { status: 502 });

  const body = await res.json();
  const people: ImmichPerson[] = body.people ?? body;
  const result = people
    .filter((p) => !p.isHidden && p.name)
    .map((p) => ({
      id: p.id,
      name: p.name,
      thumbnailUrl: `/api/immich/serve?assetId=${p.id}&type=person`,
    }));

  cache.set('people', result);
  return NextResponse.json(result);
}, 'Failed to list Immich people');
