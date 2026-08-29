/**
 * Rate-bounded radar tile store.
 *
 * All radar tile network flows through this store — the rendered <img> tags
 * only ever point at cached object URLs. Four rules keep a weeks-long kiosk
 * mount inside RainViewer's limits (500 requests/min per IP with a 300/min
 * burst; one animation window is 13+ frames x 25 tiles = 325+ requests, more
 * than both):
 * - A single issuance queue meters dispatches through a token bucket: a small
 *   burst (enough for the first frame to appear at once) and then one token
 *   per `spacingMs`, so the sustained rate is bounded no matter how fast the
 *   animation cycles or how many frames it sweeps. The queue is strictly FIFO,
 *   so callers control priority by the order they ensure() in.
 * - A 429 pauses the WHOLE store, not just the tile that received it. The
 *   rate limit is per IP, so every further request during the window is a
 *   guaranteed rejection that still consumes the window; the tile goes back
 *   to the head of the queue and the pause backs off exponentially while 429s
 *   keep coming after each pause.
 * - Any other failure (5xx, timeout, network error) puts that tile in a
 *   cooldown so it is not re-requested at animation tempo.
 * - Successes are cached as object URLs, so cycling frames and remounting
 *   screens (rotation) render for free. The store is bounded by entry count:
 *   past the cap, tiles outside every live window are evicted least recently
 *   retained first. Tiles inside a live window are never evicted, and nothing
 *   is evicted on release, so sibling instances and screens rotating through
 *   different rain-maps keep each other's tiles.
 *
 * Everything with a side effect is injectable so the store is unit-testable
 * without a DOM or network.
 */

export interface TileStore {
  /** Subscribe to tile loads/evictions; returns an unsubscribe function. */
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
  /**
   * Register a consumer's animation window; returns a release function. Tiles
   * in a live window are never evicted and queued requests outside every live
   * window are skipped, so simultaneously mounted rain-map instances (two
   * locations on one screen, editor previews) cannot evict each other's tiles
   * and a window change stops feeding the old window's requests. Releasing
   * evicts nothing: the store stays bounded by `maxEntries`, so screens that
   * rotate through several rain-maps reuse their tiles without touching the
   * network.
   */
  retainWindow(urls: ReadonlySet<string>): () => void;
}

export interface TileStoreDeps {
  fetchImpl?: typeof fetch;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  now?: () => number;
  /** Sustained spacing between dispatched tile requests. Default 250ms (≤240/min). */
  spacingMs?: number;
  /**
   * How many requests may go out at once before spacing applies. Default 40:
   * more than one 25-tile frame so the first frame appears immediately, while
   * the first minute stays under RainViewer's 300/min burst (40 + 240).
   */
  burstSize?: number;
  /** How long a failed (non-429) tile waits before it may be retried. Default 90s. */
  cooldownMs?: number;
  /** First store-wide pause after a 429. Doubles per consecutive pause. Default 20s. */
  pauseMs?: number;
  /** Longest store-wide pause. Default 5 min. */
  maxPauseMs?: number;
  /**
   * How long a single tile request may run before it is aborted and enters the
   * failure cooldown. Default 10s. Without it a handful of half-open
   * connections (kiosk WiFi drop) would occupy every in-flight slot forever
   * and nothing would ever dispatch again for the rest of the tab's life.
   */
  timeoutMs?: number;
  /**
   * Entry cap before eviction. Default 1600: four full animation windows, so
   * a display rotating between several rain-map screens keeps all of them.
   * Live windows are never evicted, so the cap is exceeded rather than
   * enforced if the live union alone is larger.
   */
  maxEntries?: number;
}

