import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { addItem, type AddItemInput } from '@/lib/todo-data';
import { todoWrite, asObject } from '@/lib/todo-api';
import type { TodoListItem } from '@/types/todos';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ listId: string }> };

/**
 * POST /api/todo/lists/[listId]/items: add `{ text, dueDate?, position? }`. Answers `{ lists, created }`, `created` being the new item.
 * The phone's add bar and the editor's items modal both land here; the wall
 * only ever checks things off.
 */
export const POST = withAuth(async (request: NextRequest, ctx: RouteContext) => {
  const { listId } = await ctx.params;
  const body = await parseJsonBody<AddItemInput>(request, { maxBytes: 8 * 1024 });
  if (body instanceof NextResponse) return body;
  const fields = asObject(body);
  if (fields instanceof NextResponse) return fields;
  let created: TodoListItem | undefined;
  return todoWrite(
    (data) => {
      const result = addItem(data, listId, body);
      created = result.item;
      return result.data;
    },
    () => ({ created }),
  );
}, 'Failed to add the item');
