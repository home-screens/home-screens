import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { hasEditorSession, requireSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { readMealData } from '@/lib/meal-data';
import { addItem, addItemIfNew, TodoError, type AddItemInput, type AddOutcome } from '@/lib/todo-actions';
import { todoWrite, asObject } from '@/lib/todo-api';
import { WALL_ITEM_MAX_LENGTH, wallMayAddToList } from '@/lib/todo-wall';
import { noteWallAdded } from '@/lib/wall-added';
import { oneLineText, textLength } from '@/lib/text-length';
import type { TodoListItem } from '@/types/todos';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ listId: string }> };

type AddBody = AddItemInput & {
  /** Undo putting back an item just removed: make it as it was, never merged with another. */
  restore?: unknown;
};

/**
 * POST /api/todo/lists/[listId]/items: add `{ text, dueDate?, assigneeIds?, position?, restore? }`.
 * A list keeps one of each thing whoever adds (`addItemIfNew`), so no
 * surface can forget it: the same words as an item still to do change
 * nothing, and a ticked one is put back. Answers `{ lists, created, outcome }`:
 * `created` is the item the add landed on and `outcome` says how (`added`,
 * `already`, `putBack`). Only `restore`, Undo after a remove, always makes
 * a new item.
 *
 * The phone's add bar and the editor's items window land here with a
 * session. So does a wall's Add row, with the display token, which is held
 * back to the least it needs: words only (anything else needs a session, the
 * same as the tick route), at most `WALL_ITEM_MAX_LENGTH` characters, to a
 * list some card offers an Add row for (`wallMayAddToList`), never a second
 * copy. The hub remembers what it added for a wall for a few minutes, so the
 * wall's Undo can take it off again (`wall-added.ts`).
 */
export const POST = withDisplayAuth(async (request: NextRequest, ctx: RouteContext) => {
  const { listId } = await ctx.params;
  const body = await parseJsonBody<AddBody>(request, { maxBytes: 8 * 1024 });
  if (body instanceof NextResponse) return body;
  const fields = asObject(body);
  if (fields instanceof NextResponse) return fields;

  const fromWall = !(await hasEditorSession(request));
  if (fromWall) {
    if (Object.keys(fields).some((f) => f !== 'text')) await requireSession(request);
    const [config, meals] = await Promise.all([readConfig(), readMealData()]);
    if (!wallMayAddToList(config, listId, meals.settings)) {
      throw new TodoError(403, 'lists.wallAddOff', 'Adding from the wall is turned off for this list');
    }
    if (typeof fields.text === 'string' && textLength(oneLineText(fields.text)) > WALL_ITEM_MAX_LENGTH) {
      throw new TodoError(400, 'lists.textTooLong', `Items can be up to ${WALL_ITEM_MAX_LENGTH} characters`, { max: WALL_ITEM_MAX_LENGTH });
    }
  }
  const keepOne = fromWall || fields.restore !== true;
  // The wall's words are one line, whatever arrived.
  const input: AddItemInput = fromWall ? { text: typeof fields.text === 'string' ? oneLineText(fields.text) : fields.text } : body;

  let created: TodoListItem | undefined;
  let outcome: AddOutcome = 'added';
  const response = await todoWrite(
    (data) => {
      const result = keepOne ? addItemIfNew(data, listId, input) : { ...addItem(data, listId, input), outcome: 'added' as const };
      created = result.item;
      outcome = result.outcome;
      return result.data;
    },
    () => ({ created, outcome }),
    { assigneeIds: fields.assigneeIds },
  );
  if (fromWall && response.ok && created && outcome === 'added') noteWallAdded(created.id);
  return response;
}, 'Failed to add the item');
