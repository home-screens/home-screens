import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseJsonBody, withAuth } from '@/lib/api-utils';
import { readChoreData } from '@/lib/chore-data';
import { withFamilyData } from '@/lib/family-api';
import { choreMarks, updateCompletionsAtomic } from '@/lib/chore-completion-data';
import { householdTimestamp } from '@/lib/household-day';

export const dynamic = 'force-dynamic';

/**
 * Put a done "when I put it back" bonus chore back, so it is open again.
 *
 * Grown-ups only (a session). The time is kept with the completions rather
 * than on the chore: saving it on the chore would change the chore list's
 * revision and turn every open phone's next chore save into a conflict.
 * Completions made before it stop counting; their tickets stay earned.
 */
export const POST = withAuth(async (request: NextRequest) => withFamilyData(async () => {
  const body = await parseJsonBody<{ choreId?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const { choreId } = body;
  if (typeof choreId !== 'string' || !choreId) {
    return NextResponse.json({ error: 'Send a choreId.' }, { status: 400 });
  }
  const { chores } = await readChoreData();
  const chore = chores.find((c) => c.id === choreId);
  if (!chore) return NextResponse.json({ error: 'That chore no longer exists.' }, { status: 404 });
  if (chore.bonus?.comesBack !== 'manual') {
    return NextResponse.json({ error: 'Only a bonus chore that comes back when you put it back can be put back.' }, { status: 400 });
  }
  // In the hub's own offset: every screen reads the same day from it.
  const at = await householdTimestamp();
  const result = await updateCompletionsAtomic((data) => ({
    ...data,
    bonusResets: { ...data.bonusResets, [choreId]: at },
    // A grab of a chore nobody could finish until now has nothing to hold.
    grabs: (data.grabs ?? []).filter((g) => g.choreId !== choreId),
  }));
  return NextResponse.json(choreMarks(result));
}), 'Failed to put the chore back');
