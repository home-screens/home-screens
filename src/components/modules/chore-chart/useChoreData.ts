'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ChoreMember, ChoreDefinition, ChoreCompletion, ChoreToggleRequest, ChoreToggleResponse } from '@/types/config';
import { useFetchData } from '@/hooks/useFetchData';
import { displayFetch } from '@/lib/display-fetch';
import { displayCache } from '@/lib/display-cache';
import { choresUrl, choresDataUrl, rewardsUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import type { RewardRedemption, RewardDefinition } from '@/lib/reward-data';
import {
  type ResolvedAssignment,
  type MemberStats,
  type WeekDayData,
  DAY_NAMES_SHORT,
  localDateStr,
  todayStr,
  resolveAssignee,
  choreAppliesToday,
  completionKey,
  getWeekDatesFor,
} from './types';

/** Display-only settings accepted by useChoreData — no members/chores,
 *  those are fetched from the shared /api/chores/data endpoint. */
export interface ChoreDataConfig {
  weekStartDay: 'sunday' | 'monday';
  showPoints: boolean;
  showStreaks: boolean;
  showTimeOfDay: boolean;
  accentColor: string;
}

interface ChoresResponse {
  completions: ChoreCompletion[];
}

interface ChoreDataResponse {
  members: ChoreMember[];
  chores: ChoreDefinition[];
}

interface RewardsResponse {
  rewards?: RewardDefinition[];
  balances: Record<string, number>;
  redemptions?: RewardRedemption[];
}

interface ChoreDataState {
  members: ChoreMember[];
  chores: ChoreDefinition[];
  rewards: RewardDefinition[];
  todayAssignments: ResolvedAssignment[];
  completionSet: Set<string>;
  memberStats: Map<string, MemberStats>;
  weekData: WeekDayData[];
  recentRedemptions: RewardRedemption[];
  isLoading: boolean;
  error: string | null;
  toggleComplete: (choreId: string, memberId: string) => Promise<void>;
}

export function useChoreData(config: ChoreDataConfig): ChoreDataState {
  // TTLs come from the shared registry so the prefetch system and the hook
  // stay in lockstep — see fetch-keys.ts. Drops to 5s give phone→wall
  // cross-device toggles a 5s worst-case lag.
  const choreChartTtl = FETCH_KEY_REGISTRY['chore-chart']?.ttlMs ?? 5_000;
  const [fetchedCompletions, completionsError] = useFetchData<ChoresResponse>(choresUrl(), choreChartTtl);
  const [fetchedChoreData] = useFetchData<ChoreDataResponse>(choresDataUrl(), 60_000);
  const [fetchedRewards] = useFetchData<RewardsResponse>(rewardsUrl(), choreChartTtl);
  const [completions, setCompletions] = useState<ChoreCompletion[]>([]);
  // Mirror fetchedRewards into local state so toggleComplete can overwrite it
  // from the POST response for instant balance updates on the same device.
  const [rewards, setRewards] = useState<RewardsResponse | null>(null);
  // Timestamp of the last server-truth rewards write we applied from a POST
  // response. A /api/rewards GET isn't serialized with the rewards opQueue, so
  // a poll launched before our toggle can arrive AFTER the toggle response and
  // carry a pre-credit balance. We silence those stale polls during an
  // override window just long enough for the next poll to catch up.
  const rewardsOverrideUntil = useRef<number>(0);

  // Members and chores from shared data file
  const members = useMemo(() => fetchedChoreData?.members ?? [], [fetchedChoreData]);
  const chores = useMemo(() => fetchedChoreData?.chores ?? [], [fetchedChoreData]);

  // Sync fetched data → local state (polls and initial load)
  useEffect(() => {
    if (fetchedCompletions) setCompletions(fetchedCompletions.completions ?? []);
  }, [fetchedCompletions]);
  useEffect(() => {
    if (!fetchedRewards) return;
    // Drop polls that land inside the override window — they may be replies
    // to in-flight fetches that predate the current server-truth balance.
    if (Date.now() < rewardsOverrideUntil.current) return;
    setRewards(fetchedRewards);
  }, [fetchedRewards]);

  const isLoading = (!fetchedCompletions && !completionsError) || !fetchedChoreData;
  const error = completionsError;

  // Build completion set for fast lookup
  const completionSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of completions) {
      set.add(completionKey(c.choreId, c.memberId, c.date));
    }
    return set;
  }, [completions]);

  // Resolve today's assignments
  const todayAssignments = useMemo(() => {
    const today = todayStr();
    const dayOfWeek = new Date().getDay();
    const assignments: ResolvedAssignment[] = [];

    for (const chore of chores) {
      if (!choreAppliesToday(chore, dayOfWeek, today)) continue;
      const assignees = resolveAssignee(chore, today);
      for (const memberId of assignees) {
        if (!members.some((m) => m.id === memberId)) continue;
        assignments.push({
          chore,
          memberId,
          isCompleted: completionSet.has(completionKey(chore.id, memberId, today)),
        });
      }
    }

    return assignments;
  }, [chores, members, completionSet]);

  // Per-member stats (streaks computed client-side with config context)
  const memberStats = useMemo(() => {
    const stats = new Map<string, MemberStats>();
    const today = todayStr();

    for (const member of members) {
      const myAssignments = todayAssignments.filter((a) => a.memberId === member.id);
      const completed = myAssignments.filter((a) => a.isCompleted).length;
      const total = myAssignments.length;

      // Weekly points — aligned to configured week start day
      const weekDates = getWeekDatesFor(new Date(), config.weekStartDay);
      let weeklyPoints = 0;
      let weeklyPointsTotal = 0;
      for (const date of weekDates) {
        const d = new Date(date + 'T00:00:00');
        const dayOfWeek = d.getDay();
        for (const chore of chores) {
          if (!choreAppliesToday(chore, dayOfWeek, date)) continue;
          if (!resolveAssignee(chore, date).includes(member.id)) continue;
          weeklyPointsTotal += chore.points;
          if (completionSet.has(completionKey(chore.id, member.id, date))) {
            weeklyPoints += chore.points;
          }
        }
      }

      // Streak — consecutive past days with ALL assigned chores completed
      let streak = 0;
      const sd = new Date();
      sd.setDate(sd.getDate() - 1); // start from yesterday
      for (let i = 0; i < 30; i++) {
        const date = localDateStr(sd);
        const dayOfWeek = sd.getDay();
        const assignedChores = chores.filter((c) => {
          if (!choreAppliesToday(c, dayOfWeek, date)) return false;
          return resolveAssignee(c, date).includes(member.id);
        });

        if (assignedChores.length === 0) {
          // No chores assigned — skip day without breaking streak
          sd.setDate(sd.getDate() - 1);
          continue;
        }

        const allDone = assignedChores.every((c) =>
          completionSet.has(completionKey(c.id, member.id, date)),
        );

        if (allDone) {
          streak++;
          sd.setDate(sd.getDate() - 1);
        } else {
          break;
        }
      }

      // Include today if all today's chores are done
      const todayDayOfWeek = new Date().getDay();
      const todayAssigned = chores.filter((c) => {
        if (!choreAppliesToday(c, todayDayOfWeek, today)) return false;
        return resolveAssignee(c, today).includes(member.id);
      });
      if (todayAssigned.length > 0 && todayAssigned.every((c) =>
        completionSet.has(completionKey(c.id, member.id, today)),
      )) {
        streak++;
      }

      stats.set(member.id, {
        total,
        completed,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        streak,
        weeklyPoints,
        weeklyPointsTotal,
        rewardBalance: rewards?.balances?.[member.id] ?? 0,
      });
    }

    return stats;
  }, [members, chores, todayAssignments, completionSet, config.weekStartDay, rewards]);

  // Week data for star chart — aligned to configured week start day
  const weekData = useMemo(() => {
    const days: WeekDayData[] = [];
    const today = todayStr();
    const weekDates = getWeekDatesFor(new Date(), config.weekStartDay);

    for (const date of weekDates) {
      const d = new Date(date + 'T00:00:00');
      const dayOfWeek = d.getDay();

      const memberStars: Record<string, boolean> = {};

      for (const member of members) {
        // A star is earned when ALL assigned chores for that day are completed
        const dayChores = chores.filter((c) => choreAppliesToday(c, dayOfWeek, date));
        const assignedChores = dayChores.filter((c) => {
          const assignees = resolveAssignee(c, date);
          return assignees.includes(member.id);
        });

        if (assignedChores.length === 0) {
          memberStars[member.id] = false;
        } else {
          memberStars[member.id] = assignedChores.every((c) =>
            completionSet.has(completionKey(c.id, member.id, date)),
          );
        }
      }

      days.push({
        date,
        dayName: DAY_NAMES_SHORT[dayOfWeek],
        dayIndex: dayOfWeek,
        isToday: date === today,
        memberStars,
      });
    }

    return days;
  }, [members, chores, completionSet, config.weekStartDay]);

  // Toggle completion
  const toggleComplete = useCallback(async (choreId: string, memberId: string) => {
    const today = todayStr();
    let snapshot: ChoreCompletion[] = [];

    // Optimistic update — capture snapshot inside updater to avoid dep on completions
    setCompletions((prev) => {
      snapshot = prev;
      const existing = prev.findIndex(
        (c) => c.choreId === choreId && c.memberId === memberId && c.date === today,
      );
      if (existing >= 0) {
        return prev.filter((_, i) => i !== existing);
      }
      return [...prev, { choreId, memberId, date: today, completedAt: new Date().toISOString() }];
    });

    try {
      const reqBody: ChoreToggleRequest = { choreId, memberId, date: today };
      const res = await displayFetch(choresUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      const data: ChoreToggleResponse = await res.json();
      setCompletions(data.completions ?? []);
      // Update rewards from the POST response so ticket balances reflect the
      // new credit/debit instantly — without waiting for the next rewards poll.
      // Also prime the shared cache so sibling module instances (e.g. a
      // dashboard tab that mounts later) don't re-read stale data, and set the
      // override window so a stale in-flight poll can't flash the old balance
      // back until the next poll returns a fresh snapshot.
      if (data.rewards) {
        setRewards(data.rewards);
        displayCache.set(rewardsUrl(), data.rewards, choreChartTtl);
        rewardsOverrideUntil.current = Date.now() + choreChartTtl;
      }
      // Surface server warnings (e.g. balance went negative on un-complete) so they're
      // at least visible in the kiosk console — display modules don't have a UI for
      // these alerts, but the admin viewing dev tools can see them.
      if (data.warning) {
        console.warn('[chores]', data.warning);
      }
    } catch {
      // Revert optimistic update on error
      setCompletions(snapshot);
    }
  }, [choreChartTtl]);

  // Recent redemptions (last 5 minutes) for display toasts
  const recentRedemptions = useMemo(() => {
    const list = rewards?.redemptions;
    if (!list || list.length === 0) return [];
    const cutoff = Date.now() - 5 * 60_000;
    return list.filter((r) => new Date(r.redeemedAt).getTime() >= cutoff);
  }, [rewards]);

  return {
    members,
    chores,
    rewards: rewards?.rewards ?? [],
    todayAssignments,
    completionSet,
    memberStats,
    weekData,
    recentRedemptions,
    isLoading,
    error,
    toggleComplete,
  };
}
