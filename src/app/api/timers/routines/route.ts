import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { readRoutinesFile, updateRoutinesAtomic, validateRoutines } from '@/lib/timer-data';
import { contentRevision } from '@/lib/content-revision';
import { TimerError } from '@/lib/timer-logic';
import type { Routine } from '@/types/timers';

export const dynamic = 'force-dynamic';

/** GET /api/timers/routines — the saved routine list (managed from /remote), and the revision a save quotes. */
export const GET = withDisplayAuth(async () => {
  const { routines } = await readRoutinesFile();
  return NextResponse.json({ routines, revision: contentRevision(routines) });
}, 'Failed to read routines');

/**
 * PUT /api/timers/routines — replace the routine list wholesale.
 *
 * The list is small (≤50), so replace-the-list is simpler and safer than
 * per-item CRUD — no partial-update merge rules to get wrong. Validation is
 * all-or-nothing: one bad routine rejects the write. An empty list is a
 * legitimate write (deleting the last routine), so there is no
 * empty-overwrite guard here; the store keeps a .bak.
 *
 * The body quotes the `revision` its list was built from (GET or the previous
 * save). Two phones can have the Timers tab open at once: a list built from
 * an older copy comes back as a 409 with `reason: 'revision'` and the current
 * list, rather than dropping the routine the other phone just made.
 */
export const PUT = withAuth(async (req: NextRequest) => {
  const body = await parseJsonBody<{ routines?: Routine[]; revision?: unknown }>(req);
  if (body instanceof NextResponse) return body;

  const problem = validateRoutines(body.routines);
  if (problem) throw new TimerError(400, 'timers.invalid', problem);
  const { revision } = body;
  if (typeof revision !== 'string' || !revision) throw new TimerError(400, 'timers.reload', 'Reload the page and try again.');

  // Compared inside the store's queue, so nothing lands between the check
  // and the write.
  const conflict: { theirs: Routine[] | null } = { theirs: null };
  const data = await updateRoutinesAtomic((current) => {
    if (contentRevision(current.routines) !== revision) {
      conflict.theirs = current.routines;
      return current;
    }
    return { routines: body.routines! };
  });
  const { theirs } = conflict;
  if (theirs) {
    throw new TimerError(409, 'timers.revision', 'Somebody else changed the routines. Make your change again.', {
      extra: { reason: 'revision', routines: theirs, revision: contentRevision(theirs) },
    });
  }
  return NextResponse.json({ routines: data.routines, revision: contentRevision(data.routines) });
}, 'Failed to save routines');
