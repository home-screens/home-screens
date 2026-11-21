import type { AlertType } from '@/types/config';

/**
 * How long an alert stays up when nobody said: one rule for the wall, which
 * applies it to an alert that arrives with no duration (Home Assistant, the
 * API), and for the phone's Send alert sheet, which starts on it.
 */

/** Per-type lengths in ms, used while the household's own default is 0. Urgent stays until dismissed. */
export const ALERT_TYPE_DEFAULT_MS: Record<AlertType, number> = {
  info: 10_000,
  warning: 30_000,
  urgent: 0, // 0 = stays until dismissed
};

/**
 * The length of an alert of `type` sent with no duration. `configDefaultMs`
 * is the household's "Default duration" (`AlertSettings.defaultDuration`);
 * 0 or unset means each type keeps its own length.
 */
export function defaultAlertDurationMs(type: AlertType, configDefaultMs: number | undefined): number {
  return configDefaultMs && configDefaultMs > 0 ? configDefaultMs : ALERT_TYPE_DEFAULT_MS[type];
}

/** The lengths the phone's Send alert sheet offers, in the order of its chips. 0 stays until dismissed. */
export const ALERT_DURATION_CHOICES_MS = [10_000, 30_000, 60_000, 300_000, 0] as const;

/**
 * The offered length closest to `ms`, for a default the chips do not hold
 * (the setting is any number of seconds, the chips are five). 0 is its own
 * choice; halfway between two goes to the longer, so an alert is not cut
 * short of what the household asked for.
 */
export function nearestAlertDurationChoice(ms: number): number {
  if (ms <= 0) return 0;
  let best = 0;
  for (const choice of ALERT_DURATION_CHOICES_MS) {
    if (choice === 0) continue;
    if (best === 0 || Math.abs(choice - ms) <= Math.abs(best - ms)) best = choice;
  }
  return best;
}
