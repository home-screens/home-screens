/**
 * Shared wall-clock tickers, one per cadence, each aligned to the boundary.
 *
 * A clock that started a 60 s interval at hh:mm:40 showed the previous
 * minute for 40 seconds of every minute, and a screen full of modules ran a
 * dozen such intervals at a dozen phases. Here every subscriber of a period
 * shares one `setTimeout` chain aimed `TICK_SLACK_MS` past the next multiple
 * of that period on the wall clock, recomputed on every tick, so the minute
 * changes on the wall the moment it changes on the clock, every minute
 * subscriber updates in one render batch, and a clock step or a late timer
 * (a throttled tab, an NTP jump) corrects itself on the next tick.
 *
 * The hooks in `useTZClock` are the subscribers; nothing else needs this
 * directly.
 */

type Listener = () => void;

interface Cadence {
  listeners: Set<Listener>;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Aimed this far past the boundary so a tick never reads the old minute. */
export const TICK_SLACK_MS = 5;

const cadences = new Map<number, Cadence>();

/** Milliseconds from `now` to just past the next multiple of `periodMs` on the wall clock. */
export function msUntilNextTick(periodMs: number, now: number = Date.now()): number {
  return periodMs - (now % periodMs) + TICK_SLACK_MS;
}

function arm(periodMs: number, cadence: Cadence): void {
  cadence.timer = setTimeout(() => {
    cadence.timer = null;
    if (cadence.listeners.size === 0) {
      cadences.delete(periodMs);
      return;
    }
    // Re-aimed from the actual time, not the planned one: a late tick lands
    // this one past the boundary and the next on the following boundary.
    arm(periodMs, cadence);
    for (const listener of [...cadence.listeners]) listener();
  }, msUntilNextTick(periodMs));
}

/**
 * Call `listener` just past every multiple of `periodMs` on the wall clock
 * until the returned function is called. Subscribers of the same period
 * share one timer.
 */
export function subscribeAlignedTick(periodMs: number, listener: Listener): () => void {
  let cadence = cadences.get(periodMs);
  if (!cadence) {
    cadence = { listeners: new Set(), timer: null };
    cadences.set(periodMs, cadence);
    arm(periodMs, cadence);
  }
  cadence.listeners.add(listener);
  return () => {
    cadence.listeners.delete(listener);
    if (cadence.listeners.size === 0) {
      if (cadence.timer) clearTimeout(cadence.timer);
      cadence.timer = null;
      cadences.delete(periodMs);
    }
  };
}

/** How many cadences currently have a timer armed (for tests). */
export function armedCadenceCount(): number {
  return cadences.size;
}
