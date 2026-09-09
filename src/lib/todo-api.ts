import { NextResponse } from 'next/server';
import { TodoError, updateTodoData } from './todo-data';
import type { TodoData } from '@/types/todos';

/**
 * A parsed body the write helpers can read fields off. `parseJsonBody` only
 * guards JSON syntax, so `null`, `[]` and `"x"` all reach a route; without
 * this they would fall through the field checks and 500 on a property read.
 */
export function asObject(body: unknown): Record<string, unknown> | NextResponse {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected an object' }, { status: 400 });
  }
  return body as Record<string, unknown>;
}

/**
 * Run one write against the shared to-do store and answer with every list,
 * so the caller reconciles against server truth in one step. A `TodoError`
 * (validation, missing list or item) becomes its JSON error; anything else
 * propagates to the route wrapper's generic handler.
 */
export async function todoWrite(
  mutate: (data: TodoData) => TodoData | Promise<TodoData>,
  /**
   * Extra fields for the response, read after the write. A create route
   * uses it to name what it made (`created`), so a client that shows every
   * list can select its own new one rather than guessing from the diff,
   * which picks up whatever another phone added meanwhile.
   */
  extra?: () => Record<string, unknown>,
): Promise<NextResponse> {
  try {
    const data = await updateTodoData(mutate);
    return NextResponse.json({ lists: data.lists, ...(extra ? extra() : {}) });
  } catch (err) {
    if (err instanceof TodoError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
