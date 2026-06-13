import { NextResponse } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { readTodoState } from '@/lib/todo-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/todo/state — return the runtime completion map for every interactive
 * todo item (keyed by item id). Interactive todo modules poll this so a tap on
 * one display (or a backdated edit elsewhere) surfaces everywhere within the
 * poll interval. The map is global and tiny — each module filters it to its own
 * item ids client-side.
 */
export const GET = withDisplayAuth(async () => {
  const state = await readTodoState();
  return NextResponse.json(state);
}, 'Failed to read todo state');
