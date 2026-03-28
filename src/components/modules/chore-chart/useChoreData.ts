'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ChoreChartConfig, ChoreCompletion } from '@/types/config';
import { useFetchData } from '@/hooks/useFetchData';
import {
  type ResolvedAssignment,
  type MemberStats,
  type WeekDayData,
  DAY_NAMES_SHORT,
  localDateStr,
  todayStr,
  dateNDaysAgo,
  resolveAssignee,
  choreAppliesToday,
  completionKey,
} from './types';

interface ChoresResponse {
  completions: ChoreCompletion[];
}

interface ChoreDataState {
  todayAssignments: ResolvedAssignment[];
  completionSet: Set<string>;
  memberStats: Map<string, MemberStats>;
  weekData: WeekDayData[];
  isLoading: boolean;
  error: string | null;
  toggleComplete: (choreId: string, memberId: string) => Promise<void>;
}

export function useChoreData(config: ChoreChartConfig): ChoreDataState {
  const [fetched, fetchError] = useFetchData<ChoresResponse>('/api/chores', 30_000);
  const [completions, setCompletions] = useState<ChoreCompletion[]>([]);
  const configRef = useRef(config);
  configRef.current = config;

  // Sync fetched data → local state (polls and initial load)
  useEffect(() => {
    if (fetched) setCompletions(fetched.completions ?? []);
  }, [fetched]);

  const isLoading = !fetched && !fetchError;
  const error = fetchError;

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

    for (const chore of config.chores) {
      if (!choreAppliesToday(chore, dayOfWeek, today)) continue;
      const assignees = resolveAssignee(chore, today);
      for (const memberId of assignees) {
        if (!config.members.some((m) => m.id === memberId)) continue;
        assignments.push({
          chore,
          memberId,
          isCompleted: completionSet.has(completionKey(chore.id, memberId, today)),
        });
      }
    }

    return assignments;
  }, [config.chores, config.members, completionSet]);

  // Per-member stats (streaks computed client-side with config context)
  const memberStats = useMemo(() => {
    const stats = new Map<string, MemberStats>();
    const today = todayStr();

    for (const member of config.members) {
      const myAssignments = todayAssignments.filter((a) => a.memberId === member.id);
      const completed = myAssignments.filter((a) => a.isCompleted).length;
      const total = myAssignments.length;

      // Weekly points — only count chores actually assigned to this member
      let weeklyPoints = 0;
      for (let i = 0; i < 7; i++) {
        const date = dateNDaysAgo(i);
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayOfWeek = d.getDay();
        for (const chore of config.chores) {
          if (!choreAppliesToday(chore, dayOfWeek, date)) continue;
          if (!resolveAssignee(chore, date).includes(member.id)) continue;
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
        const assignedChores = config.chores.filter((c) => {
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
      const todayAssigned = config.chores.filter((c) => {
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
      });
    }

    return stats;
  }, [config.members, config.chores, todayAssignments, completionSet]);

  // Week data for star chart
  const weekData = useMemo(() => {
    const days: WeekDayData[] = [];
    const today = todayStr();

    for (let i = 6; i >= 0; i--) {
      const date = dateNDaysAgo(i);
      const d = new Date(date + 'T00:00:00');
      const dayOfWeek = d.getDay();

      const memberStars: Record<string, boolean> = {};

      for (const member of config.members) {
        // A star is earned when ALL assigned chores for that day are completed
        const dayChores = config.chores.filter((c) => choreAppliesToday(c, dayOfWeek, date));
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
  }, [config.members, config.chores, completionSet]);

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
    todayAssignments,
    completionSet,
    memberStats,
    weekData,
    isLoading,
    error,
    toggleComplete,
  };
}
