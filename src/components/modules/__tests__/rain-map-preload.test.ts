import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTileStore } from '../rain-map-preload';

/**
 * Controllable stand-in for the tile pipeline's network + blob plumbing. The
 * clock is a plain counter so cooldown math is exact; tests that exercise
 * request spacing use vitest fake timers (which also mock Date.now, the
 * default clock).
 */
function makeStore(opts?: { spacingMs?: number; cooldownMs?: number; timeoutMs?: number }) {
  const fetches: string[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  let responder: (url: string) => { ok: boolean } | 'hang' = () => ({ ok: true });
  let tick = 0;
  const store = createTileStore({
    spacingMs: opts?.spacingMs ?? 0,
    cooldownMs: opts?.cooldownMs ?? 1_000,
    timeoutMs: opts?.timeoutMs,
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
      return verdict.ok
        ? new Response(new Blob(['png']), { status: 200 })
        : new Response(null, { status: 429 });
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
    failAll: () => (responder = () => ({ ok: false })),
    hangAll: () => (responder = () => 'hang'),
    hangExcept: (okUrl: string) => (responder = (u) => (u === okUrl ? { ok: true } : 'hang')),
    advance: (ms: number) => (tick += ms),
  };
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
    failAll();
    await store.ensure(['https://t/a.png']); // settles as failed (429)
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

  it('prune revokes object URLs outside the window so they re-fetch when they return', async () => {
    const { store, fetches, revoked, created } = makeStore();
    await store.ensure(['https://t/old.png']);
    expect(created).toHaveLength(1);

    store.prune(new Set(['https://t/kept.png']));
    expect(revoked).toEqual(created); // the only object URL was revoked
    expect(store.get('https://t/old.png')).toBeNull();

    await store.ensure(['https://t/old.png']);
    expect(fetches).toHaveLength(2); // re-requested, not served from a dead entry
  });

  it('retained windows prune to their union, so live windows never evict each other', async () => {
    const { store, revoked } = makeStore();
    const windowA = new Set(['https://t/a1.png', 'https://t/a2.png']);
    const windowB = new Set(['https://t/b1.png', 'https://t/b2.png']);
    const releaseA = store.retainWindow(windowA);
    const releaseB = store.retainWindow(windowB);

    await store.ensure([...windowA, ...windowB]);
    expect(store.get('https://t/a1.png')).toMatch(/^blob:/);
    expect(store.get('https://t/b1.png')).toMatch(/^blob:/);

    // A's window rotating (release + re-retain with new URLs) must only prune
    // to the union of the LIVE windows — B's tiles survive.
    releaseA();
    const releaseA2 = store.retainWindow(new Set(['https://t/a3.png']));
    await store.ensure(['https://t/a3.png']);
    expect(revoked).not.toContain('https://t/b1.png');
    expect(store.get('https://t/b1.png')).toMatch(/^blob:/);
    // A's old URLs are gone from every live window, so they were pruned.
    expect(store.get('https://t/a1.png')).toBeNull();

    releaseB();
    releaseA2();
  });

  it('the last release keeps the final window cached for screen rotation', async () => {
    const { store, revoked } = makeStore();
    const windowA = new Set(['https://t/a1.png']);
    const release = store.retainWindow(windowA);
    await store.ensure([...windowA]);
    expect(store.get('https://t/a1.png')).toMatch(/^blob:/);

    // Unmounting the only consumer must not wipe the cache: the screen can
    // rotate back seconds later and render instantly.
    release();
    expect(revoked).toHaveLength(0);
    expect(store.get('https://t/a1.png')).toMatch(/^blob:/);
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
