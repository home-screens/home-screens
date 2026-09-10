import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/family-data', () => ({ readFamilyData: vi.fn(), settleFamilyMigration: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/data-transaction', () => ({
  assertStillOwned: async () => {},
  durableRemove: async (file: string) => {
    const { promises: fs } = await import('fs');
    await fs.rm(file, { force: true });
  },
  withDataTransaction: (operation: () => Promise<unknown>) => operation(),
  onDataTransactionCommit: vi.fn(),
}));
vi.mock('@/lib/reward-data', () => ({ readRewardData: vi.fn(), redeemReward: vi.fn() }));

import { GET, POST } from '../route';
import { readFamilyData } from '@/lib/family-data';
import { readRewardData, redeemReward } from '@/lib/reward-data';

const member = { id: 'm1', name: 'Current family name', color: '#aabbcc', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const reward = { id: 'r1', name: 'Movie', emoji: '', description: '', cost: 2, memberIds: [], enabled: true };
const data = { rewards: [reward], balances: { m1: 5 }, redemptions: [] };
const request = (memberId = 'm1') => new NextRequest('http://localhost/api/rewards', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rewardId: 'r1', memberId }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFamilyData).mockResolvedValue({ members: [member], migrated: true });
  vi.mocked(readRewardData).mockResolvedValue(data);
  vi.mocked(redeemReward).mockResolvedValue({ ...data, balances: { m1: 3 } });
});

describe('/api/rewards family identities', () => {
  it('keeps rewards available to the public kid view', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data);
  });

  it('uses the current family name in redemption history', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(redeemReward).toHaveBeenCalledWith(reward, 'm1', member.name);
    expect((await response.json()).balances).toEqual({ m1: 3 });
  });

  it('refuses a deleted member even when a stale balance remains', async () => {
    vi.mocked(readFamilyData).mockResolvedValue({ members: [], migrated: true });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(redeemReward).not.toHaveBeenCalled();
  });

  it('preserves member-specific reward eligibility', async () => {
    vi.mocked(readRewardData).mockResolvedValue({ ...data, rewards: [{ ...reward, memberIds: ['other'] }] });
    expect((await POST(request())).status).toBe(403);
    expect(redeemReward).not.toHaveBeenCalled();
  });
});
