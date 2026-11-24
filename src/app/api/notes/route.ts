import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { readNotesData } from '@/lib/notes-data';
import { hasEditorSession, requireSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { createNote, makeRoomForDrawing, type CreateNoteInput } from '@/lib/notes-actions';
import { NotesError } from '@/lib/notes-errors';
import { WALL_DRAWING_LIVES } from '@/lib/note-drawing';
import { wallMayDraw } from '@/lib/notes-wall';
import { noteWallAdded } from '@/lib/wall-added';
import { rememberMadeRoom, type TakenDown } from '@/lib/notes-made-room';
import { notesWrite } from '@/lib/notes-api';
import { asObject } from '@/lib/todo-api';
import { notesEtag } from '@/lib/notes-revision';
import { holdsEtag, revalidatedHeaders } from '@/lib/file-etag';
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

/** A full drawing is about 50 KB of points; words alone are far smaller. */
const NOTE_BODY_BYTES = 96 * 1024;

/** What a wall may send with a drawing: who drew it and how long it stays. */
const WALL_FIELDS: ReadonlySet<string> = new Set(['drawing', 'authorId', 'life']);

/**
 * POST /api/notes: post a note `{ text, authorId?, life?, pinned?, important? }`,
 * or a drawing with `drawing` in place of `text`. Answers `{ notes, created }`,
 * `created` being the new note.
 *
 * A phone or the editor posts with a session. A wall's "Draw a note" lands
 * here too, with the display token, held back to the least it needs: a
 * drawing only (no words, pin or important; anything else needs a session),
 * for one of the timed lives. A drawing from anyone is taken only while some
 * Notes card offers the button (`wallMayDraw`). The board keeps a cap of drawings up, whoever
 * posts them, so one more takes down the oldest that is not pinned
 * (`makeRoomForDrawing`); the answer's `madeRoom` says how many, and taking
 * the new drawing off again within a few minutes puts them back
 * (`notes-made-room.ts`). The hub
 * remembers what it posted for a wall for a few minutes, so the wall's Undo
 * can take it off again (`wall-added.ts`).
 */
export const POST = withDisplayAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<CreateNoteInput>(request, { maxBytes: NOTE_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const fields = asObject(body);
  if (fields instanceof NextResponse) return fields;
  const fromWall = !(await hasEditorSession(request));
  if (fromWall) {
    if (fields.drawing === undefined || Object.keys(fields).some((f) => !WALL_FIELDS.has(f))) await requireSession(request);
    if (fields.life !== undefined && !WALL_DRAWING_LIVES.includes(fields.life as never)) {
      throw new NotesError(400, 'notes.badLife', 'Pick how long the note should stay.');
    }
  }
  // The switch and the cap are about drawings, not about who sent one: a hub
  // with no password sees every caller as signed in, and its wall draws all
  // the same. Nothing else posts a drawing.
  const drawn = fields.drawing !== undefined;
  if (drawn && !wallMayDraw(await readConfig())) {
    throw new NotesError(403, 'notes.wallDrawOff', 'Drawing on the wall is turned off');
  }
  let created: Note | undefined;
  let taken: TakenDown[] = [];
  const response = await notesWrite(
    (data) => {
      const now = new Date();
      const roomy = drawn ? makeRoomForDrawing(data, now) : data;
      const before = new Map(data.notes.map((n) => [n.id, n.expiresAt]));
      taken = roomy.notes
        .filter((n) => n.expiresAt !== before.get(n.id))
        .map((n) => ({ id: n.id, expiresAt: before.get(n.id) ?? null, downAt: n.expiresAt as string }));
      const result = createNote(roomy, body, now);
      created = result.note;
      return result.data;
    },
    () => ({ created, ...(drawn ? { madeRoom: taken.length } : {}) }),
    { authorId: fields.authorId },
  );
  if (response.ok && created) {
    if (fromWall) noteWallAdded(created.id);
    rememberMadeRoom(created.id, taken);
  }
  return response;
}, 'Failed to post the note');
