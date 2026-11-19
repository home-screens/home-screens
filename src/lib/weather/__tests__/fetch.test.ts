import { describe, it, expect, vi, afterEach } from 'vitest';
import { createProviderFetch } from '../fetch';

afterEach(() => { vi.useRealTimers(); });

describe('createProviderFetch', () => {
  it('shares one load between callers that ask while it is in flight', async () => {
    const fetchOnce = createProviderFetch<number>();
    let release!: (n: number) => void;
    const load = vi.fn(() => new Promise<number>((resolve) => { release = resolve; }));
    const a = fetchOnce('k', load);
    const b = fetchOnce('k', load);
    release(7);
    expect(await Promise.all([a, b])).toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps nothing once the answer lands when there is no TTL', async () => {
    const fetchOnce = createProviderFetch<number>();
    const load = vi.fn(async () => 1);
    await fetchOnce('k', load);
    await fetchOnce('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('answers from the kept value until the TTL runs out, per key', async () => {
    vi.useFakeTimers();
    const fetchOnce = createProviderFetch<string>({ ttlMs: 1000 });
    const load = vi.fn(async () => 'v');
    await fetchOnce('a', load);
    await fetchOnce('a', load);
    expect(load).toHaveBeenCalledTimes(1);
    await fetchOnce('b', load);
    expect(load).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1001);
    await fetchOnce('a', load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('never keeps a failure, so the next refresh asks again', async () => {
    const fetchOnce = createProviderFetch<number>({ ttlMs: 60_000 });
    const load = vi.fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(2);
    await expect(fetchOnce('k', load)).rejects.toThrow('down');
    expect(await fetchOnce('k', load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('forgets everything on clear', async () => {
    const fetchOnce = createProviderFetch<number>({ ttlMs: 60_000 });
    const load = vi.fn(async () => 1);
    await fetchOnce('k', load);
    fetchOnce.clear();
    await fetchOnce('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
