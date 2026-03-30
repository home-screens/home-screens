import type {
  ChoreDefinition,
  ChoreTimeOfDay,
} from '@/types/config';

// ── Resolved assignment (chore + who's assigned today) ────────────

export interface ResolvedAssignment {
  chore: ChoreDefinition;
  memberId: string;
  isCompleted: boolean;
}

export interface MemberStats {
  total: number;
  completed: number;
  percentage: number;
  streak: number;
  weeklyPoints: number;
  weeklyPointsTotal: number;
}

export interface WeekDayData {
  date: string;
  dayName: string;
  dayIndex: number;
  isToday: boolean;
  memberStars: Record<string, boolean>; // memberId → earned star
}

// ── Constants ──────────────────────────────────────────────────────

export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const TIME_OF_DAY_META: Record<ChoreTimeOfDay, { label: string; icon: string; order: number }> = {
  morning:   { label: 'Morning',   icon: '\u2600\ufe0f', order: 0 },
  afternoon: { label: 'Afternoon', icon: '\u26c5\ufe0f', order: 1 },
  evening:   { label: 'Evening',   icon: '\ud83c\udf19',  order: 2 },
  anytime:   { label: 'Anytime',   icon: '\ud83d\udd50',  order: 3 },
};

export const MEMBER_COLORS = [
  '#f472b6', '#60a5fa', '#4ade80', '#fbbf24', '#a78bfa',
  '#fb923c', '#22d3ee', '#f87171', '#34d399', '#e879f9',
];

// ── Utility functions ──────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD in local time (avoids UTC drift from toISOString) */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse YYYY-MM-DD to UTC millis (DST-safe for day arithmetic) */
function dateToUTC(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

const EPOCH_UTC = Date.UTC(2024, 0, 1);
const MS_PER_DAY = 86_400_000;

export function getOrderedDays(weekStartDay: 'sunday' | 'monday'): number[] {
  if (weekStartDay === 'monday') return [1, 2, 3, 4, 5, 6, 0];
  return [0, 1, 2, 3, 4, 5, 6];
}

/** Get today's date as YYYY-MM-DD in local time */
export function todayStr(): string {
  return localDateStr(new Date());
}

/** Get date string for N days ago in local time */
export function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
}

/** Resolve rotation — which member is assigned a chore on a given date */
export function resolveAssignee(
  chore: ChoreDefinition,
  date: string,
): string[] {
  if (chore.rotation === 'fixed' || chore.assigneeIds.length <= 1) {
    return chore.assigneeIds;
  }

  const diffMs = dateToUTC(date) - EPOCH_UTC;

  if (chore.rotation === 'rotate-daily') {
    const daysSinceEpoch = Math.round(diffMs / MS_PER_DAY);
    const idx = daysSinceEpoch % chore.assigneeIds.length;
    return [chore.assigneeIds[idx]];
  }

  if (chore.rotation === 'rotate-weekly') {
    const weeksSinceEpoch = Math.round(diffMs / (MS_PER_DAY * 7));
    const idx = weeksSinceEpoch % chore.assigneeIds.length;
    return [chore.assigneeIds[idx]];
  }

  return chore.assigneeIds;
}

/** Check if a chore applies on a given day.
 *  For biweekly chores, `date` (YYYY-MM-DD) is needed to determine odd/even week. */
export function choreAppliesToday(chore: ChoreDefinition, dayOfWeek: number, date?: string): boolean {
  if (chore.daysOfWeek.length > 0 && !chore.daysOfWeek.includes(dayOfWeek)) {
    return false;
  }
  if (chore.frequency === 'biweekly' && date) {
    const weekNum = Math.round((dateToUTC(date) - EPOCH_UTC) / (7 * MS_PER_DAY));
    return weekNum % 2 === 0; // applies on even weeks from epoch
  }
  return true;
}

/** Sort chores by time of day order, then incomplete first */
export function sortChores(
  assignments: ResolvedAssignment[],
  showTimeOfDay: boolean,
): ResolvedAssignment[] {
  return [...assignments].sort((a, b) => {
    // Incomplete first
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    // By time of day
    if (showTimeOfDay) {
      const orderA = TIME_OF_DAY_META[a.chore.timeOfDay].order;
      const orderB = TIME_OF_DAY_META[b.chore.timeOfDay].order;
      if (orderA !== orderB) return orderA - orderB;
    }
    return 0;
  });
}

/** Get the current time-of-day section */
export function getCurrentTimeOfDay(hour: number): ChoreTimeOfDay {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** Build a completion lookup key */
export function completionKey(choreId: string, memberId: string, date: string): string {
  return `${choreId}-${memberId}-${date}`;
}
