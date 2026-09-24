import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth, isValidISODate } from '@/lib/api-utils';
import { readFamilyData } from '@/lib/family-data';
import { withFamilyData } from '@/lib/family-api';
import { readChoreData } from '@/lib/chore-data';
import { choreMarks, readCompletions } from '@/lib/chore-completion-data';
import {
  buildCompletionSet,
  choresOwedBy,
  completionKey,
} from '@/lib/chore-assignments';
import { resolveBonusFor } from '@/lib/chore-bonus';
import { householdToday } from '@/lib/household-day';

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
 * A chore marked "not today" is left out: nobody owes it. Bonus chores are
 * listed on their own under `bonus`, since nobody owes those either.
 *
 * Optional `?date=YYYY-MM-DD` resolves a different day (any date: the
 * assignment rules are pure date math and the read is side-effect free).
 */
export const GET = withDisplayAuth(async (request: NextRequest) => withFamilyData(async () => {
  const dateParam = request.nextUrl.searchParams.get('date');
  if (dateParam !== null && !isValidISODate(dateParam)) {
    return NextResponse.json(
      { error: 'date must be a valid YYYY-MM-DD date' },
      { status: 400 },
    );
  }
  const today = await householdToday();
  const date = dateParam ?? today;

  const [data, completionData, family] = await Promise.all([
    readChoreData(),
    readCompletions(),
    readFamilyData(),
  ]);
  const done = buildCompletionSet(completionData.completions);

  const groups = family.groups ?? [];
  const members = family.members.map((m) => ({
    id: m.id,
    name: m.name,
    chores: choresOwedBy(data.chores, m.id, date, done, groups).map((c) => ({
      id: c.id,
      name: c.name,
      points: c.points,
      timeOfDay: c.timeOfDay,
      completed: done.has(completionKey(c.id, m.id, date)),
    })),
  }));

  const bonus = resolveBonusFor(data.chores, family.members, date, choreMarks(completionData), groups, data.settings, today)
    .map((item) => ({
      id: item.chore.id,
      name: item.chore.name,
      points: item.chore.points,
      kind: item.chore.bonus.claim === 'first' ? 'up-for-grabs' : 'everyone-can',
      openTo: item.eligibleIds,
      ...(item.grab ? { state: item.grab } : { doneBy: item.doneIds }),
    }));

  return NextResponse.json({ date, members, bonus });
}), "Failed to resolve the day's chores");
