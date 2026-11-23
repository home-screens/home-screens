import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { pairLiveClips } from '@/lib/library-moves';

export const dynamic = 'force-dynamic';

/**
 * POST /api/backgrounds/pair-live  { directory: string }
 *
 * Pairs a folder's Live Photos as an iPhone exports them: each video named
 * like a picture beside it (`IMG_1234.MOV` and `IMG_1234.JPG`) is renamed to
 * that picture's clip (`IMG_1234.live.mov`), and any screen that played it
 * follows. A bad folder is a `LibraryMoveError` the route wrapper answers
 * with its code.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ directory?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  if (typeof body.directory !== 'string') {
    return NextResponse.json({ error: 'directory is required' }, { status: 400 });
  }
  return NextResponse.json(await pairLiveClips(body.directory));
}, 'Failed to pair Live Photos');
