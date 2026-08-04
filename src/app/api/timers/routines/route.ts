import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { readRoutinesFile, updateRoutinesAtomic, validateRoutines } from '@/lib/timer-data';
import type { Routine } from '@/types/timers';

export const dynamic = 'force-dynamic';

/** GET /api/timers/routines — the saved routine list (managed from /remote). */
export const GET = withDisplayAuth(async () => {
  const data = await readRoutinesFile();
  return NextResponse.json(data);
}, 'Failed to read routines');

/**
 * PUT /api/timers/routines — replace the routine list wholesale.
 *
 * The list is small (≤50) and edited from a single form surface, so
 * replace-the-list is simpler and safer than per-item CRUD — no partial-update
 * merge rules to get wrong. Validation is all-or-nothing: one bad routine
 * rejects the write. An empty list is a legitimate write (deleting the last
 * routine), so there is no empty-overwrite guard here; the store keeps a .bak.
 */
export const PUT = withAuth(async (req: NextRequest) => {
  const body = await parseJsonBody<{ routines?: Routine[] }>(req);
  if (body instanceof NextResponse) return body;

  const error = validateRoutines(body.routines);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const data = await updateRoutinesAtomic(() => ({ routines: body.routines! }));
  return NextResponse.json(data);
}, 'Failed to save routines');