const DEFAULT_SPACING_MS = 250;
const DEFAULT_BURST_SIZE = 40;
const DEFAULT_COOLDOWN_MS = 90_000;
const DEFAULT_PAUSE_MS = 20_000;
const DEFAULT_MAX_PAUSE_MS = 300_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ENTRIES = 1600;
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
  burstSize = DEFAULT_BURST_SIZE,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  pauseMs = DEFAULT_PAUSE_MS,
  maxPauseMs = DEFAULT_MAX_PAUSE_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxEntries = DEFAULT_MAX_ENTRIES,
}: TileStoreDeps = {}): TileStore {
  // Insertion order doubles as the eviction order: retaining a window moves
  // its entries to the end, so the head is the least recently retained.
  const entries = new Map<string, TileEntry>();
  const queue: string[] = [];
  const inFlight = new Set<string>();
  const waiters: Array<{ urls: Set<string>; resolve: () => void }> = [];
  const listeners = new Set<() => void>();
  let version = 0;
  let pumpTimer: ReturnType<typeof setTimeout> | null = null;
  // Token bucket: starts full so a cold mount shows its first frame at once.
  let tokens = burstSize;
  let lastRefillAt = -Infinity;
  // Store-wide 429 pause. `nextPauseMs` doubles for every pause that a fresh
  // 429 follows, and resets once a request dispatched after a pause succeeds.
  let pausedUntil = -Infinity;
  let nextPauseMs = pauseMs;
  // Mounted consumers (useSyncExternalStore subscriptions). Dispatch pauses
  // while none remain: a removed module must not keep draining its queue, while
  // screen rotation (unmount → remount seconds later) resumes the same queue.
  let consumers = 0;
  // Live animation windows, keyed by retention handle.
  const liveWindows = new Map<number, ReadonlySet<string>>();
  let nextWindowId = 1;
  let evictScheduled = false;

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

  function isLive(url: string): boolean {
    for (const urls of liveWindows.values()) {
      if (urls.has(url)) return true;
    }
    return false;
  }

  function refill(t: number) {
    if (spacingMs <= 0) {
      tokens = burstSize;
    } else {
      tokens = Math.min(burstSize, tokens + (t - lastRefillAt) / spacingMs);
    }
    lastRefillAt = t;
  }

  /**
   * Next queued URL worth dispatching. Requests for tiles that were evicted,
   * or that no live window still wants (a window change while the old
   * window's frames were still queued), are dropped rather than sent.
   */
  function nextDispatchable(): string | undefined {
    let dropped = false;
    let url: string | undefined;
    while ((url = queue.shift()) !== undefined) {
      const e = entries.get(url);
      if (e?.status === 'loading' && (liveWindows.size === 0 || isLive(url))) break;
      if (e?.status === 'loading') entries.delete(url);
      dropped = true;
      url = undefined;
    }
    if (dropped) notify();
    return url;
  }

  function armPump(delayMs: number) {
    pumpTimer = setTimeout(pump, Math.max(0, Math.ceil(delayMs)));
  }

  function pump() {
    if (pumpTimer) {
      clearTimeout(pumpTimer);
      pumpTimer = null;
    }
    while (queue.length && consumers > 0 && inFlight.size < MAX_IN_FLIGHT) {
      const t = now();
      if (t < pausedUntil) {
        armPump(pausedUntil - t);
        break;
      }
      refill(t);
      if (tokens < 1) {
        armPump((1 - tokens) * spacingMs);
        break;
      }
      const url = nextDispatchable();
      if (url === undefined) break;
      tokens -= 1;
      void dispatch(url, t);
    }
  }

  function pauseForRateLimit(t: number) {
    // In-flight requests dispatched before the pause will 429 too; they must
    // not each extend or escalate it.
    if (t < pausedUntil) return;
    pausedUntil = t + nextPauseMs;
    nextPauseMs = Math.min(nextPauseMs * 2, maxPauseMs);
    // Resume gently: no burst when the pause lifts.
    tokens = 0;
    lastRefillAt = pausedUntil;
  }

  async function dispatch(url: string, dispatchedAt: number) {
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
        // A success from after a pause means the window has room again.
        if (dispatchedAt >= pausedUntil) nextPauseMs = pauseMs;
      } else if (res.status === 429) {
        // Not this tile's fault: the IP is over its window. Keep it first in
        // line and stop everything until the window has room again.
        if (entries.get(url)?.status === 'loading') queue.unshift(url);
        pauseForRateLimit(now());
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
      scheduleEvict(); // a load landed; the cap may be exceeded now
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
    scheduleEvict();
    const wanted = urls.filter(Boolean);
    if (wanted.every(isSettled)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      waiters.push({ urls: new Set(wanted), resolve });
    });
  }

  /**
   * Drop the least recently retained tiles outside every live window until the
   * store is back under its cap. Deferred to a microtask so a React commit
   * that releases one window and retains its replacement (an instance's
   * effect re-running on refresh, or several instances at once) is judged
   * against the windows it ends with, not the ones it passes through.
   */
  function scheduleEvict() {
    if (evictScheduled) return;
    evictScheduled = true;
    queueMicrotask(evict);
  }

  function evict() {
    evictScheduled = false;
    if (entries.size <= maxEntries) return;
    let changed = false;
    for (const [url, e] of entries) {
      if (entries.size <= maxEntries) break;
      // Pending requests settle soon and become candidates then.
      if (e.status === 'loading' || isLive(url)) continue;
      if (e.objectUrl) revokeObjectURL(e.objectUrl);
      entries.delete(url);
      changed = true;
    }
    if (changed) notify();
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
          if (pumpTimer) {
            clearTimeout(pumpTimer);
            pumpTimer = null;
          }
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
      // Mark this window most recently used: move its entries to the tail of
      // the eviction order.
      for (const url of urls) {
        const e = entries.get(url);
        if (!e) continue;
        entries.delete(url);
        entries.set(url, e);
      }
      scheduleEvict();
      return () => {
        liveWindows.delete(id);
      };
    },
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
