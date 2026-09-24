'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import type { ChoreDefinition, ChoreCompletion, ChoreGrab, ChoreSettings, ChoreToggleRequest, ChoreToggleResponse } from '@/types/config';
import { bonusTicketsEarned, countsSinceReset, readChoreSettings, resetViewDay, resolveBonusFor, type BonusItem, type BonusMarks, type BonusRefusal } from '@/lib/chore-bonus';
import { useFamilyData } from '@/hooks/useFamilyData';
import { useFetchData } from '@/hooks/useFetchData';
import type { FetchError } from '@/lib/fetch-error';
import { displayFetch } from '@/lib/display-fetch';
import { displayCache } from '@/lib/display-cache';
import { choresUrl, choresDataUrl, choreGrabUrl, rewardsUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import type { RewardRedemption, RewardDefinition } from '@/lib/reward-data';
import {
  type ResolvedAssignment,
  type MemberStats,
  type WeekDayData,
  todayStr,
  parseISO,
  buildCompletionSet,
  getWeekDatesFor,
  resolveAssignmentsFor,
  computeWeeklyPoints,
  computeStreak,
  countWeekAssignments,
  isDayFullyComplete,
} from './types';
import { choresOwedBy } from '@/lib/chore-assignments';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import { useFormattingLocale } from '@/i18n';
import { planChoreToggle, readOverspentNotice, type OverspentNotice } from './chore-toggle';

const EMPTY_REDEMPTIONS: RewardRedemption[] = [];

/** How long the overspent message stays on the wall before it clears itself. */
const OVERSPENT_NOTICE_MS = 12_000;

/** Display-only settings accepted by useChoreData — no members/chores,
 *  those are fetched separately from /api/family and /api/chores/data. */
export interface ChoreDataConfig {
  weekStartDay: 'sunday' | 'monday';
  showPoints: boolean;
  showStreaks: boolean;
  showTimeOfDay: boolean;
  accentColor: string;
}

interface ChoresResponse {
  completions: ChoreCompletion[];
  grabs?: ChoreGrab[];
  bonusResets?: Record<string, string>;
  /** The hub's calendar day. */
  today?: string;
}

interface ChoreDataResponse {
  chores: ChoreDefinition[];
  settings?: unknown;
}

interface RewardsResponse {
  rewards?: RewardDefinition[];
  balances: Record<string, number>;
  redemptions?: RewardRedemption[];
}

interface ChoreDataState {
  members: FamilyMember[];
  /** Family groups, which a chore's `assigneeGroupIds` are resolved against. */
  groups: FamilyGroup[];
  chores: ChoreDefinition[];
  rewards: RewardDefinition[];
  todayAssignments: ResolvedAssignment[];
  completionSet: Set<string>;
  memberStats: Map<string, MemberStats>;
  weekData: WeekDayData[];
  recentRedemptions: RewardRedemption[];
  /** Every redemption the server still holds (it purges at 90 days), for the store's feed. */
  allRedemptions: RewardRedemption[];
  isLoading: boolean;
  /** The rewards fetch has neither landed nor failed. Kept apart from
   *  `isLoading` because only the reward history cannot draw without it. */
  rewardsLoading: boolean;
  /** Set only while there are no rewards to show at all, like `error`. */
  rewardsError: FetchError | null;
  /** Set only while a source has no data at all; a failed refresh of good data is not an error here. */
  error: FetchError | null;
  /** Resolves with whether the hub took it, and why not when it refused (a bonus chore someone else has). */
  toggleComplete: (choreId: string, memberId: string) => Promise<ChoreWriteOutcome>;
  /** Today's bonus chores, each with who can do it and where it stands. They never count toward anything. */
  todayBonus: BonusItem[];
  /** The hub's calendar day (the screen's own until the hub answers), as `YYYY-MM-DD`. */
  today: string;
  /** Whether `today` is the hub's yet. A date header waits for it rather than naming the screen's own day first. */
  todayKnown: boolean;
  /** The lists bonus chores are resolved from, for questions like "is this person at the grab limit?". */
  bonusMarks: BonusMarks;
  choreSettings: ChoreSettings;
  /** Grab an up-for-grabs chore for someone, or let their grab go. */
  grabChore: (choreId: string, memberId: string, action: 'grab' | 'let-go') => Promise<ChoreWriteOutcome>;
  /** An un-tick that took someone below zero tickets, until it clears itself. */
  overspentNotice: OverspentNotice | null;
  /**
   * The server's answer to a redeem. Published here, not kept in the store
   * that asked, so every view of this data (and the next poll of chores, which
   * rebuilds the balances) sees the tickets as spent.
   */
  applyRedemption: (result: RedemptionResult) => void;
}

/** What a tick or a grab came to. `refusal` and `memberId` come from a 409: who got there first. */
export type ChoreWriteOutcome =
  /** `changed` is false when the hub had nothing to do (already done this time round). */
  | { ok: true; changed?: boolean }
  | { ok: false; refusal?: BonusRefusal; memberId?: string };

export interface RedemptionResult {
  balances?: Record<string, number>;
  redemptions?: RewardRedemption[];
}

export function useChoreData(config: ChoreDataConfig): ChoreDataState {
  // TTLs come from the shared registry so the prefetch system and the hook
  // stay in lockstep — see fetch-keys.ts. Drops to 5s give phone→wall
  // cross-device toggles a 5s worst-case lag.
  const choreChartTtl = FETCH_KEY_REGISTRY['chore-chart']?.ttlMs ?? 5_000;
  const formattingLocale = useFormattingLocale();
  const dayNames = useMemo(() => getLocalizedDayNames(formattingLocale, 'short'), [formattingLocale]);
  const [fetchedCompletions, completionsError] = useFetchData<ChoresResponse>(choresUrl(), choreChartTtl);
  const [fetchedChoreData, choreDataError] = useFetchData<ChoreDataResponse>(choresDataUrl(), 60_000);
  const [fetchedRewards, rewardsFetchError] = useFetchData<RewardsResponse>(rewardsUrl(), choreChartTtl);
  const [completions, setCompletions] = useState<ChoreCompletion[]>([]);
  const [grabs, setGrabs] = useState<ChoreGrab[]>([]);
  const [bonusResets, setBonusResets] = useState<Record<string, string>>({});
  // Mirror fetchedRewards into local state so toggleComplete can overwrite it
  // from the POST response for instant balance updates on the same device.
  const [rewards, setRewards] = useState<RewardsResponse | null>(null);
  // Timestamp of the last server-truth rewards write we applied from a POST
  // response. A /api/rewards GET isn't serialized with the rewards opQueue, so
  // a poll launched before our toggle can arrive AFTER the toggle response and
  // carry a pre-credit balance. We silence those stale polls during an
  // override window just long enough for the next poll to catch up.
  const rewardsOverrideUntil = useRef<number>(0);
  const [overspentNotice, setOverspentNotice] = useState<OverspentNotice | null>(null);

  const { members, groups, loading: familyLoading, loaded: familyLoaded, error: familyError } = useFamilyData();
  const chores = useMemo(() => fetchedChoreData?.chores ?? [], [fetchedChoreData]);
  const choreSettings = useMemo(() => readChoreSettings(fetchedChoreData?.settings), [fetchedChoreData]);

  useEffect(() => {
    if (!fetchedCompletions) return;
    setCompletions(fetchedCompletions.completions ?? []);
    setGrabs(fetchedCompletions.grabs ?? []);
    setBonusResets(fetchedCompletions.bonusResets ?? {});
  }, [fetchedCompletions]);
  useEffect(() => {
    if (!fetchedRewards) return;
    // Drop polls that land inside the override window — they may be replies
    // to in-flight fetches that predate the current server-truth balance.
    if (Date.now() < rewardsOverrideUntil.current) return;
    setRewards(fetchedRewards);
  }, [fetchedRewards]);

  const isLoading = (!fetchedCompletions && !completionsError) || (!fetchedChoreData && !choreDataError) || familyLoading;
  // Only a source with nothing to show counts. A failed refresh keeps the
  // last good data, and the chart keeps drawing it.
  const error = (fetchedCompletions ? null : completionsError)
    ?? (fetchedChoreData ? null : choreDataError)
    ?? (familyLoaded ? null : familyError);

  // `rewards` trails `fetchedRewards` by one render (it is mirrored through an
  // effect), so read through to the fetch rather than flashing an empty feed.
  const knownRewards = rewards ?? fetchedRewards;
  const rewardsLoading = !knownRewards && !rewardsFetchError;
  const rewardsError = knownRewards ? null : rewardsFetchError;

  const completionSet = useMemo(() => buildCompletionSet(completions), [completions]);
  // Today is the hub's calendar day once it has said so, as on the phone: a
  // display-only Pi on another clock or time zone must not draw, grab or tick
  // a different day. Its own clock covers the first paint.
  const today = fetchedCompletions?.today ?? todayStr();

  const bonusMarks = useMemo<BonusMarks>(() => ({ completions, grabs, bonusResets }), [completions, grabs, bonusResets]);
  const todayBonus = useMemo(
    // The wall and the card are kid-facing: a put-back chore done on an
    // earlier day waits for a grown-up out of sight.
    () => resolveBonusFor(chores, members, today, bonusMarks, groups, choreSettings, today).filter((item) => !item.waiting),
    [chores, members, bonusMarks, groups, choreSettings, today],
  );

  const todayAssignments = useMemo(
    () => resolveAssignmentsFor(chores, members, today, completionSet, groups),
    [chores, members, completionSet, groups, today],
  );

  // Per-member stats (streaks computed client-side with config context)
  const memberStats = useMemo(() => {
    const stats = new Map<string, MemberStats>();
    const weekDates = getWeekDatesFor(parseISO(today), config.weekStartDay);

    for (const member of members) {
      const myAssignments = todayAssignments.filter((a) => a.memberId === member.id && !a.isSkipped);
      const completed = myAssignments.filter((a) => a.isCompleted).length;
      const total = myAssignments.length;

      const { earned: weeklyPoints, total: weeklyPointsTotal } = computeWeeklyPoints(
        chores,
        member.id,
        weekDates,
        completionSet,
        groups,
      );
      const streak = computeStreak(chores, member.id, today, completionSet, groups);

      stats.set(member.id, {
        total,
        completed,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        streak,
        weeklyPoints: weeklyPoints + bonusTicketsEarned(chores, member.id, weekDates, completions),
        weeklyPointsTotal,
        rewardBalance: rewards?.balances?.[member.id] ?? 0,
        weekAssigned: countWeekAssignments(chores, member.id, weekDates, groups),
      });
    }

    return stats;
  }, [members, groups, chores, todayAssignments, completionSet, completions, config.weekStartDay, rewards, today]);

  // Week data for star chart — aligned to configured week start day
  const weekData = useMemo(() => {
    const days: WeekDayData[] = [];
    const weekDates = getWeekDatesFor(parseISO(today), config.weekStartDay);

    for (const date of weekDates) {
      const dayOfWeek = parseISO(date).getDay();

      const memberStars: Record<string, boolean> = {};
      const memberAssigned: Record<string, boolean> = {};

      for (const member of members) {
        // A star is earned when ALL assigned chores for that day are completed
        memberStars[member.id] = isDayFullyComplete(chores, member.id, date, completionSet, groups);
        // A day where everything was marked "not today" is no day at all:
        // neither a star nor a miss.
        memberAssigned[member.id] = choresOwedBy(chores, member.id, date, completionSet, groups).length > 0;
      }

      days.push({
        date,
        dayName: dayNames[dayOfWeek],
        dayIndex: dayOfWeek,
        isToday: date === today,
        memberStars,
        memberAssigned,
      });
    }

    return days;
  }, [members, groups, chores, completionSet, config.weekStartDay, dayNames, today]);

  // Server truth from a write we made ourselves. Primes the shared cache so
  // sibling module instances do not re-read stale data, and opens the override
  // window so a stale in-flight poll cannot flash the old balance back.
  const publishRewards = useCallback((next: RewardsResponse) => {
    setRewards(next);
    displayCache.set(rewardsUrl(), next, choreChartTtl);
    rewardsOverrideUntil.current = Date.now() + choreChartTtl;
  }, [choreChartTtl]);

  const latestRewards = useRef<RewardsResponse | null>(null);
  useEffect(() => { latestRewards.current = knownRewards ?? null; }, [knownRewards]);
  const applyRedemption = useCallback((result: RedemptionResult) => {
    const current = latestRewards.current;
    publishRewards({
      rewards: current?.rewards,
      balances: result.balances ?? current?.balances ?? {},
      redemptions: result.redemptions ?? current?.redemptions,
    });
  }, [publishRewards]);

  // A refused write answers with the lists as they stand; without them (an
  // older hub, a broken body) the screen goes back to what it had.
  const applyMarks = useCallback((body: Partial<ChoresResponse> | null, completionsBefore: ChoreCompletion[], grabsBefore: ChoreGrab[]) => {
    setCompletions(body?.completions ?? completionsBefore);
    setGrabs(body?.grabs ?? grabsBefore);
    if (body?.bonusResets) setBonusResets(body.bonusResets);
  }, []);

  const toggleComplete = useCallback(async (choreId: string, memberId: string) => {
    // One plan drives both the optimistic update and the direction the server
    // is told, so the screen and the request can never disagree. It is worked
    // out here rather than inside a state updater: React may run an updater
    // during the next render instead of at the call, and the direction has to
    // be known now, for the request going out on this line.
    const snapshot = completions;
    const chore = chores.find((c) => c.id === choreId);
    const plan = planChoreToggle(snapshot, choreId, memberId, today, (c) => !chore || countsSinceReset(chore, c, bonusResets, resetViewDay(today, today)));

    setCompletions(plan.completions);

    try {
      const reqBody: ChoreToggleRequest = { choreId, memberId, date: today, direction: plan.direction };
      const res = await displayFetch(choresUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (res.status === 409) {
        // Someone else has this bonus chore: the answer carries the lists as
        // they stand, so the wall shows who has it at once, not at the next poll.
        const refused = await res.json().catch(() => null);
        applyMarks(refused, snapshot, grabs);
        return { ok: false, refusal: refused?.reason, memberId: refused?.memberId };
      }
      if (!res.ok) throw new Error('Failed to toggle');
      const data: ChoreToggleResponse = await res.json();
      setCompletions(data.completions ?? []);
      if (data.grabs) setGrabs(data.grabs);
      // Update rewards from the POST response so ticket balances reflect the
      // new credit/debit instantly — without waiting for the next rewards poll.
      // Also prime the shared cache so sibling module instances (e.g. a
      // dashboard tab that mounts later) don't re-read stale data, and set the
      // override window so a stale in-flight poll can't flash the old balance
      // back until the next poll returns a fresh snapshot.
      if (data.rewards) publishRewards(data.rewards);
      // Un-ticking takes the tickets back, and they may already be spent. The
      // screen says so rather than leaving a kid to find a negative balance
      // later with nothing to explain it.
      setOverspentNotice(readOverspentNotice(data.overspent, members));
      return { ok: true, changed: data.changed !== false };
    } catch {
      setCompletions(snapshot);
      return { ok: false };
    }
  }, [publishRewards, members, completions, chores, bonusResets, grabs, applyMarks, today]);

  const grabChore = useCallback(async (choreId: string, memberId: string, action: 'grab' | 'let-go'): Promise<ChoreWriteOutcome> => {
    const snapshot = grabs;
    setGrabs(action === 'grab'
      ? [...snapshot.filter((g) => g.choreId !== choreId), { choreId, memberId, date: today }]
      : snapshot.filter((g) => !(g.choreId === choreId && g.memberId === memberId)));
    try {
      const res = await displayFetch(choreGrabUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choreId, memberId, action }),
      });
      if (res.status === 409) {
        const refused = await res.json().catch(() => null);
        applyMarks(refused, completions, snapshot);
        return { ok: false, refusal: refused?.reason, memberId: refused?.memberId };
      }
      if (!res.ok) throw new Error('Failed to grab');
      const data: ChoreToggleResponse = await res.json();
      setCompletions(data.completions ?? []);
      setGrabs(data.grabs ?? []);
      return { ok: true };
    } catch {
      setGrabs(snapshot);
      return { ok: false };
    }
  }, [grabs, completions, applyMarks, today]);

  // The notice is a passing message, not a state of the world: it clears
  // itself so a wall display is not left holding it for the rest of the day.
  useEffect(() => {
    if (!overspentNotice) return;
    const id = setTimeout(() => setOverspentNotice(null), OVERSPENT_NOTICE_MS);
    return () => clearTimeout(id);
  }, [overspentNotice]);

  const recentRedemptions = useMemo(() => {
    const list = rewards?.redemptions;
    if (!list || list.length === 0) return [];
    const cutoff = Date.now() - 5 * 60_000;
    return list.filter((r) => new Date(r.redeemedAt).getTime() >= cutoff);
  }, [rewards]);

  return {
    members,
    groups,
    chores,
    rewards: rewards?.rewards ?? [],
    todayAssignments,
    completionSet,
    memberStats,
    weekData,
    recentRedemptions,
    allRedemptions: knownRewards?.redemptions ?? EMPTY_REDEMPTIONS,
    isLoading,
    rewardsLoading,
    rewardsError,
    error,
    toggleComplete,
    todayBonus,
    today,
    todayKnown: typeof fetchedCompletions?.today === 'string',
    bonusMarks,
    choreSettings,
    grabChore,
    overspentNotice,
    applyRedemption,
  };
}
