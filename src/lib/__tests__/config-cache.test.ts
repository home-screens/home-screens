import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
}));

import { readConfig } from '@/lib/config';
import {
  readConfigCached,
  invalidateConfigReadCache,
  __resetConfigReadCacheForTests,
} from '@/lib/config-cache';
import type { ScreenConfiguration } from '@/types/config';

const CONFIG = {
  version: 4,
  screens: [],
  settings: {} as never,
} as unknown as ScreenConfiguration;

beforeEach(() => {
  vi.clearAllMocks();
  __resetConfigReadCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('readConfigCached', () => {
  it('coalesces concurrent cold reads into one readConfig call', async () => {
    let release!: (value: ScreenConfiguration) => void;
    vi.mocked(readConfig).mockReturnValue(
      new Promise<ScreenConfiguration>((resolve) => {
        release = resolve;
      }),
    );
    const a = readConfigCached();
    const b = readConfigCached();
    release(CONFIG);
    expect(await a).toBe(CONFIG);
    expect(await b).toBe(CONFIG);
    expect(readConfig).toHaveBeenCalledTimes(1);
  });

  it('serves from cache within the TTL and re-reads after expiry', async () => {
    vi.useFakeTimers();
    vi.mocked(readConfig).mockResolvedValue(CONFIG);
    await readConfigCached();
    await readConfigCached();
    expect(readConfig).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await readConfigCached();
    expect(readConfig).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed read — the next call retries', async () => {
    vi.mocked(readConfig).mockRejectedValueOnce(new Error('corrupt'));
    await expect(readConfigCached()).rejects.toThrow('corrupt');
    vi.mocked(readConfig).mockResolvedValue(CONFIG);
    expect(await readConfigCached()).toBe(CONFIG);
    expect(readConfig).toHaveBeenCalledTimes(2);
  });

  it('rejects every coalesced caller when the shared read fails', async () => {
    let fail!: (err: Error) => void;
    vi.mocked(readConfig).mockReturnValue(
      new Promise<ScreenConfiguration>((_resolve, reject) => {
        fail = reject;
      }),
    );
    const a = readConfigCached();
    const b = readConfigCached();
    // Attach handlers before rejecting so neither surfaces as unhandled.
    const results = Promise.allSettled([a, b]);
    fail(new Error('boom'));
    const [ra, rb] = await results;
    expect(ra.status).toBe('rejected');
    expect(rb.status).toBe('rejected');
    expect(readConfig).toHaveBeenCalledTimes(1);
  });
});

describe('invalidateConfigReadCache', () => {
  it('makes the next call re-read immediately, ignoring the TTL', async () => {
    vi.mocked(readConfig).mockResolvedValue(CONFIG);
    await readConfigCached();
    invalidateConfigReadCache();
    await readConfigCached();
    expect(readConfig).toHaveBeenCalledTimes(2);
  });

  it('a read in flight when the cache is invalidated cannot repopulate it', async () => {
    // The write-invalidation race: a read starts, a config write lands and
    // invalidates, then the pre-write read resolves late. Its snapshot must
    // not be cached, or the write would be invisible for a full TTL.
    let release!: (value: ScreenConfiguration) => void;
    vi.mocked(readConfig).mockReturnValueOnce(
      new Promise<ScreenConfiguration>((resolve) => {
        release = resolve;
      }),
    );
    const preWriteRead = readConfigCached();
    invalidateConfigReadCache();
    release(CONFIG);
    expect(await preWriteRead).toBe(CONFIG);

    const FRESH = { ...CONFIG, version: 5 } as ScreenConfiguration;
    vi.mocked(readConfig).mockResolvedValue(FRESH);
    expect(await readConfigCached()).toBe(FRESH);
    expect(readConfig).toHaveBeenCalledTimes(2);
  });
});

describe('TTL accounting', () => {
  it('counts the TTL from when the read STARTS, not when it resolves', async () => {
    vi.useFakeTimers();
    let release!: (value: ScreenConfiguration) => void;
    vi.mocked(readConfig).mockReturnValueOnce(
      new Promise<ScreenConfiguration>((resolve) => {
        release = resolve;
      }),
    );
    const first = readConfigCached();
    vi.advanceTimersByTime(1_000); // a slow disk read
    release(CONFIG);
    await first;

    vi.advanceTimersByTime(400); // 1.4s since read start — still cached
    await readConfigCached();
    expect(readConfig).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(200); // 1.6s since read start — expired
    vi.mocked(readConfig).mockResolvedValue(CONFIG);
    await readConfigCached();
    expect(readConfig).toHaveBeenCalledTimes(2);
  });
});
