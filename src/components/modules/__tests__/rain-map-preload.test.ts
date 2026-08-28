import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTileStore } from '../rain-map-preload';

/**
 * Controllable stand-in for the tile pipeline's network + blob plumbing. The
 * clock is a plain counter so cooldown math is exact; tests that exercise
 * request spacing use vitest fake timers (which also mock Date.now, the
 * default clock).
 */
function makeStore(opts?: { spacingMs?: number; cooldownMs?: number }) {
  const fetches: string[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  let responder: (url: string) => { ok: boolean } = () => ({ ok: true });
  let tick = 0;
  const store = createTileStore({
    spacingMs: opts?.spacingMs ?? 0,
    cooldownMs: opts?.cooldownMs ?? 1_000,
    now: () => tick,
    fetchImpl: (async (url: string | URL | Request) => {
      const u = String(url);
      fetches.push(u);
      const { ok } = responder(u);
      return ok
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
