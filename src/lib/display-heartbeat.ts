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
}

type Listener = (revisions: DisplayRevisions) => void;

// Module-level like the shared-state and timer-presence stores: the beat is
// taken in useDisplayControl, and its readers (useLiveConfig, TimerOverlay)
// are mounted elsewhere in the same display page.
const listeners = new Set<Listener>();

/** Hand one beat's revisions to every reader. Called on every beat, changed or not. */
export function publishRevisions(revisions: DisplayRevisions): void {
  for (const listener of listeners) listener(revisions);
}

/** Listen for beats. Returns the unsubscribe. */
export function subscribeRevisions(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
