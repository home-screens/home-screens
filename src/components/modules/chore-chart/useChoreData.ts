'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ChoreMember, ChoreDefinition, ChoreCompletion } from '@/types/config';
import { useFetchData } from '@/hooks/useFetchData';
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

interface ChoreDataState {
  members: ChoreMember[];
  chores: ChoreDefinition[];
  todayAssignments: ResolvedAssignment[];
  completionSet: Set<string>;
  memberStats: Map<string, MemberStats>;
  weekData: WeekDayData[];
  isLoading: boolean;
  error: string | null;
  toggleComplete: (choreId: string, memberId: string) => Promise<void>;
}

/** Return the 7 dates (as YYYY-MM-DD) for the current week, starting from
 *  the configured week start day. If today is before the week start day
 *  has rolled around, the week includes future dates up to the end of the week. */
function getWeekDates(weekStartDay: 'sunday' | 'monday'): string[] {
  const startDow = weekStartDay === 'monday' ? 1 : 0;
  const now = new Date();
  const todayDow = now.getDay();
  // How many days back to the start of this week?
  const daysBack = (todayDow - startDow + 7) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - daysBack);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(localDateStr(d));
  }
  return dates;
}

export function useChoreData(config: ChoreDataConfig): ChoreDataState {
  const [fetchedCompletions, completionsError] = useFetchData<ChoresResponse>('/api/chores', 30_000);
  const [fetchedChoreData] = useFetchData<ChoreDataResponse>('/api/chores/data', 60_000);
  const [completions, setCompletions] = useState<ChoreCompletion[]>([]);

  // Members and chores from shared data file
  const members = useMemo(() => fetchedChoreData?.members ?? [], [fetchedChoreData]);
  const chores = useMemo(() => fetchedChoreData?.chores ?? [], [fetchedChoreData]);

  // Sync fetched data → local state (polls and initial load)
  useEffect(() => {
    if (fetchedCompletions) setCompletions(fetchedCompletions.completions ?? []);
  }, [fetchedCompletions]);

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
      const weekDates = getWeekDates(config.weekStartDay);
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
      });
    }

    return stats;
  }, [members, chores, todayAssignments, completionSet, config.weekStartDay]);

  // Week data for star chart — aligned to configured week start day
  const weekData = useMemo(() => {
    const days: WeekDayData[] = [];
    const today = todayStr();
    const weekDates = getWeekDates(config.weekStartDay);

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
      const res = await fetch('/api/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choreId, memberId, date: today }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      const data = await res.json();
      setCompletions(data.completions ?? []);
    } catch {
      // Revert optimistic update on error
      setCompletions(snapshot);
    }
  }, []);

  return {
    members,
    chores,
    todayAssignments,
    completionSet,
    memberStats,
    weekData,
    isLoading,
    error,
    toggleComplete,
  };
}
