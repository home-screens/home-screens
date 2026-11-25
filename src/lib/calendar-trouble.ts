import type { CalendarSourceStatus } from '@/types/config';

/** Per-source `messageKey` the calendar route emits for a missing or expired Google sign-in. */
export const GOOGLE_NOT_SIGNED_IN_KEY = 'googleNotSignedIn';

/** True when every failing source is one that needs Google signed in again. */
export function needsGoogleSignIn(failing: readonly CalendarSourceStatus[]): boolean {
  return failing.length > 0 && failing.every((s) => s.messageKey === GOOGLE_NOT_SIGNED_IN_KEY);
}

/**
 * What is wrong with the calendars, for a surface that lists events without
 * the wall's own badges (the phone's Calendar tab): nothing, Google needing a
 * new sign-in, or calendars that stopped updating (`name` when it is one
 * calendar with a name to give). The route answers with an empty list for a
 * calendar it could not read, so without this a stopped calendar reads as a
 * free week.
 */
export type CalendarTrouble =
  | { kind: 'signIn' }
  | { kind: 'failing'; name: string | null };

export function calendarTrouble(sourceStatus: readonly CalendarSourceStatus[] | null | undefined): CalendarTrouble | null {
  const failing = (sourceStatus ?? []).filter((s) => !s.ok);
  if (failing.length === 0) return null;
  if (needsGoogleSignIn(failing)) return { kind: 'signIn' };
  const solo = failing.length === 1 && failing[0].id !== 'holidays' ? failing[0].name ?? null : null;
  return { kind: 'failing', name: solo };
}
