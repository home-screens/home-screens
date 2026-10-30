import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, withDisplayAuth, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { readDayNotesData } from '@/lib/day-notes-data';
import { dayNotesEtag } from '@/lib/day-notes-revision';
import { addDayNote } from '@/lib/day-notes';
import { dayNotesWrite } from '@/lib/day-notes-api';
import { holdsEtag, revalidatedHeaders } from '@/lib/chore-revisions';
import { asObject } from '@/lib/todo-api';
import type { DayNote } from '@/types/day-notes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/day-notes: every kept calendar day note, `{ notes: [{ id, date, text }] }`
 * in the order they were written. Answers with the file's ETag and a 304
 * when the caller already holds it; the heartbeat names the same ETag, so a
 * wall asks only when a phone changed a note.
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const etag = await dayNotesEtag();
  if (holdsEtag(request, etag)) return new NextResponse(null, { status: 304, headers: revalidatedHeaders(etag) });
  const data = await readDayNotesData();
  return NextResponse.json({ notes: data.notes }, { headers: revalidatedHeaders(etag) });
}, 'Failed to read the day notes');

/**
 * POST /api/day-notes: write a new note for a day, `{ date, text }`. Answers
 * `{ notes, created }`. Session only: day notes are written from a phone,
 * never from a wall.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ date?: unknown; text?: unknown }>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const fields = asObject(body);
  if (fields instanceof NextResponse) return fields;
  const id = randomUUID();
  let created: DayNote | undefined;
  return dayNotesWrite((data, today) => {
    const next = addDayNote(data, { id, date: fields.date, text: fields.text }, today);
    created = next.notes.find((note) => note.id === id);
    return next;
  }, () => ({ created }));
}, 'Failed to save the day note');
