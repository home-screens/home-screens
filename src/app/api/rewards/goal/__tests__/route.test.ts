import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/family-data', () => ({ readFamilyData: vi.fn(), settleFamilyMigration: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/data-transaction', () => ({
  withDataTransaction: (operation: () => Promise<unknown>) => operation(),
  onDataTransactionCommit: vi.fn(),
}));
vi.mock('@/lib/reward-data', () => ({ readRewardData: vi.fn(), setSavingsGoal: vi.fn() }));

import { POST } from '../route';
import { readFamilyData } from '@/lib/family-data';
import { readRewardData, setSavingsGoal } from '@/lib/reward-data';

const member = { id: 'm1', name: 'Bram', color: '#aabbcc', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const lego = { id: 'lego', name: 'Lego set', emoji: '', description: '', cost: 10, memberIds: [], enabled: true };
const hers = { id: 'hers', name: 'Not his', emoji: '', description: '', cost: 4, memberIds: ['m2'], enabled: true };
const off = { id: 'off', name: 'Off', emoji: '', description: '', cost: 4, memberIds: [], enabled: false };
const data = { rewards: [lego, hers, off], balances: { m1: 4 }, redemptions: [] };
const request = (body: unknown) => new NextRequest('http://localhost/api/rewards/goal', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFamilyData).mockResolvedValue({ members: [member], migrated: true });
  vi.mocked(readRewardData).mockResolvedValue(data);
  vi.mocked(setSavingsGoal).mockResolvedValue({ ...data, goals: { m1: 'lego' } });
});

describe('POST /api/rewards/goal', () => {
  it('saves the reward a member is saving for and answers with every goal', async () => {
    const res = await POST(request({ memberId: 'm1', rewardId: 'lego' }));
    expect(res.status).toBe(200);
    expect(setSavingsGoal).toHaveBeenCalledWith('m1', 'lego');
    expect(await res.json()).toEqual({ goals: { m1: 'lego' } });
  });

  it('clears a goal with null without looking the reward up', async () => {
    vi.mocked(setSavingsGoal).mockResolvedValue(data);
    const res = await POST(request({ memberId: 'm1', rewardId: null }));
    expect(res.status).toBe(200);
    expect(setSavingsGoal).toHaveBeenCalledWith('m1', null);
    expect(readRewardData).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ goals: {} });
  });

  it.each([
    ['no member', { rewardId: 'lego' }],
    ['no reward', { memberId: 'm1' }],
    ['an empty reward id', { memberId: 'm1', rewardId: '' }],
  ])('refuses a body with %s', async (_label, body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(setSavingsGoal).not.toHaveBeenCalled();
  });

  it('says a reward that is gone or switched off is not there', async () => {
    expect((await POST(request({ memberId: 'm1', rewardId: 'vanished' }))).status).toBe(404);
    expect((await POST(request({ memberId: 'm1', rewardId: 'off' }))).status).toBe(404);
    expect(setSavingsGoal).not.toHaveBeenCalled();
  });

  it('refuses a reward meant for someone else', async () => {
    expect((await POST(request({ memberId: 'm1', rewardId: 'hers' }))).status).toBe(403);
    expect(setSavingsGoal).not.toHaveBeenCalled();
  });

  it('cannot save a goal for someone who was removed', async () => {
    expect((await POST(request({ memberId: 'deleted', rewardId: 'lego' }))).status).toBe(409);
    expect(setSavingsGoal).not.toHaveBeenCalled();
  });
});
