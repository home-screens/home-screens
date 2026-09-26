import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScreenConfiguration } from '@/types/config';

vi.mock('@/lib/build-id', () => ({ readBuildId: vi.fn() }));
vi.mock('@/lib/config-cache', () => ({ readConfigCached: vi.fn(), invalidateConfigReadCache: vi.fn() }));
vi.mock('@/lib/plugins', () => ({ getInstalledRevision: vi.fn() }));
vi.mock('@/lib/timer-data', () => ({ readSessionRevision: vi.fn() }));
vi.mock('@/lib/chore-revisions', () => ({ choresEtag: vi.fn(), rewardsEtag: vi.fn() }));
vi.mock('@/lib/household-day', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/household-day')>(),
  householdToday: vi.fn(),
}));

import { readBuildId } from '@/lib/build-id';
import { readConfigCached } from '@/lib/config-cache';
import { getInstalledRevision } from '@/lib/plugins';
import { readSessionRevision } from '@/lib/timer-data';
import { choresEtag, rewardsEtag } from '@/lib/chore-revisions';
import { configRevision } from '@/lib/config';
import { householdToday, hubTimezone } from '@/lib/household-day';
import { wallEtag } from '@/lib/wall-config';
import { readDisplayRevisions } from '@/lib/display-revisions';

const CONFIG = { screens: [], settings: { timezone: 'UTC' } } as unknown as ScreenConfiguration;

beforeEach(() => {
  vi.mocked(readBuildId).mockResolvedValue('build-1');
  vi.mocked(readConfigCached).mockResolvedValue(CONFIG);
  vi.mocked(getInstalledRevision).mockResolvedValue('plugins-1');
  vi.mocked(readSessionRevision).mockResolvedValue('timer-1');
  vi.mocked(householdToday).mockResolvedValue('2026-09-25');
  vi.mocked(choresEtag).mockImplementation(async (today) => `"chores-${today}"`);
  vi.mocked(rewardsEtag).mockImplementation(async (today) => `"rewards-${today}"`);
});

describe('readDisplayRevisions', () => {
  it("names the config by the exact ETag a wall's config read is answered with", async () => {
    expect(await readDisplayRevisions()).toEqual({
      buildId: 'build-1',
      plugins: 'plugins-1',
      config: wallEtag(configRevision(CONFIG), hubTimezone()),
      timer: 'timer-1',
      chores: '"chores-2026-09-25"',
      rewards: '"rewards-2026-09-25"',
    });
  });

  it("names the chores and rewards by the ETags their reads answer with on the household's day", async () => {
    vi.mocked(householdToday).mockResolvedValue('2026-09-26');

    const revisions = await readDisplayRevisions();

    expect(choresEtag).toHaveBeenCalledWith('2026-09-26');
    expect(rewardsEtag).toHaveBeenCalledWith('2026-09-26');
    expect(revisions).toMatchObject({ chores: '"chores-2026-09-26"', rewards: '"rewards-2026-09-26"' });
  });

  it('leaves out only the field it could not work out', async () => {
    vi.mocked(readConfigCached).mockRejectedValue(new Error('config.json is corrupt'));
    vi.mocked(readSessionRevision).mockRejectedValue(new Error('unreadable'));
    vi.mocked(choresEtag).mockRejectedValue(new Error('EACCES'));

    const revisions = await readDisplayRevisions();

    expect(revisions.config).toBeUndefined();
    expect(revisions.timer).toBeUndefined();
    expect(revisions.chores).toBeUndefined();
    expect(revisions).toMatchObject({ buildId: 'build-1', plugins: 'plugins-1', rewards: '"rewards-2026-09-25"' });
  });
});
