import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { readTodoData, createList, type CreateListInput } from '@/lib/todo-data';
import { todoWrite, asObject } from '@/lib/todo-api';
import type { TodoList } from '@/types/todos';

export const dynamic = 'force-dynamic';

/**
 * GET /api/todo/lists: every shared to-do list, with any due repeat applied.
 * The wall polls this (display auth) and filters to its own list client-side;
 * the phone remote and the editor read the same shape.
 */
export const GET = withDisplayAuth(async () => {
  const data = await readTodoData();
  return NextResponse.json({ lists: data.lists });
}, 'Failed to read to-do lists');

/**
 * POST /api/todo/lists: create a list `{ name, color?, repeat?, repeatDay? }`.
 * Answers `{ lists, created }`, `created` being the new list.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<CreateListInput>(request, { maxBytes: 8 * 1024 });
  if (body instanceof NextResponse) return body;
  const fields = asObject(body);
  if (fields instanceof NextResponse) return fields;
  let created: TodoList | undefined;
  return todoWrite(
    (data) => {
      const result = createList(data, body);
      created = result.list;
      return result.data;
    },
    () => ({ created }),
  );
}, 'Failed to create the list');
