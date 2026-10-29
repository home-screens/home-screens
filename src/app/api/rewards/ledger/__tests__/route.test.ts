import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/family-data', () => ({ readFamilyData: vi.fn(), settleFamilyMigration: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/data-transaction', () => ({
  withDataTransaction: (operation: () => Promise<unknown>) => operation(),
  onDataTransactionCommit: vi.fn(),
}));
vi.mock('@/lib/reward-data', () => ({ readRewardData: vi.fn() }));
vi.mock('@/lib/chore-data', () => ({ readChoreData: vi.fn() }));
vi.mock('@/lib/chore-completion-data', () => ({ readCompletions: vi.fn(), choreMarks: (d: { completions: unknown[] }) => ({ completions: d.completions, grabs: [], bonusResets: {} }) }));
vi.mock('@/lib/config', () => ({ readConfig: vi.fn() }));

import { GET } from '../route';
import { readFamilyData } from '@/lib/family-data';
import { readRewardData } from '@/lib/reward-data';
import { readChoreData } from '@/lib/chore-data';
import { readCompletions } from '@/lib/chore-completion-data';
import { readConfig } from '@/lib/config';

const member = { id: 'm1', name: 'Bram', color: '#aabbcc', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const bed = { id: 'bed', name: 'Make your bed', emoji: '', points: 1, frequency: 'daily', daysOfWeek: [1], timeOfDay: 'morning', assigneeIds: ['m1'], rotation: 'fixed' };
const request = (member?: string) => new NextRequest(`http://localhost/api/rewards/ledger${member ? `?member=${member}` : ''}`);

beforeEach(() => {
  vi.clearAllMocks();
  const today = new Date().toISOString();
  vi.mocked(readFamilyData).mockResolvedValue({ members: [member], migrated: true });
  vi.mocked(readRewardData).mockResolvedValue({
    rewards: [], balances: { m1: 4 },
    redemptions: [{ id: 'x', rewardId: 'r', rewardName: 'Lego set', memberId: 'm1', memberName: 'Bram', cost: 10, redeemedAt: today }],
    adjustments: [{ id: 'a', memberId: 'm1', delta: 5, reason: 'Groceries', at: today }, { id: 'b', memberId: 'm2', delta: 1, at: today }],
  });
  vi.mocked(readChoreData).mockResolvedValue({ chores: [bed], settings: {} } as never);
  vi.mocked(readCompletions).mockResolvedValue({ completions: [
    { choreId: 'bed', memberId: 'm1', date: today.slice(0, 10), at: today },
    { choreId: 'bed', memberId: 'm2', date: today.slice(0, 10), at: today },
  ] });
  vi.mocked(readConfig).mockResolvedValue({ settings: {} } as never);
});

describe('GET /api/rewards/ledger', () => {
  it('answers one person\'s rows and totals, nobody else\'s', async () => {
    const res = await GET(request('m1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows.map((r: { kind: string; delta: number; title: string }) => [r.kind, r.delta, r.title])).toEqual(expect.arrayContaining([
      ['earned', 1, 'Make your bed'], ['spent', -10, 'Lego set'], ['adjusted', 5, 'Groceries'],
    ]));
    expect(json.rows).toHaveLength(3);
    expect(json.summary).toEqual({ earned: 1, spent: 10, adjusted: 5 });
  });

  it('needs a member', async () => {
    expect((await GET(request())).status).toBe(400);
  });

  it('says so when the person was removed', async () => {
    expect((await GET(request('deleted'))).status).toBe(409);
  });
});
