import { NextResponse } from 'next/server';
import { updateTodoData } from './todo-data';
import { validateMemberReferences } from './family-api';
import { withDataTransaction } from './data-transaction';
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
 * (validation, missing list or item) reaches the route wrapper, which
 * answers with its code; so does anything else, as the failure it is.
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
  /**
   * Assignees the body names. Checked against the family inside the same
   * transaction as the write (the coordinator is reentrant), so a phone
   * holding an old roster cannot assign someone who was removed. A value
   * that is not a list of ids is left for the action's own 400.
   */
  opts: { assigneeIds?: unknown } = {},
): Promise<NextResponse> {
  return withDataTransaction(async () => {
    const ids = opts.assigneeIds;
    if (Array.isArray(ids) && ids.every((id) => typeof id === 'string')) {
      const missing = await validateMemberReferences(ids);
      if (missing) return missing;
    }
    const data = await updateTodoData(mutate);
    return NextResponse.json({ lists: data.lists, ...(extra ? extra() : {}) });
  });
}
