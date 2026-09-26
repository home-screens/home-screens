/**
 * The wall's heartbeat: one request to the hub every 3 s (the command drain in
 * `useDisplayCommands`) whose answer also says whether anything else a wall
 * shows has changed. Each wall-side reader keeps the revision it last applied
 * and fetches its data only when the heartbeat names a different one, so an
 * idle wall makes one request per beat instead of one per reader.
 *
 * Every field is optional: the hub omits one it could not work out (an
 * unreadable config, say), and a reader does nothing for a field it was not
 * given. A refused heartbeat, or one answered by a hub from before revisions
 * (after a rollback), publishes `buildId` alone, from the public build-id
 * endpoint.
 */
export interface DisplayRevisions {
  /** The running build. A wall that sees it change reloads. */
  buildId?: string;
  /** The installed plugin list, settings included (`/api/plugins/installed`). */
  plugins?: string;
  /** The ETag a wall's `/api/config?display=` read would be answered with. */
  config?: string;
  /** The stored timer session (`/api/timers/session`). */
  timer?: string;
  /** The ETag `GET /api/chores` would be answered with, whatever its `?days=`. */
  chores?: string;
  /** The ETag `GET /api/rewards` would be answered with. */
  rewards?: string;
}

type Listener = (revisions: DisplayRevisions) => void;

// Module-level like the shared-state and timer-presence stores: the beat is
// taken in useDisplayControl, and its readers (useLiveConfig, TimerOverlay)
// are mounted elsewhere in the same display page.
const listeners = new Set<Listener>();

/**
 * Data reads the heartbeat reports on, by path: `useFetchData` and the
 * display cache fetch these when the beat names a new revision instead of on
 * their polling interval. The revision the heartbeat names for each is
 * exactly the ETag the read answers with (`answerRevision` relies on it). The
 * query is not part of the key, because the hub gives every `?days=` of the
 * chore history one revision.
 */
const FOLLOWED_READS: Record<string, 'chores' | 'rewards'> = {
  '/api/chores': 'chores',
  '/api/rewards': 'rewards',
};

/**
 * How long a beat is trusted: three missed 3 s beats. After that (a beat that
 * hangs, a hub that stopped answering) reads go back to their own interval,
 * so a stuck heartbeat never freezes the data on screen.
 */
const FOLLOW_MS = 10_000;

let latest: { revisions: DisplayRevisions; at: number } | null = null;

/** Hand one beat's revisions to every reader. Called on every beat, changed or not. */
export function publishRevisions(revisions: DisplayRevisions): void {
  // Before the listeners run, so a fetch one of them starts records this beat.
  latest = { revisions, at: Date.now() };
  for (const listener of listeners) listener(revisions);
}

/** Listen for beats. Returns the unsubscribe. */
export function subscribeRevisions(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The revision the latest beat names for a data read, or undefined when the
 * read is not one the heartbeat reports on, no recent beat named it, or this
 * page takes no heartbeat at all (the editor, the phone). Undefined means the
 * read keeps its own polling interval.
 */
export function followedRevision(url: string): string | undefined {
  const field = FOLLOWED_READS[url.split('?')[0]];
  if (!field || !latest || Date.now() - latest.at > FOLLOW_MS) return undefined;
  return latest.revisions[field];
}

export function __resetHeartbeatForTests(): void {
  latest = null;
}
