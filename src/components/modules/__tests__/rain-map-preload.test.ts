import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTileStore } from '../rain-map-preload';

/**
 * Controllable stand-in for the tile pipeline's network + blob plumbing. The
 * clock is a plain counter so cooldown math is exact; tests that exercise
 * request spacing use vitest fake timers (which also mock Date.now, the
 * default clock).
 */
function makeStore(opts?: {
  spacingMs?: number;
  burstSize?: number;
  cooldownMs?: number;
  pauseMs?: number;
  maxPauseMs?: number;
  timeoutMs?: number;
  maxEntries?: number;
}) {
  const fetches: string[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  let responder: (url: string) => { status: number } | 'hang' = () => ({ status: 200 });
  let tick = 0;
  const store = createTileStore({
    spacingMs: opts?.spacingMs ?? 0,
    burstSize: opts?.burstSize,
    cooldownMs: opts?.cooldownMs ?? 1_000,
    pauseMs: opts?.pauseMs ?? 1_000,
    maxPauseMs: opts?.maxPauseMs,
    timeoutMs: opts?.timeoutMs,
    maxEntries: opts?.maxEntries,
    now: () => tick,
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      fetches.push(u);
      const verdict = responder(u);
      if (verdict === 'hang') {
        // A connection that never settles on its own — a half-open TCP
        // connection the browser would sit on indefinitely. Only an abort
        // (the store's timeout) can end it.
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return verdict.status === 200
        ? new Response(new Blob(['png']), { status: 200 })
        : new Response(null, { status: verdict.status });
    }) as unknown as typeof fetch,
    createObjectURL: () => {
      const u = `blob:mock-${created.length + 1}`;
      created.push(u);
      return u;
    },
    revokeObjectURL: (u: string) => revoked.push(u),
  });
  // The component subscribes via useSyncExternalStore while mounted; the store
  // pauses dispatch without consumers, so tests subscribe like real callers.
  const unsubscribe = store.subscribe(() => {});
  return {
    store,
    fetches,
    created,
    revoked,
    unsubscribe,
    failAll: (status = 503) => (responder = () => ({ status })),
    okAll: () => (responder = () => ({ status: 200 })),
    hangAll: () => (responder = () => 'hang'),
    hangExcept: (okUrl: string) => (responder = (u) => (u === okUrl ? { status: 200 } : 'hang')),
    advance: (ms: number) => (tick += ms),
  };
}

