import { NextResponse } from 'next/server';
import { NotesError, updateNotesData } from './notes-data';
import { readFamilyData } from './family-data';
import { withDataTransaction } from './data-transaction';
import type { NotesData } from '@/types/notes';

/**
 * Run one write against the notes board and answer with every note, live
 * and gone, so the phone reconciles against server truth in one step. A
 * `NotesError` (validation, missing note, full board) becomes its JSON
 * error; anything else propagates to the route wrapper's generic handler.
 */
export async function notesWrite(
  mutate: (data: NotesData) => NotesData | Promise<NotesData>,
  /** Extra fields for the response, read after the write (a create names what it made). */
  extra?: () => Record<string, unknown>,
  /**
   * An author the body names. Checked against the family inside the same
   * transaction as the write (the coordinator is reentrant), so a removal
   * landing between the check and the write cannot leave a note naming
   * someone who is gone.
   */
  opts: { authorId?: unknown } = {},
): Promise<NextResponse> {
  try {
    return await withDataTransaction(async () => {
      const bad = await authorProblem(opts.authorId);
      if (bad) return bad;
      const data = await updateNotesData(mutate);
      return NextResponse.json({ notes: data.notes, ...(extra ? extra() : {}) });
    });
  } catch (err) {
    if (err instanceof NotesError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

/**
 * A note's author has to be someone in the family right now. The actions
 * cannot know the roster, so `notesWrite` asks here, inside the write's
 * transaction; an unknown id would otherwise sit in the file until a backup
 * restore refused it. `null` and `undefined` mean nobody and pass.
 */
export async function authorProblem(authorId: unknown): Promise<NextResponse | null> {
  if (authorId === undefined || authorId === null || authorId === '') return null;
  if (typeof authorId !== 'string') return NextResponse.json({ error: 'The author must be a family member.' }, { status: 400 });
  const family = await readFamilyData();
  if (!family.members.some((m) => m.id === authorId)) {
    return NextResponse.json({ error: 'That person is not in the family.' }, { status: 400 });
  }
  return null;
}
