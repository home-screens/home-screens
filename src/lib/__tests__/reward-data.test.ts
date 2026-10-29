import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { RewardData, RewardDefinition } from '../reward-data';

let tmpDir: string;
let origCwd: () => string;

// Re-imported per test so the internal `opQueue` is reset between cases.
// Without vi.resetModules() each test, a failed enqueueOp in one test could
// poison the shared queue and make later tests behave unpredictably.
let mod: typeof import('../reward-data');

async function writeRewardsFile(data: RewardData): Promise<void> {
  const dataDir = path.join(tmpDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'rewards.json'), JSON.stringify(data));
}

async function readRewardsFile(): Promise<RewardData> {
  const raw = await fs.readFile(path.join(tmpDir, 'data', 'rewards.json'), 'utf-8');
  return JSON.parse(raw);
}

const MOVIE_NIGHT: RewardDefinition = {
  id: 'r-movie',
  name: 'Movie night',
  emoji: '🎬',
  cost: 10,
  description: 'Pick a movie',
  memberIds: [],
  enabled: true,
};

const ICE_CREAM: RewardDefinition = {
  id: 'r-ice',
  name: 'Ice cream',
  emoji: '🍦',
  cost: 5,
  description: 'One scoop',
  memberIds: ['alice', 'bob'],
  enabled: true,
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-rewards-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;

  vi.resetModules();
  mod = await import('../reward-data');
});

