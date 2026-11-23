import { NextResponse, type NextRequest } from 'next/server';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { changeEvent, eventForEdit, removeEvent } from '@/lib/calendar-event-writes';
import { requireGrownUp } from '@/lib/grown-up-gate';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024;

type Context = { params: Promise<{ id: string }> };

/**
 * GET: one event ready for the Change form: its draft on the household's
 * clock, its version, and how its series repeats (`EditableGoogleEvent`).
 * `id` is the event's id as the calendar answer carries it; `?ref=` is an
 * iCloud event's `sourceRef`.
 */
export const GET = withDisplayAuth(async (request: NextRequest, { params }: Context) => {
  const { id } = await params;
  return NextResponse.json(await eventForEdit(request, id, request.nextUrl.searchParams.get('ref')));
}, 'Failed to load event');

/**
 * PATCH: change an event,
 * `{ draft, etag, scope, seriesId?, sourceRef?, dayWas, timeWas?, repeatChanged, timesChanged }`
 * (`sourceRef` for iCloud).
 * `scope` is `instance` (this day) or `series` (every time); `etag` is the
 * version the form loaded, the series' for `series`. `timesChanged: false`
 * leaves the day and times exactly as the calendar holds them. A change made
 * elsewhere since the form loaded answers 409
 * `calendarWrite.changedElsewhere`, and nothing is overwritten.
 */
export const PATCH = withDisplayAuth(async (request: NextRequest, { params }: Context) => {
  const { id } = await params;
  const body = await parseJsonBody<Record<string, unknown>>(request, { maxBytes: MAX_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  // Changing every time a repeating event happens can ask for the grown-up code (Settings > Family).
  if (body.scope === 'series') {
    const refused = await requireGrownUp(request, 'calendar-change-series');
    if (refused) return refused;
  }
  await changeEvent(request, id, body);
  return NextResponse.json({ ok: true });
}, 'Failed to change event');

/**
 * DELETE: remove an event, `{ scope, seriesId?, sourceRef?, etag? }`: this day (`instance`) or
 * every time (`series`). Already gone counts as removed.
 */
export const DELETE = withDisplayAuth(async (request: NextRequest, { params }: Context) => {
  const { id } = await params;
  const body = await parseJsonBody<Record<string, unknown>>(request, { maxBytes: MAX_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const refused = await requireGrownUp(request, 'calendar-remove');
  if (refused) return refused;
  await removeEvent(request, id, body);
  return NextResponse.json({ ok: true });
}, 'Failed to remove event');
