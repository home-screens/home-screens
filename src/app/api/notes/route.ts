import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, withDisplayAuth, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { readNotesData } from '@/lib/notes-data';
import { createNote, type CreateNoteInput } from '@/lib/notes-actions';
import { notesWrite } from '@/lib/notes-api';
import { asObject } from '@/lib/todo-api';
import { notesEtag } from '@/lib/notes-revision';
import { holdsEtag, revalidatedHeaders } from '@/lib/chore-revisions';
import { isLive } from '@/lib/notes-rules';
import type { Note } from '@/types/notes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notes: the family notes board. `?live=1` answers only the notes
 * on the wall right now (the wall's read, smaller and never carrying the
 * phone's Gone group); without it, every note the sweep has not dropped.
 * Answers with the board's ETag and a 304 when the caller already holds it,
 * the way the chores read does; the heartbeat names the same ETag, so a
 * wall asks only when a phone changed the board.
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const etag = await notesEtag();
  if (holdsEtag(request, etag)) return new NextResponse(null, { status: 304, headers: revalidatedHeaders(etag) });
  const data = await readNotesData();
  const live = request.nextUrl.searchParams.get('live') === '1';
  const now = new Date();
  const notes: Note[] = live ? data.notes.filter((n) => isLive(n, now)) : data.notes;
  return NextResponse.json({ notes }, { headers: revalidatedHeaders(etag) });
}, 'Failed to read the notes');

/**
 * POST /api/notes: post a note `{ text, authorId?, life?, pinned?, important? }`.
 * Answers `{ notes, created }`, `created` being the new note. Session only:
 * notes are written from a phone or the editor, never from a wall.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<CreateNoteInput>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const fields = asObject(body);
  if (fields instanceof NextResponse) return fields;
  let created: Note | undefined;
  return notesWrite(
    (data) => {
      const result = createNote(data, body, new Date());
      created = result.note;
      return result.data;
    },
    () => ({ created }),
    { authorId: fields.authorId },
  );
}, 'Failed to post the note');
