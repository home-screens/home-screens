import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

import { POST as putBack } from '../route';
import { isoDateInTZ } from '@/lib/timezone';
import { grabState, type BonusChore } from '@/lib/chore-bonus';

const now = '2026-09-09T12:00:00.000Z';
let root: string;
const put = (file: string, data: unknown) => fs.writeFile(path.join(root, 'data', file), JSON.stringify(data, null, 2));
const read = async (file: string) => JSON.parse(await fs.readFile(path.join(root, 'data', file), 'utf8'));
const request = (choreId: string) => new NextRequest('http://localhost/api/chores/put-back', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choreId }),
});
const garage = {
  id: 'garage', name: 'Clean out the garage', emoji: '', points: 20, frequency: 'daily', daysOfWeek: [], timeOfDay: 'anytime',
  assigneeIds: ['ada'], rotation: 'fixed', bonus: { claim: 'first', comesBack: 'manual' },
};

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-chore-put-back-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await put('family.json', { members: [{ id: 'ada', name: 'Ada', color: '#60a5fa', createdAt: now, updatedAt: now }], migrated: true });
  await put('chores.json', { chores: [garage, { ...garage, id: 'car', bonus: { claim: 'first', comesBack: 'daily' } }] });
  await put('chore-completions.json', { completions: [{ choreId: 'garage', memberId: 'ada', date: isoDateInTZ(), at: '2000-01-01T00:00:00.000Z' }] });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('POST /api/chores/put-back', () => {
  it('opens a done chore again and keeps the completion that paid for it', async () => {
    const before = await read('chore-completions.json');
    expect(grabState(garage as BonusChore, isoDateInTZ(), { completions: before.completions, grabs: [], bonusResets: {} }, 'day', ['ada'], isoDateInTZ()).status).toBe('done');
    const res = await putBack(request('garage'), undefined);
    expect(res.status).toBe(200);
    const after = await read('chore-completions.json');
    expect(after.completions).toHaveLength(1);
    expect(grabState(garage as BonusChore, isoDateInTZ(), { completions: after.completions, grabs: [], bonusResets: after.bonusResets }, 'day', ['ada'], isoDateInTZ()))
      .toEqual({ status: 'open' });
  });

  it('only puts back a chore that comes back that way', async () => {
    expect((await putBack(request('car'), undefined)).status).toBe(400);
    expect((await putBack(request('gone'), undefined)).status).toBe(404);
  });
});
