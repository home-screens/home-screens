import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { ChoreCompletion, ChoreToggleRequest } from '@/types/config';
import { errorResponse } from '@/lib/api-utils';
import { readChoreData } from '@/lib/chore-data';
import { creditPoints, debitPointsExact } from '@/lib/reward-data';
import type { RewardData } from '@/lib/reward-data';
import { updateCompletionsAtomic } from '@/lib/chore-completion-data';
import { CHORE_HISTORY_DAYS } from '@/components/modules/chore-chart/types';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True iff `s` is a YYYY-MM-DD string AND the components are a real calendar date.
 *  Rejects junk like "2026-99-99" (which the regex alone would accept). */
function isValidISODate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Format a Date as YYYY-MM-DD in local time */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Remove completions older than CHORE_HISTORY_DAYS days */
function purgeOld(completions: ChoreCompletion[]): ChoreCompletion[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CHORE_HISTORY_DAYS);
  const cutoffStr = localDateStr(cutoff);
  return completions.filter((c) => c.date >= cutoffStr);
}

// Public on the LAN — no auth wrapper. The /chores route is the unauthenticated
// kid view, so its data endpoint must be readable/writable without a session.
// The /remote surface is also unauthenticated at the page level; admin-only
// endpoints it calls (system/stats, backup, system/power) enforce auth via
// their own `withAuth` wrappers, not via anything gating /remote itself.
export const GET = async () => {
  try {
    // Always go through updateAtomic (so we observe in-flight POST writes), but
    // only persist when purgeOld actually evicted something — otherwise a
    // quiescent display polling every 15s would churn the disk forever.
    // Returning the same reference signals "no-op, skip the write".
    const result = await updateCompletionsAtomic((data) => {
      const cleaned = purgeOld(data.completions);
      if (cleaned.length === data.completions.length) return data; // nothing to purge
      return { completions: cleaned };
    });
    return NextResponse.json({ completions: result.completions });
  } catch (error) {
    return errorResponse(error, 'Failed to read chore completions');
  }
};

export const POST = async (request: NextRequest) => {
  try {
  const body = await request.json();
  const { choreId, memberId, date } = body as ChoreToggleRequest;

  if (!choreId || !memberId || !date) {
    return NextResponse.json(
      { error: 'Missing choreId, memberId, or date' },
      { status: 400 },
    );
  }

  if (!isValidISODate(date)) {
    return NextResponse.json(
      { error: 'Invalid date format — expected a real YYYY-MM-DD calendar date' },
      { status: 400 },
    );
  }

  const today = localDateStr(new Date());
  const earliest = (() => {
    const d = new Date();
    d.setDate(d.getDate() - (CHORE_HISTORY_DAYS - 1));
    return localDateStr(d);
  })();
  if (date > today || date < earliest) {
    return NextResponse.json(
      { error: `Date must be within the last ${CHORE_HISTORY_DAYS} days` },
      { status: 400 },
    );
  }

  // Read chore data in parallel with toggle (needed for point value lookup)
  const choreDataPromise = readChoreData();

  const result = await updateCompletionsAtomic((data) => {
    const existing = data.completions.findIndex(
      (c) => c.choreId === choreId && c.memberId === memberId && c.date === date,
    );

    // Return a new object so updateAtomic's reference-equality check sees a
    // change and persists the write. Mutating `data` in-place would look like
    // a no-op to the store.
    const completions =
      existing >= 0
        ? data.completions.filter((_, i) => i !== existing)
        : [
            ...data.completions,
            {
              choreId,
              memberId,
              date,
              completedAt: new Date().toISOString(),
            },
          ];

    return { completions };
  });

  const wasAdded = result.completions.some(
    (c) => c.choreId === choreId && c.memberId === memberId && c.date === date,
  );

  // Credit on add, exact-debit on remove. Awaited so the response reflects the
  // post-write state and surfaces the warning if balance went negative.
  const choreData = await choreDataPromise;
  const chore = choreData.chores.find((c) => c.id === choreId);
  let warning: string | undefined;
  // Capture the post-write RewardData from the mutation itself rather than
  // re-reading from disk. Both creditPoints and debitPointsExact resolve only
  // AFTER their write commits through reward-data.ts's shared opQueue, so the
  // returned snapshot is race-free — a concurrent toggle from another kid
  // can't interleave between the write and our read.
  let rewards: RewardData | undefined;
  if (chore && chore.points > 0) {
    if (wasAdded) {
      rewards = await creditPoints(memberId, chore.points);
    } else {
      const debitResult = await debitPointsExact(memberId, chore.points);
      rewards = debitResult.data;
      if (debitResult.wentNegative) {
        const memberName = choreData.members.find((m) => m.id === memberId)?.name ?? 'They';
        warning = `${memberName}'s balance is now ${debitResult.balance} — they'll need to earn ${Math.abs(debitResult.balance)} points before redeeming again.`;
      }
    }
  }

  // When no credit/debit happened (0-point chore or chore-not-found) we omit
  // `rewards` — balances didn't change, so the client has no reason to refresh
  // its rewards cache from this response.
  return NextResponse.json({
    completions: result.completions,
    ...(rewards ? { rewards } : {}),
    ...(warning ? { warning } : {}),
  });
  } catch (error) {
    return errorResponse(error, 'Failed to update chore completions');
  }
};
