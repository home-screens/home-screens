import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Fully mock every store so we can deterministically force a mid-bundle write
// failure and assert the route rolls back the writes that already landed.
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
}));
vi.mock('@/lib/chore-data', () => ({
  readChoreData: vi.fn(),
  writeChoreData: vi.fn(),
}));
vi.mock('@/lib/chore-completion-data', () => ({
  readCompletions: vi.fn(),
  writeCompletions: vi.fn(),
}));
vi.mock('@/lib/meal-data', () => ({
  readMealData: vi.fn(),
  writeMealData: vi.fn(),
}));
vi.mock('@/lib/reward-data', () => ({
  readRewardData: vi.fn(),
  writeRewardData: vi.fn(),
}));
vi.mock('@/lib/backup-state', () => ({
  readBackupState: vi.fn(),
  writeBackupState: vi.fn().mockResolvedValue(undefined),
}));
// validateDisplays passes so the restore reaches the write phase.
vi.mock('@/lib/display-filter', () => ({
  validateDisplays: vi.fn().mockReturnValue(null),
}));

import { POST } from '@/app/api/backup/route';
import { readConfig, writeConfig } from '@/lib/config';
import { readChoreData, writeChoreData } from '@/lib/chore-data';
import { readCompletions, writeCompletions } from '@/lib/chore-completion-data';
import { readMealData, writeMealData } from '@/lib/meal-data';
import { readRewardData, writeRewardData } from '@/lib/reward-data';

const snapshotConfig = { snapshot: 'config', screens: [], settings: {} };
const snapshotChores = { snapshot: 'chores' };
const snapshotCompletions = { snapshot: 'completions' };

const bundle = {
  _type: 'home-screens-backup',
  config: { restored: 'config', screens: [{ id: 'x', modules: [] }], settings: {} },
  chores: { restored: 'chores' },
  choreCompletions: { restored: 'completions' },
  meals: { restored: 'meals' },
  rewards: { restored: 'rewards' },
};

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Snapshots the handler captures before writing.
  vi.mocked(readConfig).mockResolvedValue(snapshotConfig as never);
  vi.mocked(readChoreData).mockResolvedValue(snapshotChores as never);
  vi.mocked(readCompletions).mockResolvedValue(snapshotCompletions as never);
  vi.mocked(readMealData).mockResolvedValue({ snapshot: 'meals' } as never);
  vi.mocked(readRewardData).mockResolvedValue({ snapshot: 'rewards' } as never);

  // Every write succeeds by default; individual tests override.
  vi.mocked(writeConfig).mockResolvedValue(undefined);
  vi.mocked(writeChoreData).mockResolvedValue(undefined);
  vi.mocked(writeCompletions).mockResolvedValue(undefined);
  vi.mocked(writeMealData).mockResolvedValue(undefined);
  vi.mocked(writeRewardData).mockResolvedValue(undefined);
});

describe('POST /api/backup — cross-file rollback', () => {
  it('rolls back landed writes when a later write fails', async () => {
    // Meals is the 4th write in the sequence; fail it.
    vi.mocked(writeMealData).mockRejectedValueOnce(new Error('disk full'));

    const res = await POST(postReq(bundle));

    // The route rethrows, so withAuth turns it into a 500.
    expect(res.status).toBe(500);

    // Forward writes ran in order up to (and including) the failing one.
    expect(writeConfig).toHaveBeenNthCalledWith(1, bundle.config);
    expect(writeChoreData).toHaveBeenNthCalledWith(1, bundle.chores);
    expect(writeCompletions).toHaveBeenNthCalledWith(1, bundle.choreCompletions);
    expect(writeMealData).toHaveBeenCalledWith(bundle.meals);

    // The write AFTER the failure never fired.
    expect(writeRewardData).not.toHaveBeenCalled();

    // Rollback restored each landed file with its pre-restore snapshot.
    expect(writeConfig).toHaveBeenNthCalledWith(2, snapshotConfig);
    expect(writeChoreData).toHaveBeenNthCalledWith(2, snapshotChores);
    expect(writeCompletions).toHaveBeenNthCalledWith(2, snapshotCompletions);
  });

  it('does not roll back the config when the very first write fails', async () => {
    vi.mocked(writeConfig).mockRejectedValueOnce(new Error('disk full'));

    const res = await POST(postReq(bundle));

    expect(res.status).toBe(500);
    // The failed write is the only writeConfig call — no rollback write,
    // since the failing write itself either renamed or didn't touch the file.
    expect(writeConfig).toHaveBeenCalledTimes(1);
    expect(writeChoreData).not.toHaveBeenCalled();
  });

  it('commits every write and reports success when nothing fails', async () => {
    const res = await POST(postReq(bundle));

    expect(res.status).toBe(200);
    expect((await res.json()).restored).toEqual({
      config: true,
      chores: true,
      choreCompletions: true,
      meals: true,
      rewards: true,
    });
    // Each store written exactly once (no rollback path taken).
    expect(writeConfig).toHaveBeenCalledTimes(1);
    expect(writeChoreData).toHaveBeenCalledTimes(1);
    expect(writeCompletions).toHaveBeenCalledTimes(1);
    expect(writeMealData).toHaveBeenCalledTimes(1);
    expect(writeRewardData).toHaveBeenCalledTimes(1);
  });
});
