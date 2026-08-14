import type { ScreenConfiguration } from '@/types/config';

/**
 * "Is now a good time for this display to restart its browser?"
 *
 * New shell-layer files on a spoke don't reach the screen until Chromium
 * restarts, and a restart is a visible black flash. The spoke could decide
 * this for itself, but it would be guessing: sleep schedules and live display
 * state live on the hub. So the hub answers and the spoke obeys — which also
 * means the policy can change later without touching a single Pi.
 *
 * The launcher-run update path ignores this entirely; it is by definition
 * already restarting. Only the nightly timer asks.
 */

/** Hours (local, inclusive-exclusive) treated as "nobody is watching". */
export const QUIET_HOUR_START = 2;
export const QUIET_HOUR_END = 5;

export interface RestartAdviceInput {
  /** Live state from the display's heartbeat, if it has one. */
  displayState: 'active' | 'dimmed' | 'asleep' | null | undefined;
  /** Whether a sleep schedule governs this display at all. */
  hasSleepSchedule: boolean;
  now: Date;
  /** IANA timezone the display's schedules are evaluated in. */
  timezone?: string;
}

/**
 * The hour of `now` in `timezone`, 0-23. Falls back to the host's local hour
 * for an absent or unparseable zone — the same forgiving posture the rest of
 * the scheduling code takes, since a bad timezone string should degrade the
 * restart window, not throw inside an API route.
 */
export function hourInTimezone(now: Date, timezone?: string): number {
  if (!timezone) return now.getHours();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(now);
    const raw = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '', 10);
    if (!Number.isFinite(raw)) return now.getHours();
    return raw === 24 ? 0 : raw;
  } catch {
    return now.getHours();
  }
}

export function computeRestartAdvised(input: RestartAdviceInput): boolean {
  // A sleeping display's screen is already dark — a restart there is free.
  if (input.displayState === 'asleep') return true;

  // A display that never sleeps has no free moment, so fall back to the hours
  // when a household display is least likely to be looked at. Displays that
  // DO have a schedule deliberately get no quiet-hours fallback: their own
  // sleep window is the right moment, and taking the fallback as well would
  // restart a display that is awake at 3am precisely because its owner set it
  // up that way (a night-shift kitchen display, say).
  if (!input.hasSleepSchedule) {
    const hour = hourInTimezone(input.now, input.timezone);
    return hour >= QUIET_HOUR_START && hour < QUIET_HOUR_END;
  }

  return false;
}

/**
 * Resolve the two config-derived inputs for one display. Per-display
 * `settings.sleep` is full-replacement (not deep-merged), matching
 * `filterConfigForDisplay`, so a display that defines its own sleep block
 * is read on its own terms rather than layered over the global one.
 *
 * Timezone is global by design: `DisplayNodeSettings` deliberately has no
 * per-display timezone (see the note on that type), so there is exactly one
 * timezone in which any schedule is evaluated.
 */
export function resolveDisplayRestartInputs(
  config: ScreenConfiguration,
  displayId: string,
): { hasSleepSchedule: boolean; timezone?: string } {
  const display = config.displays?.find((d) => d.id === displayId);
  const sleep = display?.settings?.sleep ?? config.settings.sleep;
  const schedule = sleep?.schedule;
  return {
    hasSleepSchedule: Boolean(
      sleep?.enabled && schedule?.startTime && schedule?.endTime,
    ),
    timezone: config.settings.timezone,
  };
}
