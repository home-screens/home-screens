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

describe('creditPoints', () => {
  it('initializes a new member balance from zero', async () => {
    const result = await mod.creditPoints('alice', 5);
    expect(result.balances.alice).toBe(5);
  });

  it('adds to an existing balance', async () => {
    await mod.creditPoints('alice', 3);
    const result = await mod.creditPoints('alice', 4);
    expect(result.balances.alice).toBe(7);
  });

  it('does not disturb other members balances', async () => {
    await mod.creditPoints('alice', 5);
    await mod.creditPoints('bob', 2);
    const result = await mod.creditPoints('alice', 1);
    expect(result.balances).toEqual({ alice: 6, bob: 2 });
  });
});

describe('debitPoints', () => {
  it('subtracts from an existing balance', async () => {
    await mod.creditPoints('alice', 10);
    const result = await mod.debitPoints('alice', 3);
    expect(result.balances.alice).toBe(7);
  });

  it('floors at zero rather than going negative', async () => {
    await mod.creditPoints('alice', 2);
    const result = await mod.debitPoints('alice', 10);
    expect(result.balances.alice).toBe(0);
  });

  it('treats missing members as a zero balance', async () => {
    const result = await mod.debitPoints('ghost', 5);
    expect(result.balances.ghost).toBe(0);
  });
});

describe('debitPointsExact', () => {
  it('subtracts from an existing balance', async () => {
    await mod.creditPoints('alice', 10);
    const result = await mod.debitPointsExact('alice', 3);
    expect(result.balance).toBe(7);
    expect(result.wentNegative).toBe(false);
    expect(result.data.balances.alice).toBe(7);
  });

  it('allows the balance to go negative and signals it', async () => {
    await mod.creditPoints('alice', 2);
    const result = await mod.debitPointsExact('alice', 5);
    expect(result.balance).toBe(-3);
    expect(result.wentNegative).toBe(true);
    expect(result.data.balances.alice).toBe(-3);
  });

  it('treats a missing member as a zero starting balance', async () => {
    const result = await mod.debitPointsExact('ghost', 5);
    expect(result.balance).toBe(-5);
    expect(result.wentNegative).toBe(true);
    expect(result.data.balances.ghost).toBe(-5);
  });

  it('blocks redemptions while the balance is negative', async () => {
    await mod.creditPoints('alice', 2);
    await mod.debitPointsExact('alice', 10); // alice now at -8
    await expect(mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice')).rejects.toThrow('Insufficient balance');
  });
});

describe('redeemReward', () => {
  it('throws Insufficient balance when the member cannot afford it', async () => {
    await mod.creditPoints('alice', 3);
    await expect(mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice')).rejects.toThrow('Insufficient balance');
  });

  it('leaves the balance untouched on a failed redemption', async () => {
    await mod.creditPoints('alice', 3);
    await expect(mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice')).rejects.toThrow();
    const data = await mod.readRewardData();
    expect(data.balances.alice).toBe(3);
    expect(data.redemptions).toHaveLength(0);
  });

  it('debits cost and records a redemption on success', async () => {
    await mod.creditPoints('alice', 15);
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
    await mod.creditPoints('alice', 25);
    await mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice');
    const result = await mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice');
    expect(result.redemptions).toHaveLength(2);
    expect(result.balances.alice).toBe(5); // 25 - 10 - 10
  });

  it('allows redeeming exactly the balance (boundary)', async () => {
    await mod.creditPoints('alice', 10);
    const result = await mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice');
    expect(result.balances.alice).toBe(0);
    expect(result.redemptions).toHaveLength(1);
  });
});

describe('rewardCascadeDeleteMember', () => {
  it('removes the member balance', async () => {
    await mod.creditPoints('alice', 10);
    await mod.creditPoints('bob', 5);
    const result = await mod.rewardCascadeDeleteMember('alice');
    expect(result.balances).toEqual({ bob: 5 });
  });

  it('strips the member from restricted-reward memberIds', async () => {
    await mod.updateRewardDefinitions([ICE_CREAM]); // memberIds: ['alice', 'bob']
    const result = await mod.rewardCascadeDeleteMember('alice');
    expect(result.rewards[0].memberIds).toEqual(['bob']);
  });

  it('leaves open rewards (empty memberIds) untouched', async () => {
    await mod.updateRewardDefinitions([MOVIE_NIGHT]); // memberIds: []
    const result = await mod.rewardCascadeDeleteMember('alice');
    expect(result.rewards[0].memberIds).toEqual([]);
  });

  it('preserves redemption history after deletion (denormalized names survive)', async () => {
    await mod.creditPoints('alice', 15);
    await mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice');

    const result = await mod.rewardCascadeDeleteMember('alice');

    expect(result.balances.alice).toBeUndefined();
    expect(result.redemptions).toHaveLength(1);
    expect(result.redemptions[0].memberName).toBe('Alice');
  });
});

describe('enqueueOp serialization', () => {
  it('serializes concurrent credits so none are lost', async () => {
    // Fire a batch of concurrent credit operations. If the op queue were
    // broken (read-modify-write races) the final balance would undercount.
    const ops = Array.from({ length: 20 }, () => mod.creditPoints('alice', 1));
    await Promise.all(ops);
    const data = await mod.readRewardData();
    expect(data.balances.alice).toBe(20);
  });

  it('recovers from a failed op without poisoning the queue', async () => {
    await mod.creditPoints('alice', 3);
    await expect(mod.redeemReward(MOVIE_NIGHT, 'alice', 'Alice')).rejects.toThrow('Insufficient balance');
    // Subsequent ops should still work
    const result = await mod.creditPoints('alice', 10);
    expect(result.balances.alice).toBe(13);
  });
});
