import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { hasEditorSession, requireSession } from '@/lib/auth';
import { forgetWallAdded, wallMayUndo } from '@/lib/wall-added';
import { updateItem, deleteItem, type UpdateItemInput } from '@/lib/todo-actions';
import { todoWrite, asObject } from '@/lib/todo-api';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ listId: string; itemId: string }> };

/**
 * PATCH /api/todo/lists/[listId]/items/[itemId]: change `completed`, `text`
 * or `dueDate`.
 *
 * The display token gets in (a tap on the wall lands here), but it may only
 * tick: a body carrying anything other than `completed` needs the phone's or
 * editor's session. Every kiosk holds the display token, and so does any
 * address on the sign-in bypass list, and neither should be able to rewrite
 * what a list says.
 */
export const PATCH = withDisplayAuth(async (request: NextRequest, ctx: RouteContext) => {
  const { listId, itemId } = await ctx.params;
  const body = await parseJsonBody<UpdateItemInput>(request, { maxBytes: 8 * 1024 });
  if (body instanceof NextResponse) return body;
  const fields = asObject(body);
  if (fields instanceof NextResponse) return fields;
  if (Object.keys(fields).some((f) => f !== 'completed')) {
    await requireSession(request);
  }
  return todoWrite((data) => updateItem(data, listId, itemId, body), undefined, { assigneeIds: fields.assigneeIds });
}, 'Failed to update the item');

/**
 * DELETE /api/todo/lists/[listId]/items/[itemId]: remove one item.
 *
 * The display token gets in only for the wall's Undo: an item the hub added
 * for a wall in the last few minutes (`wall-added.ts`). Anything else needs
 * the phone's or editor's session.
 */
export const DELETE = withDisplayAuth(async (request: NextRequest, ctx: RouteContext) => {
  const { listId, itemId } = await ctx.params;
  const fromWall = !(await hasEditorSession(request));
  if (fromWall && !wallMayUndo(itemId)) await requireSession(request);
  const response = await todoWrite((data) => deleteItem(data, listId, itemId));
  if (fromWall && response.ok) forgetWallAdded(itemId);
  return response;
}, 'Failed to delete the item');
