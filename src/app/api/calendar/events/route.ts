import { NextResponse, type NextRequest } from 'next/server';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { addEvent } from '@/lib/calendar-event-writes';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024;

/**
 * POST: add an event, `{ calendarId, draft }` (`EventDraft` in
 * calendar-write.ts). A phone's session or a wall's display token; the
 * calendar must be ticked for adding, and a wall needs the walls' switch on.
 * Answers `{ id }`, the event's id as the calendar answer carries it.
 */
export const POST = withDisplayAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ calendarId?: unknown; draft?: unknown }>(request, { maxBytes: MAX_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  return NextResponse.json(await addEvent(request, body), { status: 201 });
}, 'Failed to add event');
