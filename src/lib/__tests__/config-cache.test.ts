import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
}));

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readConfig } from '@/lib/config';
import { getDataRoot } from '@/lib/data-transaction';
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

afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(configPath(), { force: true });
});

const configPath = () => path.join(getDataRoot(), 'data/config.json');

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
    await vi.waitFor(() => expect(readConfig).toHaveBeenCalled());
    release(CONFIG);
    expect(await a).toBe(CONFIG);
    expect(await b).toBe(CONFIG);
    expect(readConfig).toHaveBeenCalledTimes(1);
  });

  it('keeps serving an unchanged file, however long walls poll it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.mocked(readConfig).mockResolvedValue(CONFIG);
    await fs.writeFile(configPath(), '{}');
    await readConfigCached();
    vi.setSystemTime(Date.now() + 60 * 60_000);
    expect(await readConfigCached()).toBe(CONFIG);
    expect(readConfig).toHaveBeenCalledTimes(1);
  });

  it('reads again as soon as the file changes, with no save in this process', async () => {
    vi.mocked(readConfig).mockResolvedValue(CONFIG);
    await fs.writeFile(configPath(), '{}');
    await readConfigCached();
    await fs.writeFile(configPath(), '{"edited":true}');
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
    await vi.waitFor(() => expect(readConfig).toHaveBeenCalled());
    fail(new Error('boom'));
    const [ra, rb] = await results;
    expect(ra.status).toBe('rejected');
    expect(rb.status).toBe('rejected');
    expect(readConfig).toHaveBeenCalledTimes(2);
  });
});

describe('invalidateConfigReadCache', () => {
  it('makes the next call re-read immediately, before the file looks changed', async () => {
    vi.mocked(readConfig).mockResolvedValue(CONFIG);
    await readConfigCached();
    invalidateConfigReadCache();
    await readConfigCached();
    expect(readConfig).toHaveBeenCalledTimes(2);
  });

  it('a read in flight when the cache is invalidated cannot repopulate it', async () => {
    // The write-invalidation race: a read starts, a config write lands and
    // invalidates, then the pre-write read resolves late. Its snapshot must
    // not be cached, or the write would be invisible until the file changed again.
    let release!: (value: ScreenConfiguration) => void;
    vi.mocked(readConfig).mockReturnValueOnce(
      new Promise<ScreenConfiguration>((resolve) => {
        release = resolve;
      }),
    );
    const preWriteRead = readConfigCached();
    await vi.waitFor(() => expect(readConfig).toHaveBeenCalled());
    invalidateConfigReadCache();
    release(CONFIG);
    expect(await preWriteRead).toBe(CONFIG);

    const FRESH = { ...CONFIG, version: 5 } as ScreenConfiguration;
    vi.mocked(readConfig).mockResolvedValue(FRESH);
    expect(await readConfigCached()).toBe(FRESH);
    expect(readConfig).toHaveBeenCalledTimes(2);
  });
});
