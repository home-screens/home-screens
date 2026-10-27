import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { deleteNote, repost, takeDown, updateNote, type NoteAction, type NotePatch } from '@/lib/notes-actions';
import { notesWrite } from '@/lib/notes-api';
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
  if (action !== undefined && !ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  return notesWrite((data) => {
    const now = new Date();
    if (action === 'take-down') return takeDown(data, noteId, now);
    if (action === 'repost') return repost(data, noteId, now);
    return updateNote(data, noteId, patch, now);
  }, undefined, { authorId: patch.authorId });
}, 'Failed to update the note');

/** DELETE /api/notes/[noteId]: remove the note for good. Session only. */
export const DELETE = withAuth(async (_request: NextRequest, ctx: RouteContext) => {
  const { noteId } = await ctx.params;
  return notesWrite((data) => deleteNote(data, noteId));
}, 'Failed to delete the note');
