import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('@/lib/build-id', () => ({ readBuildId: vi.fn() }));

import { readBuildId } from '@/lib/build-id';
import { choresEtag, rewardsEtag } from '@/lib/chore-revisions';
import { writeCompletions } from '@/lib/chore-completion-data';
import { writeChoreSettings } from '@/lib/chore-data';

let root: string;
const put = (file: string, data: unknown) => fs.writeFile(path.join(root, 'data', file), JSON.stringify(data));

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-chore-revisions-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  vi.mocked(readBuildId).mockResolvedValue('build-1');
  await put('chores.json', { chores: [] });
  await put('chore-completions.json', { completions: [] });
  await put('rewards.json', { rewards: [], balances: {}, redemptions: [] });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('choresEtag', () => {
  it('stays the same while nothing changes', async () => {
    expect(await choresEtag('2026-09-25')).toBe(await choresEtag('2026-09-25'));
  });

  it('changes when a completion is saved, even to the same bytes', async () => {
    const before = await choresEtag('2026-09-25');
    // A store write lands through a rename: a new file, whatever it holds.
    await writeCompletions({ completions: [] });
    expect(await choresEtag('2026-09-25')).not.toBe(before);
  });

  it('changes when the chores or their settings are saved', async () => {
    const before = await choresEtag('2026-09-25');
    await writeChoreSettings({ grabLimit: 2, grabHold: 'day' });
    expect(await choresEtag('2026-09-25')).not.toBe(before);
  });

  it('changes with the household day, which decides what the answer drops', async () => {
    expect(await choresEtag('2026-09-26')).not.toBe(await choresEtag('2026-09-25'));
  });

  it('changes with the build, which can change what the same files answer', async () => {
    const before = await choresEtag('2026-09-25');
    vi.mocked(readBuildId).mockResolvedValue('build-2');
    expect(await choresEtag('2026-09-25')).not.toBe(before);
  });

  it('is unmoved by the rewards file', async () => {
    const before = await choresEtag('2026-09-25');
    await put('rewards.json', { rewards: [], balances: { ada: 3 }, redemptions: [] });
    expect(await choresEtag('2026-09-25')).toBe(before);
  });

  it('works out a revision for a household with no chore files yet', async () => {
    await fs.rm(path.join(root, 'data', 'chores.json'));
    await fs.rm(path.join(root, 'data', 'chore-completions.json'));
    const missing = await choresEtag('2026-09-25');
    expect(missing).toMatch(/^"[0-9a-f]{24}"$/);
    await put('chore-completions.json', { completions: [] });
    expect(await choresEtag('2026-09-25')).not.toBe(missing);
  });
});

describe('rewardsEtag', () => {
  it('changes when the rewards file changes and not when the chores do', async () => {
    const before = await rewardsEtag('2026-09-25');
    await writeCompletions({ completions: [] });
    expect(await rewardsEtag('2026-09-25')).toBe(before);
    await put('rewards.json', { rewards: [], balances: { ada: 3 }, redemptions: [] });
    expect(await rewardsEtag('2026-09-25')).not.toBe(before);
  });

  it('changes with the household day, which decides which redemptions have aged out', async () => {
    expect(await rewardsEtag('2026-09-26')).not.toBe(await rewardsEtag('2026-09-25'));
  });
});
