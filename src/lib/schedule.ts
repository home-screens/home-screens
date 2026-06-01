import type { ModuleInstance, ModuleSchedule, Profile, Screen } from '@/types/config';

/**
 * Returns false only when the module has been explicitly disabled
 * (`enabled === false`). Undefined / true both mean "enabled".
 * Mirrors the `Screen.enabled` convention used by ScreenRotator and the remote view.
 */
export function isModuleEnabled(mod: Pick<ModuleInstance, 'enabled'>): boolean {
  return mod.enabled !== false;
}

/**
 * Determine whether a module should be visible right now based on its schedule.
 * Returns true if the module has no schedule (always visible).
 */
export function isModuleVisible(schedule: ModuleSchedule | undefined, now: Date): boolean {
  if (!schedule) return true;

  const { daysOfWeek, startTime, endTime, invert } = schedule;

  const start = parseTime(startTime) ?? 0;
  const end = parseTime(endTime) ?? 24 * 60;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // For overnight windows (e.g. 22:00–06:00), the post-midnight portion
  // (00:00–06:00) logically belongs to the previous day's schedule.
  // Use yesterday's day-of-week in that case.
  const isOvernight = start > end;
  const isPostMidnight = isOvernight && nowMinutes < end;
  const relevantDay = isPostMidnight ? (now.getDay() + 6) % 7 : now.getDay();

  const dayMatch = !daysOfWeek || daysOfWeek.length === 0 || daysOfWeek.includes(relevantDay);
  const timeMatch = isInTimeWindow(start, end, nowMinutes);

  const inWindow = dayMatch && timeMatch;
  return invert ? !inWindow : inWindow;
}

function isInTimeWindow(start: number, end: number, nowMinutes: number): boolean {
  if (start === 0 && end === 24 * 60) return true;

  if (start <= end) {
    // Normal window: e.g., 06:00–09:00
    return nowMinutes >= start && nowMinutes < end;
  } else {
    // Overnight window: e.g., 22:00–06:00 (wraps past midnight)
    return nowMinutes >= start || nowMinutes < end;
  }
}

function parseTime(time: string | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Resolve which screens should be displayed based on profiles.
 * - If a profile with a matching schedule exists, use its screens.
 * - Otherwise fall back to the manually set activeProfile.
 * - If no profile matches, return all screens (backward compatible).
 */
export function resolveProfileScreens(
  allScreens: Screen[],
  profiles: Profile[] | undefined,
  activeProfileId: string | undefined,
  now: Date,
): Screen[] {
  if (!profiles || profiles.length === 0) return allScreens;

  // Check scheduled profiles first (first match wins, skip if no valid screens)
  for (const profile of profiles) {
    if (profile.schedule && isModuleVisible(profile.schedule, now)) {
      const filtered = filterScreens(allScreens, profile.screenIds);
      if (filtered.length > 0) return filtered;
      // Schedule matched but all screens are stale — fall through to next
    }
  }

  // Fall back to manually set active profile
  if (activeProfileId) {
    const active = profiles.find((p) => p.id === activeProfileId);
    if (active) {
      const filtered = filterScreens(allScreens, active.screenIds);
      if (filtered.length > 0) return filtered;
    }
  }

  // No profile produced valid screens — show all
  return allScreens;
}

function filterScreens(allScreens: Screen[], screenIds: string[]): Screen[] {
  const screenMap = new Map(allScreens.map((s) => [s.id, s]));
  return screenIds.map((id) => screenMap.get(id)).filter((s): s is Screen => !!s);
}
