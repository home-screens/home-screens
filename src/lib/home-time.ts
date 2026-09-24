/**
 * When a screen that works in home time should say so.
 *
 * Every time a parent types or reads in the editor and on the phone is the
 * household's: schedules, sleep, "today", the lit part of the chore day. A
 * parent on a trip, or on a laptop still set to another zone, sees those times
 * disagree with their own clock, which reads like a bug unless something says
 * which clock is meant. These are the rules for when that line shows.
 */
import { sameTimezone, wallClockParts } from '@/lib/timezone';

/**
 * Is the person looking at the editor in a different zone from home? Times
 * they type there are home time, so the editor says so only when that is not
 * also their own time. Either zone unknown (not rendered in a browser yet, or
 * the config still loading) is "no".
 */
export function viewerAwayFromHome(
  viewerZone: string | null | undefined,
  homeZone: string | null | undefined,
): boolean {
  return !!viewerZone && !!homeZone && !sameTimezone(viewerZone, homeZone);
}

/**
 * Does the phone's own clock read a different day or hour from home at
 * `instant`? The phone shows home's day and lights home's part of the day, so
 * that is when a parent needs telling what time it is there. While both clocks
 * read the same day and hour (a zone half an hour off, for half of every hour)
 * nothing looks wrong, so nothing is said.
 */
export function phoneClockDiffersFromHome(
  instant: Date,
  viewerZone: string | null | undefined,
  homeZone: string | null | undefined,
): boolean {
  if (!viewerAwayFromHome(viewerZone, homeZone)) return false;
  const phone = wallClockParts(instant, viewerZone!);
  const home = wallClockParts(instant, homeZone!);
  return phone.isoDate !== home.isoDate || Math.floor(phone.minuteOfDay / 60) !== Math.floor(home.minuteOfDay / 60);
}
