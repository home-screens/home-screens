import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `getDisplayClientId` has three happy-path branches and one error branch:
 *   1. SSR            → typeof window === 'undefined' → 'ssr'
 *   2. existing id    → sessionStorage already has one → return cached
 *   3. fresh id       → crypto.randomUUID when available, else a hand-rolled
 *                       `c-<time>-<rand>` string; persisted to sessionStorage
 *   4. volatile id    → sessionStorage throws (private-mode Safari) → 'vol-…'
 *
 * Each test isolates the globals it needs via vi.stubGlobal and clears them
 * in afterEach so the default node environment (no window) is restored for
 * the SSR case.
 */

function makeFakeSessionStorage() {
  const store = new Map<string, string>();
  return {
    api: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    },
    store,
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getDisplayClientId — SSR path', () => {
  it('returns "ssr" when window is undefined', async () => {
    // Default node test env has no `window`, so nothing to stub.
    const { getDisplayClientId } = await import('../display-client-id');
    expect(getDisplayClientId()).toBe('ssr');
  });
});

describe('getDisplayClientId — fresh id via crypto.randomUUID', () => {
  it('calls crypto.randomUUID and persists the result', async () => {
    const { api, store } = makeFakeSessionStorage();
    const mockRandomUUID = vi.fn(() => 'uuid-deadbeef');

    vi.stubGlobal('window', { sessionStorage: api });
    vi.stubGlobal('crypto', { randomUUID: mockRandomUUID });

    const { getDisplayClientId } = await import('../display-client-id');
    const id = getDisplayClientId();

    expect(id).toBe('uuid-deadbeef');
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
    expect(store.get('home-screens:display-client-id')).toBe('uuid-deadbeef');
  });

  it('returns the cached id on a second call without regenerating', async () => {
    const { api, store } = makeFakeSessionStorage();
    store.set('home-screens:display-client-id', 'persisted-from-prior-load');
    const mockRandomUUID = vi.fn(() => 'should-not-be-used');

    vi.stubGlobal('window', { sessionStorage: api });
    vi.stubGlobal('crypto', { randomUUID: mockRandomUUID });

    const { getDisplayClientId } = await import('../display-client-id');
    expect(getDisplayClientId()).toBe('persisted-from-prior-load');
    expect(mockRandomUUID).not.toHaveBeenCalled();
  });
});

describe('getDisplayClientId — fallback when crypto.randomUUID is missing', () => {
  it('builds an id from Date.now and Math.random and persists it', async () => {
    const { api, store } = makeFakeSessionStorage();
    // crypto exists but randomUUID is not a function
    vi.stubGlobal('window', { sessionStorage: api });
    vi.stubGlobal('crypto', {});

    const { getDisplayClientId } = await import('../display-client-id');
    const id = getDisplayClientId();

    // Format: "c-<base36 timestamp>-<8 base36 chars>"
    expect(id).toMatch(/^c-[0-9a-z]+-[0-9a-z]{1,8}$/);
    expect(store.get('home-screens:display-client-id')).toBe(id);
  });

  it('still returns the same persisted id on subsequent calls', async () => {
    const { api } = makeFakeSessionStorage();
    vi.stubGlobal('window', { sessionStorage: api });
    vi.stubGlobal('crypto', {});

    const { getDisplayClientId } = await import('../display-client-id');
    const first = getDisplayClientId();
    const second = getDisplayClientId();
    expect(second).toBe(first);
  });
});

describe('getDisplayClientId — volatile fallback when sessionStorage throws', () => {
  it('returns a "vol-…" id when getItem throws (private-mode Safari)', async () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => {
          throw new Error('SecurityError: storage blocked');
        },
        setItem: () => {
          throw new Error('SecurityError: storage blocked');
        },
      },
    });
    vi.stubGlobal('crypto', { randomUUID: () => 'never-reached' });

    const { getDisplayClientId } = await import('../display-client-id');
    const id = getDisplayClientId();
    expect(id).toMatch(/^vol-[0-9a-z]{1,10}$/);
  });

  it('returns a "vol-…" id when setItem throws (quota exceeded)', async () => {
    const mockRandomUUID = vi.fn(() => 'uuid-unstored');
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    });
    vi.stubGlobal('crypto', { randomUUID: mockRandomUUID });

    const { getDisplayClientId } = await import('../display-client-id');
    const id = getDisplayClientId();

    // randomUUID was called before setItem threw, but the catch clause
    // discards the result and returns a volatile id instead.
    expect(mockRandomUUID).toHaveBeenCalled();
    expect(id).toMatch(/^vol-[0-9a-z]{1,10}$/);
    expect(id).not.toBe('uuid-unstored');
  });

  it('does not memoize volatile ids — each call produces a fresh value', async () => {
    // When sessionStorage is unavailable, the contract is "don't crash" —
    // we accept that each call yields a new id rather than pretending to
    // persist. Lock that behavior in so a future refactor does not silently
    // introduce a module-level cache that would break private-mode.
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {},
      },
    });
    vi.stubGlobal('crypto', { randomUUID: () => 'x' });

    const { getDisplayClientId } = await import('../display-client-id');
    const a = getDisplayClientId();
    const b = getDisplayClientId();
    expect(a).toMatch(/^vol-/);
    expect(b).toMatch(/^vol-/);
    // They're random; extremely unlikely to collide, but we assert distinct
    // prefixes at minimum to prove both hit the fallback path.
    expect(a).not.toBe(b);
  });
});
