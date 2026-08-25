import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth, isValidISODate } from '@/lib/api-utils';
import { readChoreData } from '@/lib/chore-data';
import { readCompletions } from '@/lib/chore-completion-data';
import {
  choresAssignedTo,
  completionKey,
  todayStr,
} from '@/lib/chore-assignments';

export const dynamic = 'force-dynamic';

/**
 * Resolved per-member chore list for one day. /api/chores/data returns raw
 * definitions, but rotation (daily/weekly/schedule grids) and frequency
 * gates mean a consumer can't know who actually owes what today without
 * re-implementing the chart's assignment rules. This endpoint runs the
 * canonical resolvers (choresAssignedTo / completionKey) server-side so
 * external callers — the Home Assistant voice package's "what chores does
 * Alice have left?" — get exactly what the chore chart renders.
 *
 * Optional `?date=YYYY-MM-DD` resolves a different day (any date: the
 * assignment rules are pure date math and the read is side-effect free).
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const dateParam = request.nextUrl.searchParams.get('date');
  if (dateParam !== null && !isValidISODate(dateParam)) {
    return NextResponse.json(
      { error: 'date must be a valid YYYY-MM-DD date' },
      { status: 400 },
    );
  }
  const date = dateParam ?? todayStr();

  const [data, completionData] = await Promise.all([
    readChoreData(),
    readCompletions(),
  ]);
  const done = new Set(
    completionData.completions.map((c) =>
      completionKey(c.choreId, c.memberId, c.date),
    ),
  );

  const members = data.members.map((m) => ({
    id: m.id,
    name: m.name,
    chores: choresAssignedTo(data.chores, m.id, date).map((c) => ({
      id: c.id,
      name: c.name,
      points: c.points,
      timeOfDay: c.timeOfDay,
      completed: done.has(completionKey(c.id, m.id, date)),
    })),
  }));

  return NextResponse.json({ date, members });
}, "Failed to resolve the day's chores");
