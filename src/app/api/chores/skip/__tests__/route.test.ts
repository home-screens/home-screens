import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

import { POST as skip } from '../route';
import { POST as tick } from '../../route';
import { requireSession } from '@/lib/auth';
import { isoDateInTZ } from '@/lib/timezone';

const now = '2026-09-09T12:00:00.000Z';
const member = (id: string) => ({ id, name: id, color: '#60a5fa', createdAt: now, updatedAt: now });
let root: string;
const put = (file: string, data: unknown) => fs.writeFile(path.join(root, 'data', file), JSON.stringify(data, null, 2));
const read = async (file: string) => JSON.parse(await fs.readFile(path.join(root, 'data', file), 'utf8'));
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const skipIt = (memberIds: string[], skipped = true, choreId = 'bed') =>
  skip(post('/api/chores/skip', { choreId, memberIds, date: isoDateInTZ(), skipped }), undefined);

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-chore-skip-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await put('family.json', { members: ['ada', 'bram', 'mom'].map(member), migrated: true });
  await put('chores.json', { chores: [
    { id: 'bed', name: 'Make your bed', emoji: '', points: 1, frequency: 'daily', daysOfWeek: [], timeOfDay: 'morning', assigneeIds: ['ada', 'bram'], rotation: 'fixed' },
    { id: 'car', name: 'Wash the car', emoji: '', points: 5, frequency: 'daily', daysOfWeek: [], timeOfDay: 'anytime', assigneeIds: ['ada'], rotation: 'fixed', bonus: { claim: 'first', comesBack: 'daily' } },
  ] });
  await put('chore-completions.json', { completions: [{ choreId: 'bed', memberId: 'bram', date: isoDateInTZ() }] });
  await put('rewards.json', { rewards: [], balances: {}, redemptions: [] });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('POST /api/chores/skip', () => {
  it('marks not today for the people who have not done it, and leaves a done one done', async () => {
    const res = await skipIt(['ada', 'bram']);
    expect(res.status).toBe(200);
    const { completions } = await read('chore-completions.json');
    expect(completions).toEqual([
      { choreId: 'bed', memberId: 'bram', date: isoDateInTZ() },
      expect.objectContaining({ choreId: 'bed', memberId: 'ada', date: isoDateInTZ(), status: 'skipped' }),
    ]);
  });

  it('takes the mark away again', async () => {
    await skipIt(['ada']);
    await skipIt(['ada'], false);
    expect((await read('chore-completions.json')).completions).toHaveLength(1);
  });

  it('turns a not today into done when the chore is ticked after all', async () => {
    await skipIt(['ada']);
    const res = await tick(post('/api/chores', { choreId: 'bed', memberId: 'ada', date: isoDateInTZ(), direction: 'complete' }));
    expect(res.status).toBe(200);
    const ada = (await read('chore-completions.json')).completions.filter((c: { memberId: string }) => c.memberId === 'ada');
    expect(ada).toEqual([expect.not.objectContaining({ status: 'skipped' })]);
  });

  it('refuses people who do not have the chore, and bonus chores', async () => {
    expect((await skipIt(['mom'])).status).toBe(400);
    expect((await skipIt(['ada'], true, 'car')).status).toBe(400);
  });

  it('needs a grown-up', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    expect((await skipIt(['ada'])).status).toBe(401);
  });
});
