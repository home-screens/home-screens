/**
 * Who may show the wall on a hub with a password, without a grown-up
 * letting them in by hand. One rule, read by the wall's heartbeat and by
 * `POST /api/display/claim`, so the two can never disagree.
 *
 * The display key used to be written into every `/display` page, which
 * handed it to any browser on the network. A wall now holds its own cookie
 * instead (`display-walls.ts`), and this decides who is given one.
 *
 * Pure: every fact is worked out by the caller.
 */

/** How a wall came to be let in. Kept on its entry; parents never see the raw value. */
export type WallAdmission =
  /** No password is set, so every browser may show the wall. */
  | 'no-password'
  /** A page from before the update, still holding the display key. */
  | 'old-key'
  /** The screen plugged into the hub itself. */
  | 'hub-screen'
  /** A device on a network the household let displays in from. */
  | 'allowed-network'
  /** Let in by itself in the days after the update. */
  | 'window'
  /** A grown-up clicked Let in. */
  | 'let-in'
  /** It asked under a new display name, and a grown-up then added that display. */
  | 'added'
  /** A signed-in grown-up chose to keep this browser as a wall. */
  | 'kept';

/** How long after the update a wall that missed the changeover is still let in by itself. */
export const CHANGEOVER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How many walls per display the changeover lets in by itself. A home with
 * a Pi and a tablet on one display moves over with no click; it is not a
 * door left open for every phone in the house.
 */
export const WINDOW_WALLS_PER_DISPLAY = 6;

export interface AdmissionFacts {
  /** A password is set. Without one every browser is let in. */
  passwordSet: boolean;
  /** The request carried the display key. */
  holdsKey: boolean;
  /** The request came from the hub itself, with no forwarding header. */
  hubOwnScreen: boolean;
  /** The caller is on an Allowed network and that switch lets displays in. */
  allowedNetwork: boolean;
  /** The changeover window has started and not yet run out. */
  windowOpen: boolean;
  /** The display asked for is one the hub knows (or the only one it has). */
  displayAdopted: boolean;
  /** How many walls the window has already let in for that display. */
  windowAdmissions: number;
}

/** Whether `now` falls inside the changeover window that began at `startedAt`. */
export function isWindowOpen(startedAt: number | null | undefined, now: number): boolean {
  return typeof startedAt === 'number' && now >= startedAt && now - startedAt < CHANGEOVER_WINDOW_MS;
}

/**
 * The reason this caller is let in with no click, or null when it has to
 * wait for a grown-up. Order matters: the first match is what the entry
 * remembers.
 *
 * A signed-in browser is deliberately not here. It shows the wall on its
 * sign-in alone and gets no cookie, so a grown-up looking at `/display`, or
 * the editor's preview, never becomes a wall. "Holds the key" comes before
 * anything else on a password hub so a tablet wall that also happens to be
 * signed in is moved over like every other wall, and does not go dark weeks
 * later when its sign-in runs out.
 */
export function admitWithoutAsking(facts: AdmissionFacts): WallAdmission | null {
  if (!facts.passwordSet) return 'no-password';
  if (facts.holdsKey && facts.windowOpen) return 'old-key';
  if (facts.hubOwnScreen) return 'hub-screen';
  if (facts.allowedNetwork) return 'allowed-network';
  if (facts.windowOpen && facts.displayAdopted && facts.windowAdmissions < WINDOW_WALLS_PER_DISPLAY) return 'window';
  return null;
}
