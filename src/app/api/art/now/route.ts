import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { rotationCacheStore } from '@/lib/background-rotation-cache';
import { getAllDisplayStatuses, getDisplayStatus } from '@/lib/display-commands';
import { isValidDisplayId } from '@/lib/display-filter';
import { artAboutUrl, artThumbUrl } from '@/lib/photo-sources/art';

export const dynamic = 'force-dynamic';

/**
 * GET /api/art/now[?display=<id>] -> { painting, screenId, display } | { painting: null }
 *
 * The painting a wall is showing behind its current screen, for the phone's
 * "On the wall now" card: `{ id, title, artist?, year?, museum?, thumb, about }`.
 * With no `display` (one wall, or "every wall" chosen on the phone) the first
 * wall that is showing a painting answers. A wall on a screen with any other
 * background, or one the hub has not heard from, answers `painting: null`.
 */
export const GET = withAuth(async (request: NextRequest) => {
  const asked = request.nextUrl.searchParams.get('display');
  if (asked !== null && !isValidDisplayId(asked)) return NextResponse.json({ error: 'Invalid display' }, { status: 400 });
  const walls: Array<[string | null, string | undefined]> = asked !== null
    ? [[asked, getDisplayStatus(asked)?.currentScreen?.id]]
    : [...getAllDisplayStatuses()].map(([id, status]) => [id, status.currentScreen?.id]);
  const cache = await rotationCacheStore.read();
  for (const [display, screenId] of walls) {
    const entry = screenId ? cache[screenId] : undefined;
    const art = entry?.path ? entry.credit?.art : undefined;
    if (!art || !screenId) continue;
    return NextResponse.json({
      painting: {
        id: art.id, title: art.title,
        ...(art.artist ? { artist: art.artist } : {}), ...(art.year ? { year: art.year } : {}), ...(art.museum ? { museum: art.museum } : {}),
        thumb: artThumbUrl(art.file), about: artAboutUrl(art.file),
      },
      screenId,
      display,
    });
  }
  return NextResponse.json({ painting: null });
}, 'Failed to read the painting on the wall');
