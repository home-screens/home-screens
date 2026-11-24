import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, withDisplayAuth, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { hasEditorSession, requireSession } from '@/lib/auth';
import { forgetWallAdded, wallMayUndo } from '@/lib/wall-added';
import { deleteNote, putBackTakenDown, repost, takeDown, updateNote, type NoteAction, type NotePatch } from '@/lib/notes-actions';
import { takeMadeRoom } from '@/lib/notes-made-room';
import { notesWrite } from '@/lib/notes-api';
import { NotesError } from '@/lib/notes-errors';
import { asObject } from '@/lib/todo-api';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ noteId: string }> };

const ACTIONS: ReadonlySet<NoteAction> = new Set(['take-down', 'repost']);

/**
 * PATCH /api/notes/[noteId]: change the text, author, flags or life, or run
 * an `action`: `take-down` (off the wall now, kept for Gone) or `repost`
 * (back on the wall, posted now). Session only.
 */
export const PATCH = withAuth(async (request: NextRequest, ctx: RouteContext) => {
  const { noteId } = await ctx.params;
  const body = await parseJsonBody<NotePatch & { action?: NoteAction }>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const fields = asObject(body);
  if (fields instanceof NextResponse) return fields;
  const { action, ...patch } = body;
  if (action !== undefined && !ACTIONS.has(action)) throw new NotesError(400, 'notes.badRequest', 'Unknown action');
  return notesWrite((data) => {
    const now = new Date();
    if (action === 'take-down') return takeDown(data, noteId, now);
    if (action === 'repost') return repost(data, noteId, now);
    return updateNote(data, noteId, patch, now);
  }, undefined, { authorId: patch.authorId });
}, 'Failed to update the note');

/**
 * DELETE /api/notes/[noteId]: remove the note for good. A phone or the
 * editor, with a session; or a wall's Undo, with the display token, for a
 * drawing or typed note the hub posted for a wall in the last few minutes
 * (`wall-added.ts`). Anything else from a wall needs a session.
 */
export const DELETE = withDisplayAuth(async (request: NextRequest, ctx: RouteContext) => {
  const { noteId } = await ctx.params;
  const fromWall = !(await hasEditorSession(request));
  if (fromWall && !wallMayUndo(noteId)) await requireSession(request);
  // A drawing that took others down to make room puts them back as it goes.
  const response = await notesWrite((data) => putBackTakenDown(deleteNote(data, noteId), takeMadeRoom(noteId)));
  if (fromWall && response.ok) forgetWallAdded(noteId);
  return response;
}, 'Failed to delete the note');
