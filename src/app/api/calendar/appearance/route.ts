import { NextResponse, type NextRequest } from 'next/server';
import { updateConfigAtomic } from '@/lib/config';
import { withDisplayAuth, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { recolorCalendars, recolorRequestProblem, type RecolorProblem } from '@/lib/calendar-recolor';

export const dynamic = 'force-dynamic';

const PROBLEM_TEXT: Record<RecolorProblem, string> = {
  badColor: 'Colour must be written as #rrggbb.',
  badCalendars: 'Name the calendars to recolour.',
  unknownCalendar: 'One of those calendars is not set up here.',
};

/**
 * Recolour a calendar from the wall.
 *
 * The full config write is session-only, and rightly so: a display token
 * should never be able to rewrite the layout. But recolouring a calendar is
 * the one appearance change worth making from the wall itself, because that
 * is where the clash is visible. So this route exists instead of relaxing
 * `PUT /api/config`: display auth, and the only thing it can reach is the
 * colour of a calendar the household already has set up
 * (`src/lib/calendar-recolor.ts` holds the rules).
 *
 * Writes through `updateConfigAtomic`, which serialises against the editor
 * saving at the same moment. A straight read-modify-write would lose whichever
 * of the two landed first.
 */
export const POST = withDisplayAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ sourceIds?: unknown; color?: unknown }>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;

  const asked = recolorRequestProblem(body.sourceIds, body.color);
  if (asked) return NextResponse.json({ error: PROBLEM_TEXT[asked] }, { status: 400 });
  const sourceIds = body.sourceIds as string[];
  const color = (body.color as string).toLowerCase();

  let problem: RecolorProblem | 'noCalendars' | null = null;
  await updateConfigAtomic((current) => {
    const calendar = current.settings.calendar;
    if (!calendar) {
      problem = 'noCalendars';
      return current;
    }
    const result = recolorCalendars(calendar, sourceIds, color);
    if ('problem' in result) {
      problem = result.problem;
      return current;
    }
    return { ...current, settings: { ...current.settings, calendar: result.calendar } };
  });

  if (problem === 'noCalendars') {
    return NextResponse.json({ error: 'This hub has no calendars set up.' }, { status: 409 });
  }
  if (problem) return NextResponse.json({ error: PROBLEM_TEXT[problem as RecolorProblem] }, { status: 400 });
  return NextResponse.json({ ok: true, color, sourceIds });
}, 'Failed to set the calendar colour');
