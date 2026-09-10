import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { ChoreCompletion, ChoreToggleRequest } from '@/types/config';
import { publicErrorResponse, parseJsonBody, isValidISODate } from '@/lib/api-utils';
import { readChoreData } from '@/lib/chore-data';
import { readFamilyData } from '@/lib/family-data';
import { withFamilyData, validateMemberReferences } from '@/lib/family-api';
import { commitDataTransaction, type TransactionChange } from '@/lib/data-transaction';
import { planPointsMove } from '@/lib/reward-data';
import type { RewardData } from '@/lib/reward-data';
import { planCompletionsUpdate, updateCompletionsAtomic } from '@/lib/chore-completion-data';
import { CHORE_HISTORY_DAYS } from '@/components/modules/chore-chart/types';

export const dynamic = 'force-dynamic';

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
    return publicErrorResponse(error, 'Failed to read chore completions');
  }
};

export const POST = async (request: NextRequest) => {
  try {
  return await withFamilyData(async () => {
  const body = await parseJsonBody<ChoreToggleRequest>(request);
  if (body instanceof NextResponse) return body;
  const { choreId, memberId, date, direction } = body;

  if (!choreId || !memberId || !date) {
    return NextResponse.json(
      { error: 'Missing choreId, memberId, or date' },
      { status: 400 },
    );
  }

  if (direction !== undefined && direction !== 'complete' && direction !== 'uncomplete') {
    return NextResponse.json(
      { error: 'direction must be "complete" or "uncomplete" when provided' },
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

  const references = await validateMemberReferences([memberId]);
  if (references) return references;
  const family = await readFamilyData();

  // Read chore data in parallel with toggle (needed for point value lookup)
  const choreDataPromise = readChoreData();

  // Set inside the mutator so the credit/debit below can be skipped for
  // directional no-ops — a repeated "I finished the dishes" from a voice
  // caller must never flip the chore back off or move points twice.
  let changed = false;
  const completionsPlan = await planCompletionsUpdate((data) => {
    const existing = data.completions.findIndex(
      (c) => c.choreId === choreId && c.memberId === memberId && c.date === date,
    );

    // Directional requests are idempotent: already in the requested state →
    // return the same reference, which planUpdate reports as "no change".
    if (direction === 'complete' && existing >= 0) return data;
    if (direction === 'uncomplete' && existing < 0) return data;
    changed = true;

    // Return a new object so the reference-equality check sees a change and
    // the plan carries an after-image. Mutating `data` in-place would look
    // like a no-op to the store.
    const completions =
      existing >= 0
        ? data.completions.filter((_, i) => i !== existing)
        : [...data.completions, { choreId, memberId, date }];

    return { completions };
  });

  const result = completionsPlan.result;
  const wasAdded = result.completions.some(
    (c) => c.choreId === choreId && c.memberId === memberId && c.date === date,
  );

  // Credit on add, exact-debit on remove. Both files are PLANNED here and
  // published together below: they were two independent durable writes, so a
  // power cut between them recorded the chore and credited nothing.
  const choreData = await choreDataPromise;
  const chore = choreData.chores.find((c) => c.id === choreId);
  let warning: string | undefined;
  // The post-write RewardData comes from the plan itself rather than a re-read.
  // Nothing can interleave: the whole handler holds the cross-file coordinator,
  // which is also what lets the two plans be committed as one unit.
  let rewards: RewardData | undefined;
  const changes: TransactionChange[] = [];
  if (completionsPlan.change) changes.push(completionsPlan.change);

  if (changed && chore && chore.points > 0) {
    const move = await planPointsMove(memberId, wasAdded ? chore.points : -chore.points);
    if (move.change) changes.push(move.change);
    rewards = move.data;
    if (!wasAdded && move.wentNegative) {
      const memberName = family.members.find((m) => m.id === memberId)?.name ?? 'They';
      warning = `${memberName}'s balance is now ${move.balance} — they'll need to earn ${Math.abs(move.balance)} points before redeeming again.`;
    }
  }

  // One journal commit: the completion and the points it moved both land, or
  // neither does. Recovery replays it at the start of the next transaction.
  if (changes.length) await commitDataTransaction({ kind: 'chore-toggle', changes });

  // When no credit/debit happened (0-point chore or chore-not-found) we omit
  // `rewards` — balances didn't change, so the client has no reason to refresh
  // its rewards cache from this response.
  // `changed` lets a repeating caller (voice) distinguish "just done" from
  // "already done" without re-deriving it from the completions list.
  return NextResponse.json({
    completions: result.completions,
    changed,
    ...(rewards ? { rewards } : {}),
    ...(warning ? { warning } : {}),
  });
  });
  } catch (error) {
    return publicErrorResponse(error, 'Failed to update chore completions');
  }
};
