/**
 * Which Google Cloud project a saved sign-in came from, and whether
 * disconnecting it may ask Google to cancel it.
 *
 * Google keeps one sign-in per person per project, not per client: consent
 * given to any client in a project counts for the whole project, and
 * cancelling any of its tokens cancels every token under it. Home Screens'
 * Calendar and Photos clients share one project, and a household's own app
 * usually puts both in one project too (the docs say so). Cancelling the
 * Photos sign-in at Google therefore signed Google Calendar out as well, and
 * the other way round.
 */

/** The project a Google client id belongs to: the number before its first `-`. Null when it isn't one. */
export function googleProjectOf(clientId: string | null | undefined): string | null {
  const match = /^(\d+)-/.exec(clientId?.trim() ?? '');
  return match ? match[1] : null;
}

/**
 * Whether disconnecting a sign-in may also ask Google to cancel it: only when
 * no other sign-in saved on the hub may come from the same project. A project
 * that can't be told counts as the same one, because cancelling a sign-in
 * that is still in use is the mistake that matters; leaving one listed in the
 * person's Google account until the last disconnect is the safe side.
 *
 * `mine` and `others` are project numbers, or null when unknown; a service
 * with nothing saved is left out of `others`.
 */
export function mayCancelAtGoogle(mine: string | null, others: readonly (string | null)[]): boolean {
  return others.every((other) => mine !== null && other !== null && other !== mine);
}
