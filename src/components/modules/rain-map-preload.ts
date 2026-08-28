/**
 * Rate-bounded radar tile store.
 *
 * All radar tile network flows through this store — the rendered <img> tags
 * only ever point at cached object URLs. Three rules keep a weeks-long kiosk
 * mount inside RainViewer's limits (500 requests/min per IP with a 300/min
 * burst; one animation window is 13+ frames x 25 tiles = 325+ requests, more
 * than both):
 * - A single issuance queue spaces dispatches >= spacingMs apart, so the
 *   request rate is bounded no matter how fast the animation cycles or how
 *   many frames it sweeps.
 * - A failed tile enters a cooldown and is not re-requested until it lapses.
 *   Retrying 429s at animation tempo just feeds the rate limiter (rejected
 *   requests still consume the window), and 429 responses are never cacheable,
 *   so every animation-tempo retry is real network — the storm that got this
 *   module rate-limited in the first place.
 * - Successes are cached as object URLs, so cycling frames and remounting
 *   screens (rotation) render for free; `prune` revokes URLs outside the
 *   current window so the store stays bounded (frame paths are timestamped
 *   and would otherwise accumulate forever).
 *
 * Everything with a side effect is injectable so the store is unit-testable
 * without a DOM or network.
 */

export interface TileStore {
  /** Subscribe to tile loads/prunes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Monotonic change counter for useSyncExternalStore snapshots. */
  getVersion(): number;
  /** Object URL for a loaded tile, or null. Never triggers network. */
  get(url: string): string | null;
  /**
   * Queue any of these URLs that are missing; resolves when every URL has
   * settled (loaded, failed, or already covered by an active cooldown).
   * Never rejects.
   */
  ensure(urls: string[]): Promise<void>;
  /** Revoke + drop entries outside `validUrls` so the store stays bounded. */
  prune(validUrls: ReadonlySet<string>): void;
  /**
   * Register a consumer's animation window; returns a release function. The
   * store prunes to the UNION of all live windows, never below it, so
   * simultaneously mounted rain-map instances (two locations on one screen,
   * editor previews) cannot evict each other's tiles. Releasing the last
   * window prunes nothing — the final window stays cached so a screen
   * rotating away and back reuses its tiles without touching the network.
   */
  retainWindow(urls: ReadonlySet<string>): () => void;
}

export interface TileStoreDeps {
  fetchImpl?: typeof fetch;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  now?: () => number;
  /** Minimum spacing between dispatched tile requests. Default 250ms (≤240/min). */
  spacingMs?: number;
  /** How long a failed tile waits before it may be retried. Default 90s. */
  cooldownMs?: number;
  /**
   * How long a single tile request may run before it is aborted and enters the
   * failure cooldown. Default 10s. Without it a handful of half-open
   * connections (kiosk WiFi drop) would occupy every in-flight slot forever
   * and nothing would ever dispatch again for the rest of the tab's life.
   */
  timeoutMs?: number;
}

const DEFAULT_SPACING_MS = 250;
const DEFAULT_COOLDOWN_MS = 90_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_IN_FLIGHT = 4;

interface TileEntry {
  status: 'loading' | 'loaded' | 'cooldown';
  objectUrl?: string;
  retryAt?: number;
}

