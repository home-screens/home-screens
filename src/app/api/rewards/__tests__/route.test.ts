import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('@/lib/family-data', () => ({ readFamilyData: vi.fn(), settleFamilyMigration: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/data-transaction', () => ({
  durableRemove: async (file: string) => {
    const { promises: fs } = await import('fs');
    await fs.rm(file, { force: true });
  },
  withDataTransaction: (operation: () => Promise<unknown>) => operation(),
  onDataTransactionCommit: vi.fn(),
  getDataRoot: () => dataRoot,
}));
vi.mock('@/lib/reward-data', () => ({ REWARDS_FILE: 'data/rewards.json', readRewardData: vi.fn(), redeemReward: vi.fn() }));

// A real directory, so the ETag comes from a real file's identity.
const dataRoot = mkdtempSync(path.join(os.tmpdir(), 'hs-rewards-route-'));
mkdirSync(path.join(dataRoot, 'data'));
const rewardsFile = path.join(dataRoot, 'data', 'rewards.json');

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

const read = (etag?: string) => new NextRequest('http://localhost/api/rewards', etag ? { headers: { 'If-None-Match': etag } } : undefined);

afterAll(() => rmSync(dataRoot, { recursive: true, force: true }));

describe('GET /api/rewards revalidation', () => {
  it('answers an unchanged read with a bodiless 304, without reading the rewards', async () => {
    writeFileSync(rewardsFile, JSON.stringify(data));
    const first = await GET(read());
    const etag = first.headers.get('ETag')!;
    expect(etag).toMatch(/^"[0-9a-f]{24}"$/);
    expect(first.headers.get('Cache-Control')).toBe('no-cache');
    vi.mocked(readRewardData).mockClear();

    const again = await GET(read(etag));

    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    expect(readRewardData).not.toHaveBeenCalled();
  });

  it('answers in full once the file changed', async () => {
    writeFileSync(rewardsFile, JSON.stringify(data));
    const etag = (await GET(read())).headers.get('ETag')!;
    writeFileSync(rewardsFile, JSON.stringify({ ...data, balances: { m1: 40 } }));

    const res = await GET(read(etag));

    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).not.toBe(etag);
  });
});

describe('/api/rewards family identities', () => {
  it('keeps rewards available to the public kid view', async () => {
    const response = await GET(read());
    expect(response.status).toBe(200);
    // Plus the revision a whole-list save of the rewards has to quote back.
    expect(await response.json()).toEqual({ ...data, revision: expect.any(String) });
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
