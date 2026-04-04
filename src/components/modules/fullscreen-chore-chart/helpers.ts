import { Sunrise, Sun, Sunset, Clock } from 'lucide-react';
import type { ChoreTimeOfDay } from '@/types/config';
import type { ResolvedAssignment } from '@/components/modules/chore-chart/types';

// ─── Types ───

export interface ChoreRow {
  choreId: string;
  choreName: string;
  choreEmoji: string;
  timeOfDay: ChoreTimeOfDay;
  points: number;
  assignees: { memberId: string; isCompleted: boolean }[];
}

export interface ToggleParams {
  choreId: string;
  memberId: string;
  choreName: string;
  memberName: string;
  memberColor: string;
  wasCompleted: boolean;
}

// ─── Constants ───

export const TOD_ICONS: Record<ChoreTimeOfDay, typeof Sunrise> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  anytime: Clock,
};

export const TOD_ORDER: ChoreTimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];

// ─── Helpers ───

export function getOrientation(w: number, h: number): 'portrait' | 'landscape' {
  return h > w ? 'portrait' : 'landscape';
}

/** Compute shortest unique initial for each member. Uses first letter when
 *  unique; extends to 2–3 characters only where collisions exist. */
export function getUniqueInitials(memberList: { id: string; name: string }[]): Map<string, string> {
  const result = new Map<string, string>();
  let remaining = [...memberList];

  for (let len = 1; len <= 3 && remaining.length > 0; len++) {
    const groups = new Map<string, typeof remaining>();
    for (const m of remaining) {
      const prefix = m.name.slice(0, len);
      const group = groups.get(prefix) ?? [];
      group.push(m);
      groups.set(prefix, group);
    }

    const next: typeof remaining = [];
    for (const [prefix, group] of groups) {
      if (group.length === 1) {
        result.set(group[0].id, prefix);
      } else {
        next.push(...group);
      }
    }
    remaining = next;
  }
  for (const m of remaining) {
    result.set(m.id, m.name.slice(0, 3));
  }
  return result;
}

export function getCurrentTimeOfDay(hour: number): ChoreTimeOfDay | null {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 24) return 'evening';
  return null;
}

/** Group today's assignments by time-of-day, then deduplicate chores
 *  (a chore assigned to 3 people becomes one row with 3 assignee dots). */
export function buildChoreRows(assignments: ResolvedAssignment[]): Map<ChoreTimeOfDay, ChoreRow[]> {
  const choreMap = new Map<string, ChoreRow>();

  for (const a of assignments) {
    const existing = choreMap.get(a.chore.id);
    if (existing) {
      existing.assignees.push({ memberId: a.memberId, isCompleted: a.isCompleted });
    } else {
      choreMap.set(a.chore.id, {
        choreId: a.chore.id,
        choreName: a.chore.name,
        choreEmoji: a.chore.emoji,
        timeOfDay: a.chore.timeOfDay,
        points: a.chore.points,
        assignees: [{ memberId: a.memberId, isCompleted: a.isCompleted }],
      });
    }
  }

  const groups = new Map<ChoreTimeOfDay, ChoreRow[]>();
  for (const row of choreMap.values()) {
    const existing = groups.get(row.timeOfDay) ?? [];
    row.assignees.sort((a, b) => (a.isCompleted === b.isCompleted ? 0 : a.isCompleted ? -1 : 1));
    existing.push(row);
    groups.set(row.timeOfDay, existing);
  }
  return groups;
}
