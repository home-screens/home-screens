import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { ChoreCompletion, ChoreToggleRequest } from '@/types/config';
import { publicErrorResponse, parseJsonBody, isValidISODate } from '@/lib/api-utils';
import { readChoreData } from '@/lib/chore-data';
import { readFamilyData } from '@/lib/family-data';
import { atGrabLimit, checkBonusComplete, grabHolds, resetViewDay, countsSinceReset, readChoreSettings, isBonusChore, pruneChoreMarks, tickEndsGrabs, type BonusCheck } from '@/lib/chore-bonus';
import { withFamilyData, validateMemberReferences } from '@/lib/family-api';
import { commitDataTransaction, withDataTransaction, type TransactionChange } from '@/lib/data-transaction';
import { choresEtag, holdsEtag, revalidatedHeaders } from '@/lib/chore-revisions';
import { planPointsMove } from '@/lib/reward-data';
import type { RewardData } from '@/lib/reward-data';
import { choreMarks, planCompletionsUpdate, updateCompletionsAtomic } from '@/lib/chore-completion-data';
import { CHORE_HISTORY_DAYS, addDaysISO } from '@/components/modules/chore-chart/types';
import { householdToday } from '@/lib/household-day';

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
      const etag = await choresEtag(today);
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
      const answered = cleaned ? await choresEtag(today) : etag;
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
      return NextResponse.json(
        { ...choreMarks(marks), today, ...(saved ? { settings: readChoreSettings(saved.settings) } : {}) },
        { headers: revalidatedHeaders(answered) },
      );
    });
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

  // Set inside the mutator so the credit/debit below can be skipped for
  // directional no-ops — a repeated "I finished the dishes" from a voice
  // caller must never flip the chore back off or move points twice.
  let changed = false;
  let refused: BonusCheck | null = null;
  let refusedMarks: ReturnType<typeof choreMarks> | null = null;
  // A finished entry for this chore, person and day that still counts. One
  // made before a grown-up put the chore back is an earlier round: it stays
  // (its tickets were earned) and is neither this tick's "already done" nor
  // what an un-tick takes away.
  const sameDay = (c: ChoreCompletion) => c.choreId === choreId && c.memberId === memberId && c.date === date;
  const isDoneIn = (resets: Record<string, string> | undefined) => (c: ChoreCompletion) =>
    sameDay(c) && !c.status && (!chore || countsSinceReset(chore, c, resets ?? {}, resetViewDay(date, today)));
  const completionsPlan = await planCompletionsUpdate((data) => {
    const existing = data.completions.findIndex(isDoneIn(data.bonusResets));

    // Directional requests are idempotent: already in the requested state →
    // return the same reference, which planUpdate reports as "no change".
    if (direction === 'complete' && existing >= 0) return data;
    if (direction === 'uncomplete' && existing < 0) return data;

    // A bonus chore can be finished only by someone it is open to, and an up-
    // for-grabs one only once and only by whoever is holding it. An everyone-
    // can chore already done this time round is a no-op, like a repeat tick.
    if (existing < 0 && chore && isBonusChore(chore)) {
      const check = checkBonusComplete(chore, memberId, date, choreMarks(data), family.groups ?? [], choreData.settings.grabHold, today);
      if (check && 'already' in check) return data;
      if (check) { refused = check; refusedMarks = choreMarks(data); return data; }
    }
    changed = true;

    // Return a new object so the reference-equality check sees a change and
    // the plan carries an after-image. Mutating `data` in-place would look
    // like a no-op to the store. Ticking a chore marked "not today" replaces
    // the mark. Finishing an up-for-grabs chore in today's time round ends its
    // grabs; ticking an earlier round (yesterday's daily chore) leaves today's
    // grab alone. Un-ticking one that finished the person's own grab today
    // hands the grab back, rather than putting the chore up for grabs to
    // everyone; unless they have grabbed as many others as the household
    // allows since, when it goes back up for grabs instead. A tick nobody had
    // grabbed for (a grown-up's slip) leaves nobody holding it when undone.
    const endsGrabs = !!chore && isBonusChore(chore) && tickEndsGrabs(chore, date, today);
    const grabs = data.grabs ?? [];
    if (existing >= 0) {
      const completions = data.completions.filter((_, i) => i !== existing);
      // Any day of today's round (a grown-up unticks Tuesday of a Mon+Tue chore).
      const ended = data.completions[existing].endedGrab;
      const undoneToday = endsGrabs && typeof ended === 'string'
        && !grabs.some((g) => g.choreId === choreId)
        && !atGrabLimit(memberId, choreData.chores, today, { completions, grabs, bonusResets: data.bonusResets ?? {} }, choreData.settings, family.groups ?? []);
      return {
        ...data,
        completions,
        // With its own date: a tick and an un-tick must not restart how long it lasts.
        ...(undoneToday ? { grabs: [...grabs, { choreId, memberId, date: ended }] } : {}),
      };
    }
    return {
      ...data,
      completions: [...data.completions.filter((c) => !(sameDay(c) && c.status)), {
        choreId, memberId, date, at: new Date().toISOString(),
        // Only a grab that still holds: a lapsed one left in the file until
        // the next clean-up was never this person's to get back.
        ...(() => {
          if (!endsGrabs || !chore || !isBonusChore(chore)) return {};
          const own = grabs.find((g) => g.choreId === choreId && g.memberId === memberId && grabHolds(g, chore, today, choreData.settings.grabHold, today));
          return own ? { endedGrab: own.date > today ? today : own.date } : {};
        })(),
      }],
      ...(endsGrabs ? { grabs: grabs.filter((g) => g.choreId !== choreId) } : {}),
    };
  });

  if (refused) {
    const { refusal, memberId: holder } = refused as BonusCheck;
    return NextResponse.json(
      // The lists as they stand, so the screen that asked can show why at once.
      { error: 'Someone else has this bonus chore, or it is not open to this person.', reason: refusal, ...(holder ? { memberId: holder } : {}), ...((refusedMarks as ReturnType<typeof choreMarks> | null) ?? {}) },
      { status: 409 },
    );
  }

  const result = completionsPlan.result;
  const wasAdded = result.completions.some(isDoneIn(result.bonusResets));

  // Credit on add, exact-debit on remove. Both files are PLANNED here and
  // published together below: they were two independent durable writes, so a
  // power cut between them recorded the chore and credited nothing.
  let overspent: { memberId: string; balance: number } | undefined;
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
    if (!wasAdded && move.wentNegative) overspent = { memberId, balance: move.balance };
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
    ...choreMarks(result),
    changed,
    ...(rewards ? { rewards } : {}),
    ...(overspent ? { overspent } : {}),
  });
  });
  } catch (error) {
    return publicErrorResponse(error, 'Failed to update chore completions');
  }
};
