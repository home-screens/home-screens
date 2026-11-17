import type { ArtMode, EveningLight, Screen } from '@/types/config';

/**
 * The two things a screen does by the clock for its picture: evening light
 * (the background warms and dims) and art mode (the modules step aside).
 * Pure rules, read by the wall and written by the editor.
 */

export const EVENING_LIGHT_DEFAULT: EveningLight = { from: 'sunset', until: '07:00' };
export const ART_MODE_HOURS_DEFAULT: Required<ArtMode> = { from: '21:00', until: '07:00' };
/** Where evening starts when "sunset" is asked for and the household has no location. */
const SUNSET_FALLBACK_MINUTE = 20 * 60;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isClockTime = (value: unknown): value is string => typeof value === 'string' && TIME.test(value);
/** Minutes after midnight for `HH:MM`, or null. */
export function minuteOf(time: string | undefined): number | null {
  const match = TIME.exec(time ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Whether `minute` falls in the daily stretch from `from` up to `until`; a stretch that ends before it starts runs past midnight. */
export function inDailyHours(minute: number, from: number, until: number): boolean {
  if (from === until) return true;
  return from < until ? minute >= from && minute < until : minute >= from || minute < until;
}

/** A saved evening light setting as the wall can use it, or undefined for one it cannot. */
export function normalizeEveningLight(value: unknown): EveningLight | undefined {
  const v = value as EveningLight | null;
  if (!v || typeof v !== 'object' || !isClockTime(v.until) || !(v.from === 'sunset' || isClockTime(v.from))) return undefined;
  return { from: v.from, until: v.until };
}

/**
 * Whether the background is in its evening light now. `sunsetMinute` is
 * today's sunset in the display's own time, or null when it is not known.
 */
export function eveningLightActive(screen: Pick<Screen, 'eveningLight'>, minuteOfDay: number, sunsetMinute: number | null): boolean {
  const light = normalizeEveningLight(screen.eveningLight);
  if (!light) return false;
  const from = light.from === 'sunset' ? Math.round(sunsetMinute ?? SUNSET_FALLBACK_MINUTE) : minuteOf(light.from)!;
  return inDailyHours(minuteOfDay, from, minuteOf(light.until)!);
}

/** Whether the screen is showing only its picture now. */
export function artModeActive(screen: Pick<Screen, 'artMode'>, minuteOfDay: number): boolean {
  const mode = screen.artMode;
  if (!mode || typeof mode !== 'object') return false;
  const from = minuteOf(mode.from);
  const until = minuteOf(mode.until);
  // Hours need both ends; with neither (or a half-written pair) art mode is simply on.
  return from === null || until === null ? true : inDailyHours(minuteOfDay, from, until);
}
