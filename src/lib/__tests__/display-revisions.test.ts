import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScreenConfiguration } from '@/types/config';

vi.mock('@/lib/build-id', () => ({ readBuildId: vi.fn() }));
vi.mock('@/lib/config-cache', () => ({ readConfigCached: vi.fn(), invalidateConfigReadCache: vi.fn() }));
vi.mock('@/lib/plugins', () => ({ getInstalledRevision: vi.fn() }));
vi.mock('@/lib/timer-data', () => ({ readSessionRevision: vi.fn() }));

import { readBuildId } from '@/lib/build-id';
import { readConfigCached } from '@/lib/config-cache';
import { getInstalledRevision } from '@/lib/plugins';
import { readSessionRevision } from '@/lib/timer-data';
import { configRevision } from '@/lib/config';
import { hubTimezone } from '@/lib/household-day';
import { wallEtag } from '@/lib/wall-config';
import { readDisplayRevisions } from '@/lib/display-revisions';

const CONFIG = { screens: [], settings: { timezone: 'UTC' } } as unknown as ScreenConfiguration;

beforeEach(() => {
  vi.mocked(readBuildId).mockResolvedValue('build-1');
  vi.mocked(readConfigCached).mockResolvedValue(CONFIG);
  vi.mocked(getInstalledRevision).mockResolvedValue('plugins-1');
  vi.mocked(readSessionRevision).mockResolvedValue('timer-1');
});

describe('readDisplayRevisions', () => {
  it("names the config by the exact ETag a wall's config read is answered with", async () => {
    expect(await readDisplayRevisions()).toEqual({
      buildId: 'build-1',
      plugins: 'plugins-1',
      config: wallEtag(configRevision(CONFIG), hubTimezone()),
      timer: 'timer-1',
    });
  });

  it('leaves out only the field it could not work out', async () => {
    vi.mocked(readConfigCached).mockRejectedValue(new Error('config.json is corrupt'));
    vi.mocked(readSessionRevision).mockRejectedValue(new Error('unreadable'));

    const revisions = await readDisplayRevisions();

    expect(revisions.config).toBeUndefined();
    expect(revisions.timer).toBeUndefined();
    expect(revisions).toMatchObject({ buildId: 'build-1', plugins: 'plugins-1' });
  });
});
