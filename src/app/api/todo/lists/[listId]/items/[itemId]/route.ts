import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { requireSession } from '@/lib/auth';
import { updateItem, deleteItem, type UpdateItemInput } from '@/lib/todo-data';
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
  return todoWrite((data) => updateItem(data, listId, itemId, body));
}, 'Failed to update the item');

/** DELETE /api/todo/lists/[listId]/items/[itemId]: remove one item. */
export const DELETE = withAuth(async (_request: NextRequest, ctx: RouteContext) => {
  const { listId, itemId } = await ctx.params;
  return todoWrite((data) => deleteItem(data, listId, itemId));
}, 'Failed to delete the item');
