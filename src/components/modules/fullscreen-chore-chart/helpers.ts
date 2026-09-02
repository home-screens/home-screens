import { Sunrise, Sun, Sunset, Clock } from 'lucide-react';
import type { ChoreMember, ChoreTimeOfDay } from '@/types/config';
import { sortChores, type ResolvedAssignment } from '@/components/modules/chore-chart/types';

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

export const TOD_ICONS: Record<ChoreTimeOfDay, typeof Sunrise> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  anytime: Clock,
};

export const TOD_ORDER: ChoreTimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];

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

/**
 * The by-person layout: one section per member with a single-dot row per
 * chore. Shared chores are not deduplicated here — "Marshall: dishes" is the
 * whole point — so the row count is the assignment count.
 */
export function buildMemberRows(
  members: ChoreMember[],
  assignments: ResolvedAssignment[],
  showTimeOfDay: boolean,
): Map<string, ChoreRow[]> {
  const rows = new Map<string, ChoreRow[]>();
  for (const member of members) {
    const mine = sortChores(assignments.filter((a) => a.memberId === member.id), showTimeOfDay);
    if (mine.length === 0) continue;
    rows.set(member.id, mine.map((a) => ({
      choreId: a.chore.id,
      choreName: a.chore.name,
      choreEmoji: a.chore.emoji,
      timeOfDay: a.chore.timeOfDay,
      points: a.chore.points,
      assignees: [{ memberId: a.memberId, isCompleted: a.isCompleted }],
    })));
  }
  return rows;
}

/** Chore rows never shrink below this on the standard 1080-wide kiosk (28px names). */
export const ROW_HEIGHT_FLOOR = 56;
/** Tallest row at `medium`; `typographySize` multiplies it. */
export const ROW_HEIGHT_CAP = 120;
/** A time-of-day header band costs this fraction of a row. */
export const HEADER_ROW_UNITS = 0.55;
/** A member header band (avatar, name, fraction) costs this much of a row. */
export const MEMBER_HEADER_ROW_UNITS = 1.1;

export interface FitRowHeightInput {
  /** Height available to the chore list, in px. */
  listHeight: number;
  /** Chore rows to lay out (the tallest column in landscape). */
  chores: number;
  /** Time-of-day header bands to lay out alongside them. */
  headers: number;
  /** Canvas scale: 1 on a 1080-wide panel. */
  k: number;
  /** `typographySize` multiplier; raises the cap, never the floor. */
  typoMul: number;
  /** Row units one header costs; the time-of-day band unless told otherwise. */
  headerUnits?: number;
}

/**
 * The fit rule behind the fullscreen chore board: rows share the list height
 * equally, capped by `typographySize` and floored so a 24-chore day scrolls
 * instead of going unreadable. Everything inside a row (name, icon, dots) is
 * a fraction of this value, so the whole board grows and shrinks together.
 */
export function fitRowHeight({ listHeight, chores, headers, k, typoMul, headerUnits = HEADER_ROW_UNITS }: FitRowHeightInput): number {
  const floor = ROW_HEIGHT_FLOOR * k;
  const cap = ROW_HEIGHT_CAP * k * typoMul;
  const units = chores + headerUnits * headers;
  if (units <= 0 || listHeight <= 0) return cap;
  return Math.max(floor, Math.min(cap, listHeight / units));
}
