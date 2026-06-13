import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Screen, TodoConfig } from '@/types/config';
import { withDisplayAuth } from '@/lib/api-utils';
import { readConfig } from '@/lib/config';
import { getDisplayScreens, findScreenById } from '@/lib/display-filter';
import { updateTodoState } from '@/lib/todo-data';

export const dynamic = 'force-dynamic';

interface TodoToggleRequest {
  /** Optional in legacy single-display mode; required to disambiguate in multi-display mode. */
  displayId?: string;
  screenId: string;
  moduleId: string;
  itemId: string;
}

/**
 * POST /api/todo/toggle — flip one todo item's completion.
 *
 * Completion lives in the runtime `todo-state.json` store (keyed by item id),
 * NOT in `config.json` — see `lib/todo-data.ts` for why. The config is read
 * here only to *validate* the request: the addressed module must exist, be a
 * todo module, and be opted into interactive mode (defense in depth, so a
 * stale/forged request can't flip a read-only instance). The item's authored
 * `completed` value seeds the flip the first time an item is toggled, before
 * the runtime store has an entry for it.
 *
 * Returns the full updated `TodoState` map so the tapping client can reconcile
 * its optimistic state against server truth.
 */
export const POST = withDisplayAuth(async (request: NextRequest) => {
  const body = (await request.json()) as Partial<TodoToggleRequest>;
  const { displayId, screenId, moduleId, itemId } = body;

  if (
    typeof screenId !== 'string' || !screenId ||
    typeof moduleId !== 'string' || !moduleId ||
    typeof itemId !== 'string' || !itemId
  ) {
    return NextResponse.json(
      { error: 'Missing screenId, moduleId, or itemId' },
      { status: 400 },
    );
  }

  const config = await readConfig();

  // Resolve the addressed screen. An explicit `displayId` must resolve to a
  // registered display — we do NOT silently fall back to the legacy pool, or a
  // typo'd id would flip the wrong instance. Without a `displayId` (legacy
  // single-display callers) we search every place a screen can live.
  let screen: Screen | null;
  if (displayId) {
    const display = config.displays?.find((d) => d.id === displayId);
    if (!display) {
      return NextResponse.json({ error: 'Display not found' }, { status: 404 });
    }
    screen = getDisplayScreens(display).find((s) => s.id === screenId) ?? null;
  } else {
    screen = findScreenById(config, screenId);
  }
  if (!screen) {
    return NextResponse.json({ error: 'Screen not found' }, { status: 404 });
  }

  const mod = screen.modules.find((m) => m.id === moduleId);
  if (!mod) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  }
  if (mod.type !== 'todo') {
    return NextResponse.json({ error: 'Module is not a todo module' }, { status: 404 });
  }

  const todoConfig = mod.config as unknown as TodoConfig;
  if (!todoConfig.interactive) {
    return NextResponse.json({ error: 'Module is not interactive' }, { status: 403 });
  }

  const item = (todoConfig.items ?? []).find((i) => i.id === itemId);
  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  const authoredCompleted = item.completed;

  const state = await updateTodoState((current) => {
    // First toggle of an item falls back to its authored default; thereafter
    // the runtime value is the source of truth.
    const cur = itemId in current.completed ? current.completed[itemId] : authoredCompleted;
    return { completed: { ...current.completed, [itemId]: !cur } };
  });

  return NextResponse.json({ completed: state.completed });
}, 'Failed to toggle todo item');