/** Let queued microtasks (fetch settlement, deferred eviction) run. */
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('createTileStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches each URL once and exposes its object URL via get()', async () => {
    const { store, fetches } = makeStore();
    await store.ensure(['https://t/a.png', 'https://t/b.png']);
    expect(fetches).toEqual(['https://t/a.png', 'https://t/b.png']);
    expect(store.get('https://t/a.png')).toMatch(/^blob:/);
    expect(store.get('https://t/b.png')).toMatch(/^blob:/);
    expect(store.get('https://t/never.png')).toBeNull();
  });

  it('dedupes concurrent ensures for the same URL into one request', async () => {
    const { store, fetches } = makeStore();
    const p1 = store.ensure(['https://t/a.png']);
    const p2 = store.ensure(['https://t/a.png']);
    await Promise.all([p1, p2]);
    expect(fetches).toEqual(['https://t/a.png']);
  });

  it('does not retry a failed tile while its cooldown is active', async () => {
    const { store, fetches, failAll, advance } = makeStore();
    failAll(503);
    await store.ensure(['https://t/a.png']); // settles as failed
    expect(fetches).toHaveLength(1);

    // Animation-tempo retries must be no-ops while the cooldown holds.
    await store.ensure(['https://t/a.png']);
    await store.ensure(['https://t/a.png']);
    expect(fetches).toHaveLength(1);

    // Once the cooldown lapses, a new ensure may retry.
    advance(1_000);
    await store.ensure(['https://t/a.png']);
    expect(fetches).toHaveLength(2);
  });

  it('resolves ensure only when every URL has settled (mixed ok/fail)', async () => {
    const { store } = makeStore();
    let settled = false;
    const p = store.ensure(['https://t/a.png', 'https://t/b.png']).then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false); // one fetch still pending
    await p;
    expect(settled).toBe(true);
  });

  it('spaces dispatches so the request rate stays bounded', async () => {
    vi.useFakeTimers();
    // Default clock (Date.now) so the scheduler's spacing arithmetic and
    // vitest's timer advance agree.
    const fetches: string[] = [];
    const store = createTileStore({
      spacingMs: 100,
      burstSize: 1,
      fetchImpl: (async (url: string | URL | Request) => {
        fetches.push(String(url));
        return new Response(new Blob(['png']), { status: 200 });
      }) as unknown as typeof fetch,
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {},
    });
    const unsubscribe = store.subscribe(() => {});
    const urls = [1, 2, 3, 4, 5].map((n) => `https://t/${n}.png`);
    const all = store.ensure(urls);
    // First dispatch is immediate; each subsequent one waits out the spacing.
    expect(fetches).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetches).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(100);
    await all;
    expect(fetches).toHaveLength(5);
    unsubscribe();
  });

  it('lets a burst go out at once, then falls back to the sustained spacing', async () => {
    vi.useFakeTimers();
    const fetches: string[] = [];
    const store = createTileStore({
      spacingMs: 100,
      burstSize: 3,
      fetchImpl: (async (url: string | URL | Request) => {
        fetches.push(String(url));
        return new Response(new Blob(['png']), { status: 200 });
      }) as unknown as typeof fetch,
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {},
    });
    const unsubscribe = store.subscribe(() => {});
    const all = store.ensure([1, 2, 3, 4, 5].map((n) => `https://t/${n}.png`));
    // The burst covers the first three without waiting (a first frame shows
    // immediately on a cold mount); the rest are paced.
    expect(fetches).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(100);
    expect(fetches).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(100);
    await all;
    expect(fetches).toHaveLength(5);
    unsubscribe();
  });

  it('a 429 pauses the whole queue and retries that tile first once the pause lifts', async () => {
    vi.useFakeTimers();
    const fetches: string[] = [];
    let limited = true;
    const store = createTileStore({
      spacingMs: 0,
      pauseMs: 1_000,
      fetchImpl: (async (url: string | URL | Request) => {
        fetches.push(String(url));
        return limited
          ? new Response(null, { status: 429 })
          : new Response(new Blob(['png']), { status: 200 });
      }) as unknown as typeof fetch,
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {},
    });
    const unsubscribe = store.subscribe(() => {});
    const urls = [1, 2, 3, 4, 5, 6].map((n) => `https://t/${n}.png`);
    let settled = false;
    store.ensure(urls).then(() => {
      settled = true;
    });
    // Only the in-flight slots went out before the first 429 landed; the
    // rest of the queue must NOT be swept into the limiter one by one.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetches).toHaveLength(4);
    expect(settled).toBe(false); // rate-limited tiles are still wanted, not failed

    // The window has room again: the rejected tiles retry ahead of the rest.
    limited = false;
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches.slice(4, 8).sort()).toEqual(fetches.slice(0, 4).sort());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toHaveLength(10);
    expect(settled).toBe(true);
    urls.forEach((u) => expect(store.get(u)).toBe('blob:mock'));
    unsubscribe();
  });

  it('backs off exponentially while 429s follow each pause, and resets after a success', async () => {
    vi.useFakeTimers();
    const fetches: string[] = [];
    let limited = true;
    const store = createTileStore({
      spacingMs: 0,
      pauseMs: 1_000,
      maxPauseMs: 4_000,
      fetchImpl: (async (url: string | URL | Request) => {
        fetches.push(String(url));
        return limited
          ? new Response(null, { status: 429 })
          : new Response(new Blob(['png']), { status: 200 });
      }) as unknown as typeof fetch,
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {},
    });
    const unsubscribe = store.subscribe(() => {});
    store.ensure(['https://t/a.png']);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toHaveLength(1);
    // Pauses: 1s, 2s, 4s, 4s (capped).
    for (const pause of [1_000, 2_000, 4_000, 4_000]) {
      const before = fetches.length;
      await vi.advanceTimersByTimeAsync(pause - 1);
      expect(fetches).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetches).toHaveLength(before + 1);
    }

    // A success after a pause resets the backoff to the base pause.
    limited = false;
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get('https://t/a.png')).toBe('blob:mock');
    limited = true;
    store.ensure(['https://t/b.png']);
    await vi.advanceTimersByTimeAsync(0);
    const before = fetches.length;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetches).toHaveLength(before + 1);
    unsubscribe();
  });

  it('pauses dispatch with no consumers (removed module) and resumes for a returning one (rotation)', async () => {
    const { store, fetches, unsubscribe } = makeStore();
    unsubscribe(); // no consumers — models a module that is not mounted

    // Queueing with no consumers must not dispatch anything.
    let settled = false;
    const p = store.ensure(['https://t/a.png', 'https://t/b.png']).then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(fetches).toHaveLength(0);
    expect(settled).toBe(false); // the waiter stays pending, ready to resume

    // A consumer arriving (screen rotation brings the module back) resumes
    // the same queue and settles the original ensure.
    const resub = store.subscribe(() => {});
    await p;
    expect(fetches).toHaveLength(2);
    expect(store.get('https://t/a.png')).toMatch(/^blob:/);
    resub();
  });

  it('aborts stalled fetches so they cannot wedge the queue for the whole tab', async () => {
    vi.useFakeTimers();
    const { store, fetches, hangExcept } = makeStore({ timeoutMs: 1_000 });
    hangExcept('https://t/ok.png');
    // Four hangs fill MAX_IN_FLIGHT before the good tile's turn; without a
    // timeout the gate never reopens (a half-open connection never settles).
    const all = store.ensure([
      'https://t/a.png',
      'https://t/b.png',
      'https://t/c.png',
      'https://t/d.png',
      'https://t/ok.png',
    ]);
    expect(fetches).toHaveLength(4);

    // Past the timeout the hangs abort into cooldown, the gate reopens, and
    // the queued tile still gets its turn.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetches).toHaveLength(5);
    expect(fetches[4]).toBe('https://t/ok.png');
    await all;
    expect(store.get('https://t/ok.png')).toMatch(/^blob:/);
  });

  it('resolves abandoned waiters when the last consumer leaves', async () => {
    const { store, unsubscribe } = makeStore();
    unsubscribe(); // drop makeStore's consumer so only the one below counts
    const sub = store.subscribe(() => {});
    let settled = false;
    store.ensure(['https://t/a.png']).then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false); // still loading
    sub(); // last consumer gone → waiters settle so nothing leaks
    await Promise.resolve();
    expect(settled).toBe(true);
  });

  it('evicts the least recently retained tiles past the cap, so they re-fetch when they return', async () => {
    const { store, fetches, revoked, created } = makeStore({ maxEntries: 3 });
    const releaseA = store.retainWindow(new Set(['https://t/a1.png', 'https://t/a2.png']));
    await store.ensure(['https://t/a1.png', 'https://t/a2.png']);
    releaseA();
    const releaseB = store.retainWindow(new Set(['https://t/b1.png', 'https://t/b2.png']));
    await store.ensure(['https://t/b1.png', 'https://t/b2.png']);
    releaseB();
    await settle();

    // Four loaded tiles against a cap of three: the oldest window loses one.
    expect(revoked).toEqual([created[0]]);
    expect(store.get('https://t/a1.png')).toBeNull();
    expect(store.get('https://t/a2.png')).toMatch(/^blob:/);
    expect(store.get('https://t/b1.png')).toMatch(/^blob:/);

    await store.ensure(['https://t/a1.png']);
    expect(fetches).toHaveLength(5); // re-requested, not served from a dead entry
  });

  it('never evicts a live window, even past the cap', async () => {
    const { store, revoked, created } = makeStore({ maxEntries: 2 });
    const windowA = new Set(['https://t/a1.png', 'https://t/a2.png']);
    const windowB = new Set(['https://t/b1.png', 'https://t/b2.png']);
    const releaseA = store.retainWindow(windowA);
    const releaseB = store.retainWindow(windowB);
    await store.ensure([...windowA, ...windowB]);
    await settle();

    // Two sibling instances whose union exceeds the cap keep every tile.
    expect(revoked).toHaveLength(0);
    for (const url of [...windowA, ...windowB]) expect(store.get(url)).toMatch(/^blob:/);

    // Once A is gone, only A's tiles are candidates.
    releaseA();
    const releaseC = store.retainWindow(new Set(['https://t/c1.png']));
    await store.ensure(['https://t/c1.png']);
    await settle();
    expect(revoked).toEqual([created[0], created[1]]);
    expect(store.get('https://t/b1.png')).toMatch(/^blob:/);
    expect(store.get('https://t/b2.png')).toMatch(/^blob:/);
    expect(store.get('https://t/c1.png')).toMatch(/^blob:/);
    releaseB();
    releaseC();
  });

  it('release evicts nothing, so a screen rotating between rain-maps keeps both windows', async () => {
    const { store, fetches, revoked } = makeStore();
    const windowA = new Set(['https://t/a1.png']);
    const windowB = new Set(['https://t/b1.png']);

    // Screen 1 shows window A, rotates to screen 2 (window B), then back.
    let release = store.retainWindow(windowA);
    await store.ensure([...windowA]);
    release();
    release = store.retainWindow(windowB);
    await store.ensure([...windowB]);
    release();
    release = store.retainWindow(windowA);
    await store.ensure([...windowA]);
    await settle();

    expect(revoked).toHaveLength(0);
    expect(fetches).toEqual(['https://t/a1.png', 'https://t/b1.png']);
    expect(store.get('https://t/a1.png')).toMatch(/^blob:/);
    expect(store.get('https://t/b1.png')).toMatch(/^blob:/);
    release();
  });

  it('a window released and re-retained in one commit keeps its tiles against a live sibling', async () => {
    // React runs every effect cleanup before every effect body in a commit,
    // so an instance refreshing next to a sibling releases its window, the
    // sibling releases, then both re-retain. Nothing may be evicted in the gap.
    const { store, fetches, revoked } = makeStore({ maxEntries: 2 });
    const windowA = new Set(['https://t/a1.png']);
    const windowB = new Set(['https://t/b1.png']);
    const releaseA = store.retainWindow(windowA);
    const releaseB = store.retainWindow(windowB);
    await store.ensure([...windowA, ...windowB]);

    releaseA();
    releaseB();
    const releaseA2 = store.retainWindow(new Set([...windowA, 'https://t/a2.png']));
    const ensureA = store.ensure([...windowA, 'https://t/a2.png']);
    const releaseB2 = store.retainWindow(windowB);
    const ensureB = store.ensure([...windowB]);
    await Promise.all([ensureA, ensureB]);
    await settle();

    expect(revoked).toHaveLength(0);
    expect(fetches).toEqual(['https://t/a1.png', 'https://t/b1.png', 'https://t/a2.png']);
    releaseA2();
    releaseB2();
  });

  it('skips queued requests that no live window still wants', async () => {
    const { store, fetches, hangAll, okAll, unsubscribe } = makeStore();
    unsubscribe(); // hold the queue so nothing dispatches yet
    hangAll();
    const releaseOld = store.retainWindow(new Set(['https://t/old.png']));
    let oldSettled = false;
    store.ensure(['https://t/old.png']).then(() => {
      oldSettled = true;
    });

    // The window changes (zoom slider settles elsewhere) before the queue
    // drains: the stale request is dropped, not sent.
    releaseOld();
    const releaseNew = store.retainWindow(new Set(['https://t/new.png']));
    okAll();
    const p = store.ensure(['https://t/new.png']);
    const resub = store.subscribe(() => {});
    await p;
    await settle();
    expect(fetches).toEqual(['https://t/new.png']);
    expect(oldSettled).toBe(true);
    releaseNew();
    resub();
  });

  it('notifies subscribers and bumps the version when a tile settles', async () => {
    const { store } = makeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(store.getVersion()).toBe(0);

    await store.ensure(['https://t/a.png']);
    expect(listener).toHaveBeenCalled();
    expect(store.getVersion()).toBeGreaterThan(0);
    unsubscribe();
  });

  it('ignores empty URLs without creating a request', async () => {
    const { store, fetches } = makeStore();
    await store.ensure(['', '']);
    expect(fetches).toHaveLength(0);
  });
});
