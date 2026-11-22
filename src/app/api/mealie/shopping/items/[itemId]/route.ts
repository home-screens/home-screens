import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { hasEditorSession, requireSession } from '@/lib/auth';
import { forgetWallAdded, wallMayUndo } from '@/lib/wall-added';
import { deleteMealieShoppingItem, isMealieShoppingId, setMealieShoppingItemChecked } from '@/lib/mealie-shopping';
import { withMealieErrors } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ itemId: string }> };

/**
 * PATCH /api/mealie/shopping/items/[itemId] `{ checked }`: tick an item on a
 * Mealie list, or put it back. The display token gets in, the same as ticking
 * a to-do on the wall; it can only tick. One-way: `changed` is false when the
 * item was already that way.
 */
export const PATCH = withDisplayAuth(withMealieErrors(async (request: NextRequest, ctx: RouteContext) => {
  const { itemId } = await ctx.params;
  if (!isMealieShoppingId(itemId)) {
    return NextResponse.json({ error: 'Not a Mealie shopping list item' }, { status: 400 });
  }
  const body = await parseJsonBody<{ checked?: unknown }>(request, { maxBytes: 1024 });
  if (body instanceof NextResponse) return body;
  if (typeof body.checked !== 'boolean') {
    return NextResponse.json({ error: 'checked must be true or false' }, { status: 400 });
  }
  return NextResponse.json({ changed: await setMealieShoppingItemChecked(itemId, body.checked) });
}), 'Failed to tick the Mealie shopping list item');

/**
 * DELETE /api/mealie/shopping/items/[itemId]: take an item off its Mealie
 * list, for Undo right after adding it. Already gone answers 200 too.
 *
 * The display token gets in only for the wall's Undo: an item the hub added
 * for a wall in the last few minutes (`wall-added.ts`). Anything else needs
 * the phone's session; the wall can tick, not remove.
 */
export const DELETE = withDisplayAuth(withMealieErrors(async (request: NextRequest, ctx: RouteContext) => {
  const { itemId } = await ctx.params;
  if (!isMealieShoppingId(itemId)) {
    return NextResponse.json({ error: 'Not a Mealie shopping list item' }, { status: 400 });
  }
  const fromWall = !(await hasEditorSession(request));
  if (fromWall && !wallMayUndo(itemId)) await requireSession(request);
  await deleteMealieShoppingItem(itemId);
  if (fromWall) forgetWallAdded(itemId);
  return NextResponse.json({ ok: true });
}), 'Failed to take the item off the Mealie shopping list');