afterEach(async () => {
  process.cwd = origCwd;
  vi.useRealTimers();
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('readRewardData', () => {
  it('returns empty default when file does not exist', async () => {
    const data = await mod.readRewardData();
    expect(data).toEqual({ rewards: [], balances: {}, redemptions: [] });
  });

  it('reads existing data from disk', async () => {
    await writeRewardsFile({
      rewards: [MOVIE_NIGHT],
      balances: { alice: 15 },
      redemptions: [],
    });

    const data = await mod.readRewardData();
    expect(data.rewards).toHaveLength(1);
    expect(data.rewards[0].name).toBe('Movie night');
    expect(data.balances.alice).toBe(15);
  });

  it('purges redemptions older than the 90-day cutoff', async () => {
    const now = new Date('2026-04-08T12:00:00Z');
    const old = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

    await writeRewardsFile({
      rewards: [],
      balances: {},
      redemptions: [
        { id: 'old', rewardId: 'r', rewardName: 'Old', memberId: 'a', memberName: 'A', cost: 1, redeemedAt: old },
        { id: 'new', rewardId: 'r', rewardName: 'New', memberId: 'a', memberName: 'A', cost: 1, redeemedAt: fresh },
      ],
    });

    vi.useFakeTimers();
    vi.setSystemTime(now);

    const data = await mod.readRewardData();
    expect(data.redemptions).toHaveLength(1);
    expect(data.redemptions[0].id).toBe('new');
  });

  it('returns original object reference when nothing needs purging (fast path)', async () => {
    // The implementation short-circuits when no redemptions are stale.
    // This protects the "no spurious rewrites" property: purgeOldRedemptions
    // returns the same data object instead of a new one when nothing changed.
    const fresh = new Date().toISOString();
    await writeRewardsFile({
      rewards: [],
      balances: {},
      redemptions: [
        { id: 'new', rewardId: 'r', rewardName: 'New', memberId: 'a', memberName: 'A', cost: 1, redeemedAt: fresh },
      ],
    });

    const data = await mod.readRewardData();
    expect(data.redemptions).toHaveLength(1);
  });
});

describe('updateRewardDefinitions', () => {
  it('replaces rewards while preserving balances and redemptions', async () => {
    await writeRewardsFile({
      rewards: [MOVIE_NIGHT],
      balances: { alice: 20 },
      redemptions: [
        {
          id: 'red-1',
          rewardId: 'r-old',
          rewardName: 'Old reward',
          memberId: 'alice',
          memberName: 'Alice',
          cost: 3,
          redeemedAt: new Date().toISOString(),
        },
      ],
    });

    const result = await mod.updateRewardDefinitions([ICE_CREAM]);

    expect(result.rewards).toHaveLength(1);
    expect(result.rewards[0].id).toBe('r-ice');
    expect(result.balances.alice).toBe(20);
    expect(result.redemptions).toHaveLength(1);
    expect(result.redemptions[0].rewardName).toBe('Old reward');
  });

  it('persists the replacement to disk', async () => {
    await mod.updateRewardDefinitions([MOVIE_NIGHT, ICE_CREAM]);
    const onDisk = await readRewardsFile();
    expect(onDisk.rewards.map((r) => r.id)).toEqual(['r-movie', 'r-ice']);
  });
});

describe('adjustPoints', () => {
  it('initializes a new member balance from zero and records the move', async () => {
    const result = await mod.adjustPoints('alice', 5, 'Helped with the groceries');
    expect(result.balances.alice).toBe(5);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments![0]).toMatchObject({ memberId: 'alice', delta: 5, reason: 'Helped with the groceries' });
    expect(result.adjustments![0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('adds to an existing balance, and leaves the reason off a row that has none', async () => {
    await mod.adjustPoints('alice', 3);
    const result = await mod.adjustPoints('alice', 4);
    expect(result.balances.alice).toBe(7);
    expect(result.adjustments!.map((a) => a.delta)).toEqual([3, 4]);
    expect('reason' in result.adjustments![1]).toBe(false);
  });

  it('does not disturb other members balances', async () => {
    await mod.adjustPoints('alice', 5);
    await mod.adjustPoints('bob', 2);
    const result = await mod.adjustPoints('alice', 1);
    expect(result.balances).toEqual({ alice: 6, bob: 2 });
  });

  it('subtracts from an existing balance', async () => {
    await mod.adjustPoints('alice', 10);
    const result = await mod.adjustPoints('alice', -3);
    expect(result.balances.alice).toBe(7);
    expect(result.adjustments![1].delta).toBe(-3);
  });

  it('floors at zero and records only what came off', async () => {
    await mod.adjustPoints('alice', 2);
    const result = await mod.adjustPoints('alice', -10);
    expect(result.balances.alice).toBe(0);
    expect(result.adjustments![1].delta).toBe(-2);
  });

  it('writes nothing when taking from a member with nothing', async () => {
    const result = await mod.adjustPoints('ghost', -5);
    expect(result.balances.ghost).toBeUndefined();
    expect(result.adjustments).toBeUndefined();
  });

  it('purges adjustments older than the 90-day cutoff along with redemptions', async () => {
    const now = new Date('2026-04-08T12:00:00Z');
    const old = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await writeRewardsFile({
      rewards: [], balances: { a: 1 }, redemptions: [],
      adjustments: [
        { id: 'old', memberId: 'a', delta: 1, at: old },
        { id: 'new', memberId: 'a', delta: 1, at: fresh },
      ],
    });
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const data = await mod.readRewardData();
    expect(data.adjustments!.map((a) => a.id)).toEqual(['new']);
    // A mutation persists the purge, as it does for redemptions.
    await mod.adjustPoints('a', 1);
    expect((await readRewardsFile()).adjustments!.map((a) => a.id)).toEqual(['new', expect.any(String)]);
  });
});

describe('setSavingsGoal', () => {
  it('records the reward a member is saving for', async () => {
    const result = await mod.setSavingsGoal('alice', 'r-movie');
    expect(result.goals).toEqual({ alice: 'r-movie' });
    expect((await readRewardsFile()).goals).toEqual({ alice: 'r-movie' });
  });

  it('replaces an earlier pick and leaves other members alone', async () => {
    await mod.setSavingsGoal('alice', 'r-movie');
    await mod.setSavingsGoal('bob', 'r-ice');
    const result = await mod.setSavingsGoal('alice', 'r-ice');
    expect(result.goals).toEqual({ alice: 'r-ice', bob: 'r-ice' });
  });

  it('clears a goal with null, and drops the key once nobody is saving', async () => {
    await mod.setSavingsGoal('alice', 'r-movie');
    const result = await mod.setSavingsGoal('alice', null);
    expect('goals' in result).toBe(false);
    expect('goals' in (await readRewardsFile())).toBe(false);
  });

  it('clears the goal when that reward is redeemed, and keeps a different one', async () => {
    await mod.writeRewardData({ rewards: [MOVIE_NIGHT, ICE_CREAM], balances: { alice: 20, bob: 20 }, redemptions: [], goals: { alice: 'r-movie', bob: 'r-movie' } });
    await mod.redeemReward(ICE_CREAM, 'alice', 'Alice');
    expect((await readRewardsFile()).goals).toEqual({ alice: 'r-movie', bob: 'r-movie' });
    await mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice');
    expect((await readRewardsFile()).goals).toEqual({ bob: 'r-movie' });
  });

  it('drops goals whose reward is deleted from the list', async () => {
    await mod.writeRewardData({ rewards: [MOVIE_NIGHT, ICE_CREAM], balances: {}, redemptions: [], goals: { alice: 'r-movie', bob: 'r-ice' } });
    const result = await mod.updateRewardDefinitions([ICE_CREAM]);
    expect(result.goals).toEqual({ bob: 'r-ice' });
  });
});

describe('planPointsMove', () => {
  it('plans a credit without publishing it', async () => {
    await mod.adjustPoints('alice', 10);
    const plan = await mod.planPointsMove('alice', 5);

    expect(plan.balance).toBe(15);
    expect(plan.wentNegative).toBe(false);
    expect(plan.change?.path).toBe('data/rewards.json');
    // Planned, not written: disk still holds the pre-move balance until the
    // caller commits the change alongside whatever else it is publishing.
    expect((await readRewardsFile()).balances.alice).toBe(10);
    expect(JSON.parse(plan.change!.after!).balances.alice).toBe(15);
  });

  it('allows the balance to go negative and signals it', async () => {
    await mod.adjustPoints('alice', 2);
    const plan = await mod.planPointsMove('alice', -5);
    expect(plan.balance).toBe(-3);
    expect(plan.wentNegative).toBe(true);
  });

  it('treats a missing member as a zero starting balance', async () => {
    const plan = await mod.planPointsMove('ghost', -5);
    expect(plan.balance).toBe(-5);
    expect(plan.wentNegative).toBe(true);
  });

  it('blocks redemptions while the balance is negative', async () => {
    await mod.adjustPoints('alice', 2);
    await mod.adjustPoints('alice', -10); // floors at 0
    await mod.writeRewardData({ rewards: [MOVIE_NIGHT], balances: { alice: -8 }, redemptions: [] });
    await expect(mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice')).rejects.toThrow('Insufficient balance');
  });
});

describe('redeemReward', () => {
  it('throws Insufficient balance when the member cannot afford it', async () => {
    await mod.adjustPoints('alice', 3);
    await expect(mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice')).rejects.toThrow('Insufficient balance');
  });

  it('leaves the balance untouched on a failed redemption', async () => {
    await mod.adjustPoints('alice', 3);
    await expect(mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice')).rejects.toThrow();
    const data = await mod.readRewardData();
    expect(data.balances.alice).toBe(3);
    expect(data.redemptions).toHaveLength(0);
  });

  it('debits cost and records a redemption on success', async () => {
    await mod.adjustPoints('alice', 15);
    const result = await mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice');

    expect(result.balances.alice).toBe(5); // 15 - 10
    expect(result.redemptions).toHaveLength(1);
    const redemption = result.redemptions[0];
    expect(redemption.rewardId).toBe('r-movie');
    expect(redemption.rewardName).toBe('Movie night'); // snapshot
    expect(redemption.memberId).toBe('alice');
    expect(redemption.memberName).toBe('Alice'); // snapshot
    expect(redemption.cost).toBe(10); // snapshot — cost at time of redemption
    expect(redemption.id).toBeTypeOf('string');
    expect(redemption.redeemedAt).toBeTypeOf('string');
  });

  it('appends rather than replacing existing redemption history', async () => {
    await mod.adjustPoints('alice', 25);
    await mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice');
    const result = await mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice');
    expect(result.redemptions).toHaveLength(2);
    expect(result.balances.alice).toBe(5); // 25 - 10 - 10
  });

  it('allows redeeming exactly the balance (boundary)', async () => {
    await mod.adjustPoints('alice', 10);
    const result = await mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice');
    expect(result.balances.alice).toBe(0);
    expect(result.redemptions).toHaveLength(1);
  });
});

describe('enqueueOp serialization', () => {
  it('serializes concurrent credits so none are lost', async () => {
    // Fire a batch of concurrent credit operations. If the op queue were
    // broken (read-modify-write races) the final balance would undercount.
    const ops = Array.from({ length: 20 }, () => mod.adjustPoints('alice', 1));
    await Promise.all(ops);
    const data = await mod.readRewardData();
    expect(data.balances.alice).toBe(20);
  });

  it('recovers from a failed op without poisoning the queue', async () => {
    await mod.adjustPoints('alice', 3);
    await expect(mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice')).rejects.toThrow('Insufficient balance');
    // Subsequent ops should still work
    const result = await mod.adjustPoints('alice', 10);
    expect(result.balances.alice).toBe(13);
  });
});

/* ─── Purge persistence ───────────────────────────
 * `readRewardData` only purges the copy it returns. Every mutation used to
 * spread the raw on-disk value, so a credit or a redemption wrote the expired
 * rows straight back and the 90-day window never actually took effect on disk.
 */

describe('redemption purge persistence', () => {
  const NOW = new Date('2026-04-08T12:00:00Z');
  const stale = (id: string) => ({
    id,
    rewardId: 'r',
    rewardName: 'Old',
    memberId: 'a',
    memberName: 'A',
    cost: 1,
    redeemedAt: new Date(NOW.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const recent = (id: string) => ({
    id,
    rewardId: 'r',
    rewardName: 'New',
    memberId: 'a',
    memberName: 'A',
    cost: 1,
    redeemedAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  });

  async function seedStale(): Promise<void> {
    await writeRewardsFile({
      rewards: [MOVIE_NIGHT],
      balances: { alice: 15 },
      redemptions: [stale('gone'), recent('kept')],
    });
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  }

  it('drops expired redemptions from disk when giving tickets', async () => {
    await seedStale();
    await mod.adjustPoints('alice', 3);

    const onDisk = await readRewardsFile();
    expect(onDisk.redemptions.map((r) => r.id)).toEqual(['kept']);
    expect(onDisk.balances.alice).toBe(18);
  });

  it('drops expired redemptions from disk when taking tickets', async () => {
    await seedStale();
    await mod.adjustPoints('alice', -2);

    const onDisk = await readRewardsFile();
    expect(onDisk.redemptions.map((r) => r.id)).toEqual(['kept']);
    expect(onDisk.balances.alice).toBe(13);
  });

  it('drops expired redemptions from the planned image on planPointsMove', async () => {
    await seedStale();
    const plan = await mod.planPointsMove('alice', -20);

    const planned = JSON.parse(plan.change!.after!);
    expect(planned.redemptions.map((r: { id: string }) => r.id)).toEqual(['kept']);
    expect(planned.balances.alice).toBe(-5);
  });

  it('drops expired redemptions from disk on redeemReward', async () => {
    await seedStale();
    await mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice');

    const onDisk = await readRewardsFile();
    // The expired row is gone; the brand new one is kept alongside the recent one.
    expect(onDisk.redemptions.map((r) => r.id)).toContain('kept');
    expect(onDisk.redemptions.map((r) => r.id)).not.toContain('gone');
    expect(onDisk.redemptions).toHaveLength(2);
    expect(onDisk.balances.alice).toBe(5);
  });

  it('leaves the bytes alone on the raw restore write', async () => {
    // writeRewardData is the restore path: it must land exactly what it is
    // given, expired rows included, rather than silently editing a backup.
    await seedStale();
    await mod.writeRewardData({
      rewards: [],
      balances: {},
      redemptions: [stale('from-backup')],
    });

    const onDisk = await readRewardsFile();
    expect(onDisk.redemptions.map((r) => r.id)).toEqual(['from-backup']);
  });
});
