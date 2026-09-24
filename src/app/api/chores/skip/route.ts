import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isValidISODate, parseJsonBody, withAuth } from '@/lib/api-utils';
import { readChoreData } from '@/lib/chore-data';
import { readFamilyData } from '@/lib/family-data';
import { withFamilyData } from '@/lib/family-api';
import { choreMarks, updateCompletionsAtomic } from '@/lib/chore-completion-data';
import { isAssignedOn } from '@/lib/chore-assignments';
import { CHORE_HISTORY_DAYS, addDaysISO } from '@/components/modules/chore-chart/types';
import { householdToday } from '@/lib/household-day';

export const dynamic = 'force-dynamic';

interface SkipRequest {
  choreId?: unknown;
  memberIds?: unknown;
  date?: unknown;
  /** true marks the chore "not today" for these people; false takes the mark away. */
  skipped?: unknown;
}

/**
 * Mark a chore "not today" for some of the people who have it, or undo that.
 *
 * Grown-ups only (a session): a kid could otherwise clear their own list. A
 * "not today" pays nothing and leaves every count, so nobody's star or streak
 * breaks over a chore that could not be done. Someone who already did the
 * chore that day keeps it done; marking "everyone" passes over them.
 */
export const POST = withAuth(async (request: NextRequest) => withFamilyData(async () => {
  const body = await parseJsonBody<SkipRequest>(request);
  if (body instanceof NextResponse) return body;
  const { choreId, memberIds, date, skipped } = body;
  if (typeof choreId !== 'string' || !choreId || typeof date !== 'string' || typeof skipped !== 'boolean'
    || !Array.isArray(memberIds) || memberIds.length === 0 || !memberIds.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: 'Send a choreId, a list of memberIds, a date and skipped.' }, { status: 400 });
  }
  const today = await householdToday();
  if (!isValidISODate(date) || date > today || date < addDaysISO(today, -(CHORE_HISTORY_DAYS - 1))) {
    return NextResponse.json({ error: `Date must be within the last ${CHORE_HISTORY_DAYS} days` }, { status: 400 });
  }

  const [{ chores }, family] = await Promise.all([readChoreData(), readFamilyData()]);
  const chore = chores.find((c) => c.id === choreId);
  if (!chore) return NextResponse.json({ error: 'That chore no longer exists.' }, { status: 404 });
  const groups = family.groups ?? [];
  // Only a chore someone owes that day can be let off; bonus chores are owed by nobody.
  if (!memberIds.every((id) => isAssignedOn(chore, id, date, groups))) {
    return NextResponse.json({ error: 'Everyone listed needs to have this chore that day.' }, { status: 400 });
  }

  const result = await updateCompletionsAtomic((data) => {
    const forThem = (c: { choreId: string; memberId: string; date: string }) =>
      c.choreId === choreId && c.date === date && memberIds.includes(c.memberId);
    if (!skipped) {
      const kept = data.completions.filter((c) => !(forThem(c) && c.status === 'skipped'));
      return kept.length === data.completions.length ? data : { ...data, completions: kept };
    }
    const marked = new Set(data.completions.filter(forThem).map((c) => c.memberId));
    const add = memberIds.filter((id) => !marked.has(id));
    if (add.length === 0) return data;
    const at = new Date().toISOString();
    return {
      ...data,
      completions: [...data.completions, ...add.map((memberId) => ({ choreId, memberId, date, status: 'skipped' as const, at }))],
    };
  });
  return NextResponse.json(choreMarks(result));
}), 'Failed to mark the chore');
