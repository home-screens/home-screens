import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { ChoreToggleRequest } from '@/types/config';
import { publicErrorResponse, isValidISODate, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { readChoreData } from '@/lib/chore-data';
import { familyResponse, readFamilyData } from '@/lib/family-data';
import { readChoreSettings, pruneChoreMarks } from '@/lib/chore-bonus';
import { applyChoreToggle, type ChoreToggleContext, type ChoreToggleResult } from '@/lib/chore-toggle';
import { withFamilyWrite, validateMemberReferences } from '@/lib/family-api';
import { commitDataTransaction, withDataTransaction, type TransactionChange } from '@/lib/data-transaction';
import { choresEtag, choresPageEtag, holdsEtag, revalidatedHeaders } from '@/lib/chore-revisions';
import { planPointsMove } from '@/lib/reward-data';
import type { RewardData } from '@/lib/reward-data';
import { choreMarks, planCompletionsUpdate, updateCompletionsAtomic } from '@/lib/chore-completion-data';
import { CHORE_HISTORY_DAYS, addDaysISO } from '@/components/modules/chore-chart/types';
import { householdToday } from '@/lib/household-day';
import { contentRevision } from '@/lib/content-revision';

export const dynamic = 'force-dynamic';

/** The first day of history kept: anything older than CHORE_HISTORY_DAYS days goes. */
function historyCutoff(today: string): string {
  return addDaysISO(today, -CHORE_HISTORY_DAYS);
}

/** `?days=`: how much history the caller wants, or null when it is not 1 to CHORE_HISTORY_DAYS. */
function readHistoryDays(raw: string | null): number | null {
  if (raw === null) return CHORE_HISTORY_DAYS;
  const days = Number(raw);
  return Number.isInteger(days) && days >= 1 && days <= CHORE_HISTORY_DAYS ? days : null;
}

// Public on the LAN — no auth wrapper. The /chores route is the unauthenticated
// kid view, so its data endpoint must be readable/writable without a session.
// The /remote surface is also unauthenticated at the page level; admin-only
// endpoints it calls (system/stats, backup, system/power) enforce auth via
// their own `withAuth` wrappers, not via anything gating /remote itself.
export const GET = async (request: NextRequest) => {
  try {
    const days = readHistoryDays(request.nextUrl.searchParams.get('days'));
    if (days === null) {
      return NextResponse.json({ error: `days must be a whole number from 1 to ${CHORE_HISTORY_DAYS}` }, { status: 400 });
    }
    // One pass through the coordinator: no write lands between the revision
    // and the read, so the ETag always names the bytes it is sent with.
    return await withDataTransaction(async () => {
      const today = await householdToday();
      // Walls and phones ask every few seconds and the lists change a few
      // times a day: an unchanged answer is a stat of two files, not a read.
      const withChores = request.nextUrl.searchParams.get('chores') === '1';
      const etagOf = withChores ? choresPageEtag : choresEtag;
      const etag = await etagOf(today);
      if (holdsEtag(request, etag)) return new NextResponse(null, { status: 304, headers: revalidatedHeaders(etag) });

      // Only persist when the clean-up actually evicted something. Returning
      // the same reference signals "no-op, skip the write". Behind the ETag
      // this runs once per change and once a day, not once per poll.
      // The chores say which old entries still hold a "when I put it back"
      // chore closed; when they cannot be read, nothing is cleaned up this time.
      let saved: Awaited<ReturnType<typeof readChoreData>> | null = null;
      try { saved = await readChoreData(); } catch { /* unreadable: skip the clean-up */ }
      let cleaned = false;
      const result = await updateCompletionsAtomic((data) => {
        if (!saved) return data;
        const next = pruneChoreMarks(data, saved.chores, historyCutoff(today), readChoreSettings(saved.settings).grabHold, today);
        cleaned = next !== data;
        return next;
      });
      // A clean-up wrote the file, so the answer is a revision later.
      const answered = cleaned ? await etagOf(today) : etag;
      // A shorter history is the same clean-up with a nearer cutoff: it keeps
      // what holds a put-back chore closed and the grabs that still hold, so
      // today and this week draw exactly as they do from the whole history.
      const marks = saved && days < CHORE_HISTORY_DAYS
        ? pruneChoreMarks(result, saved.chores, addDaysISO(today, -days), readChoreSettings(saved.settings).grabHold, today)
        : result;
      // `today` is the hub's calendar day: phones use it as theirs, so a phone
      // with a wrong clock still shows and ticks the household's day.
      // The household settings ride along, so a phone's rules line and sheet
      // follow a change made on another screen without a reload.
      // `?chores=1` adds the chore list and its revision, for the phone and
      // the kids' page, which keep a copy of it and must notice another
      // phone's edit. The wall never asks: it reads the list from the heartbeat.
      // The family comes with it: the kids' page has no session to read
      // `/api/family` with, and already shows these names.
      const chores = saved && withChores ? saved.chores : null;
      let family: ReturnType<typeof familyResponse> | null = null;
      if (chores) {
        try { family = familyResponse(await readFamilyData()); } catch { /* unreadable: the page keeps the family it has */ }
      }
      return NextResponse.json(
        {
          ...choreMarks(marks),
          today,
          ...(saved ? { settings: readChoreSettings(saved.settings) } : {}),
          ...(chores ? { chores, choresRevision: contentRevision(chores) } : {}),
          ...(family ? { family } : {}),
        },
        { headers: revalidatedHeaders(answered) },
      );
    });
  } catch (error) {
    return publicErrorResponse(error, 'Failed to read chore completions');
  }
};

/**
 * Plan the toggle in the store's own queue, where the read and the plan agree
 * with every other write to the file, and hand back what it came to.
 */
async function planChoreToggleUpdate(
  request: ChoreToggleRequest,
  context: ChoreToggleContext,
): Promise<{ toggle: ChoreToggleResult; change: TransactionChange | null }> {
  let toggle: ChoreToggleResult | undefined;
  const { change } = await planCompletionsUpdate((data) => {
    toggle = applyChoreToggle(data, request, context);
    return toggle.data;
  });
  // The store runs its mutator exactly once before the plan resolves.
  if (!toggle) throw new Error('The chore toggle was never planned');
  return { toggle, change };
}

export const POST = async (request: NextRequest) => {
  try {
  return await withFamilyWrite<ChoreToggleRequest, Response>(request, { maxBytes: SMALL_BODY_BYTES }, async (body) => {
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

  // The household's day (Settings time zone), which every screen shows.
  const today = await householdToday();
  const earliest = addDaysISO(today, -(CHORE_HISTORY_DAYS - 1));
  if (date > today || date < earliest) {
    return NextResponse.json(
      { error: `Date must be within the last ${CHORE_HISTORY_DAYS} days` },
      { status: 400 },
    );
  }

  const references = await validateMemberReferences([memberId]);
  if (references) return references;

  // The chore decides the tickets and, for a bonus chore, whether this person
  // may finish it at all, so it is read before the toggle is planned.
  const [choreData, family] = await Promise.all([readChoreData(), readFamilyData()]);
  const chore = choreData.chores.find((c) => c.id === choreId);

  const { toggle, change } = await planChoreToggleUpdate(body, {
    chores: choreData.chores,
    groups: family.groups ?? [],
    settings: choreData.settings,
    today,
    now: new Date().toISOString(),
  });

  if (toggle.outcome === 'refused') {
    const { refusal, memberId: holder } = toggle.refused;
    return NextResponse.json(
      // The lists as they stand, so the screen that asked can show why at once.
      { error: 'Someone else has this bonus chore, or it is not open to this person.', reason: refusal, ...(holder ? { memberId: holder } : {}), ...choreMarks(toggle.data) },
      { status: 409 },
    );
  }

  // Credit on add, exact-debit on remove. Both files are PLANNED here and
  // published together below: they were two independent durable writes, so a
  // power cut between them recorded the chore and credited nothing.
  let overspent: { memberId: string; balance: number } | undefined;
  // The post-write RewardData comes from the plan itself rather than a re-read.
  // Nothing can interleave: the whole handler holds the cross-file coordinator,
  // which is also what lets the two plans be committed as one unit.
  let rewards: RewardData | undefined;
  const changes: TransactionChange[] = [];
  if (change) changes.push(change);

  // A directional no-op moves nothing: a repeated "I finished the dishes"
  // from a voice caller must never flip the chore back off or pay twice.
  const changed = toggle.outcome === 'changed';
  if (toggle.outcome === 'changed' && chore && chore.points > 0) {
    const wasAdded = toggle.direction === 'complete';
    const move = await planPointsMove(memberId, wasAdded ? chore.points : -chore.points);
    if (move.change) changes.push(move.change);
    rewards = move.data;
    if (!wasAdded && move.wentNegative) overspent = { memberId, balance: move.balance };
  }

  // One journal commit: the completion and the points it moved both land, or
  // neither does. Recovery replays it at the start of the next transaction.
  if (changes.length) await commitDataTransaction({ kind: 'chore-toggle', changes });

  // When no credit/debit happened (0-point chore or chore-not-found) we omit
  // `rewards`: balances did not change, so the client has no reason to refresh
  // its rewards cache from this response.
  // `changed` lets a repeating caller (voice) distinguish "just done" from
  // "already done" without re-deriving it from the completions list.
  return NextResponse.json({
    ...choreMarks(toggle.data),
    changed,
    ...(rewards ? { rewards } : {}),
    ...(overspent ? { overspent } : {}),
  });
  });
  } catch (error) {
    return publicErrorResponse(error, 'Failed to update chore completions');
  }
};