export function createTileStore({
  fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  createObjectURL = (blob: Blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url: string) => URL.revokeObjectURL(url),
  now = () => Date.now(),
  spacingMs = DEFAULT_SPACING_MS,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: TileStoreDeps = {}): TileStore {
  const entries = new Map<string, TileEntry>();
  const queue: string[] = [];
  const inFlight = new Set<string>();
  const waiters: Array<{ urls: Set<string>; resolve: () => void }> = [];
  const listeners = new Set<() => void>();
  let version = 0;
  let lastDispatchAt = -Infinity;
  let pumpTimer: ReturnType<typeof setTimeout> | null = null;
  // Mounted consumers (useSyncExternalStore subscriptions). Dispatch pauses
  // while none remain: a removed module must not keep draining its queue, while
  // screen rotation (unmount → remount seconds later) resumes the same queue.
  let consumers = 0;
  // Live animation windows, keyed by retention handle. Pruning targets the
  // union of these so sibling rain-map instances never evict each other.
  const liveWindows = new Map<number, ReadonlySet<string>>();
  let nextWindowId = 1;

  /** True when nothing more will happen for this URL without a new ensure(). */
  function isSettled(url: string): boolean {
    const e = entries.get(url);
    if (!e) return true;
    if (e.status === 'loaded') return true;
    if (e.status === 'cooldown') return true; // an attempt already settled; a lapsed cooldown re-queues only via ensure()
    return false; // loading
  }

  function settleWaiters() {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const waiter = waiters[i];
      let ready = true;
      for (const url of waiter.urls) {
        if (!isSettled(url)) {
          ready = false;
          break;
        }
      }
      if (ready) {
        waiters.splice(i, 1);
        waiter.resolve();
      }
    }
  }

  function notify() {
    version++;
    settleWaiters();
    for (const listener of listeners) listener();
  }

  function pump() {
    if (pumpTimer) {
      clearTimeout(pumpTimer);
      pumpTimer = null;
    }
    while (queue.length && consumers > 0 && inFlight.size < MAX_IN_FLIGHT) {
      const dueAt = lastDispatchAt + spacingMs;
      const wait = dueAt - now();
      if (wait > 0) {
        pumpTimer = setTimeout(pump, wait);
        break;
      }
      // Skip entries pruned while queued.
      let url = queue.shift();
      while (url && !entries.has(url)) url = queue.shift();
      if (!url) break;
      lastDispatchAt = now();
      void dispatch(url);
    }
  }

  async function dispatch(url: string) {
    inFlight.add(url);
    // Abort-bound so a stalled connection can't hold an in-flight slot (and
    // with all four slots held, wedge the queue) for the life of the tab.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: controller.signal });
      if (res.ok) {
        const blob = await res.blob();
        entries.set(url, { status: 'loaded', objectUrl: createObjectURL(blob) });
      } else {
        entries.set(url, { status: 'cooldown', retryAt: now() + cooldownMs });
      }
    } catch {
      entries.set(url, { status: 'cooldown', retryAt: now() + cooldownMs });
    } finally {
      clearTimeout(timeout);
      inFlight.delete(url);
      notify();
      pump();
    }
  }

  function ensure(urls: string[]): Promise<void> {
    for (const url of urls) {
      if (!url) continue;
      const e = entries.get(url);
      if (e?.status === 'loaded') continue;
      if (e?.status === 'cooldown') {
        if (now() < (e.retryAt ?? 0)) continue; // settled — cooldown still holds
        entries.delete(url); // cooldown elapsed → eligible again
      } else if (e?.status === 'loading') {
        continue; // already queued or in flight
      }
      entries.set(url, { status: 'loading' });
      queue.push(url);
    }
    pump();
    const wanted = urls.filter(Boolean);
    if (wanted.every(isSettled)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      waiters.push({ urls: new Set(wanted), resolve });
    });
  }

  function prune(validUrls: ReadonlySet<string>) {
    let changed = false;
    for (const [url, e] of entries) {
      if (e.status === 'loading') continue; // settles later; next prune drops it
      if (validUrls.has(url)) continue;
      if (e.objectUrl) revokeObjectURL(e.objectUrl);
      entries.delete(url);
      changed = true;
    }
    // Queued-but-not-yet-dispatched requests for rotated-out frames are
    // pure waste — drop them too.
    for (let i = queue.length - 1; i >= 0; i--) {
      const url = queue[i];
      if (validUrls.has(url)) continue;
      if (entries.get(url)?.status === 'loading') entries.delete(url);
      queue.splice(i, 1);
      changed = true;
    }
    if (changed) notify();
  }

  function pruneToLiveWindows() {
    // No live windows → keep the last union cached (screen rotation reuse).
    if (liveWindows.size === 0) return;
    const union = new Set<string>();
    for (const urls of liveWindows.values()) {
      for (const url of urls) union.add(url);
    }
    prune(union);
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      consumers++;
      pump(); // a consumer arriving may resume a paused queue
      return () => {
        listeners.delete(listener);
        consumers--;
        if (consumers === 0) {
          // Every ensure() promise is abandoned by now (its component
          // unmounted and cancelled), so settle the waiters rather than leak.
          const pending = waiters.splice(0);
          for (const w of pending) w.resolve();
        }
      };
    },
    getVersion: () => version,
    get: (url) => entries.get(url)?.objectUrl ?? null,
    ensure,
    retainWindow(urls) {
      const id = nextWindowId++;
      liveWindows.set(id, urls);
      pruneToLiveWindows();
      return () => {
        liveWindows.delete(id);
        pruneToLiveWindows();
      };
    },
    prune,
  };
}

/**
 * Shared across mounts: a screen rotating away and back reuses the previous
 * window's tiles without touching the network. Pinned on `globalThis` so every
 * copy of this module sees the SAME store — a dev-server hot swap re-evaluates
 * the module and would otherwise mint a second store whose queue drains in
 * parallel with the first (observed as a doubled request rate).
 */
const RADAR_TILE_STORE_KEY = '__hsRadarTileStore';
export const radarTileStore: TileStore =
  ((globalThis as Record<string | symbol, unknown>)[RADAR_TILE_STORE_KEY] as TileStore | undefined) ??
  (((globalThis as Record<string | symbol, unknown>)[RADAR_TILE_STORE_KEY] = createTileStore()) as TileStore);
