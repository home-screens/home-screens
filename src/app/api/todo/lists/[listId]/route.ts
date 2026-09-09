import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { updateList, deleteList, type UpdateListInput } from '@/lib/todo-data';
import { todoWrite, asObject } from '@/lib/todo-api';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ listId: string }> };

/**
 * PATCH /api/todo/lists/[listId]: rename, recolour, change the repeat,
 * reorder items (`itemOrder`), or run a tidy-up `action`
 * (`uncheck-all` | `clear-completed`). Session only: the wall never
 * restructures a list.
 */
export const PATCH = withAuth(async (request: NextRequest, ctx: RouteContext) => {
  const { listId } = await ctx.params;
  const body = await parseJsonBody<UpdateListInput>(request, { maxBytes: 64 * 1024 });
  if (body instanceof NextResponse) return body;
  const fields = asObject(body);
  if (fields instanceof NextResponse) return fields;
  return todoWrite((data) => updateList(data, listId, body));
}, 'Failed to update the list');

/** DELETE /api/todo/lists/[listId]: remove the list and everything on it. */
export const DELETE = withAuth(async (_request: NextRequest, ctx: RouteContext) => {
  const { listId } = await ctx.params;
  return todoWrite((data) => deleteList(data, listId));
}, 'Failed to delete the list');
