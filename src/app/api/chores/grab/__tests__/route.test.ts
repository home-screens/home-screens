import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

import { POST as grab } from '../route';
import { GET as readMarks, POST as tick } from '../../route';
import { POST as putBack } from '../../put-back/route';
import { localDateStr, parseISO } from '@/lib/chore-assignments';
import { isoDateInTZ } from '@/lib/timezone';

/** A date `days` before today's Monday: last week's Monday is -7, its Tuesday -6. */
function lastWeek(days: number): string {
  const d = parseISO(isoDateInTZ());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + days);
  return localDateStr(d);
}
const tickOn = (choreId: string, memberId: string, date: string, direction?: string) =>
  tick(post('/api/chores', { choreId, memberId, date, ...(direction ? { direction } : {}) }));

const now = '2026-09-09T12:00:00.000Z';
const member = (id: string) => ({ id, name: id, color: '#60a5fa', createdAt: now, updatedAt: now });
const chore = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, emoji: '', points: 5, frequency: 'daily', daysOfWeek: [], timeOfDay: 'anytime',
  assigneeIds: [], assigneeGroupIds: ['kids'], rotation: 'fixed', bonus: { claim: 'first', comesBack: 'daily' }, ...extra,
});
let root: string;
const put = (file: string, data: unknown) => fs.writeFile(path.join(root, 'data', file), JSON.stringify(data, null, 2));
const read = async (file: string) => JSON.parse(await fs.readFile(path.join(root, 'data', file), 'utf8'));
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const grabIt = (choreId: string, memberId: string, action = 'grab') => grab(post('/api/chores/grab', { choreId, memberId, action }));
const tickIt = (choreId: string, memberId: string) => tick(post('/api/chores', { choreId, memberId, date: isoDateInTZ(), direction: 'complete' }));

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-chore-grab-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await put('family.json', { members: ['ada', 'bram', 'mom'].map(member), groups: [{ id: 'kids', name: 'Kids', memberIds: ['ada', 'bram'], createdAt: now, updatedAt: now }], migrated: true });
  await put('chores.json', { chores: [chore('car'), chore('porch'), chore('read', { bonus: { claim: 'each', comesBack: 'daily' } })] });
  await put('chore-completions.json', { completions: [] });
  await put('rewards.json', { rewards: [], balances: {}, redemptions: [] });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('POST /api/chores/grab', () => {
  it('holds a chore for one person and keeps everyone else off it', async () => {
    const res = await grabIt('car', 'ada');
    expect(res.status).toBe(200);
    expect((await res.json()).grabs).toEqual([{ choreId: 'car', memberId: 'ada', date: isoDateInTZ() }]);

    const other = await grabIt('car', 'bram');
    expect(other.status).toBe(409);
    expect(await other.json()).toMatchObject({ reason: 'grabbed', memberId: 'ada' });

    const tickOther = await tickIt('car', 'bram');
    expect(tickOther.status).toBe(409);
    expect(await tickOther.json()).toMatchObject({ reason: 'grabbed', memberId: 'ada' });
  });

  it('stops at the household limit until a grab is finished or let go', async () => {
    await grabIt('car', 'ada');
    expect(await (await grabIt('porch', 'ada')).json()).toMatchObject({ reason: 'limit' });
    expect((await grabIt('car', 'ada', 'let-go')).status).toBe(200);
    expect((await grabIt('porch', 'ada')).status).toBe(200);

    await put('chores.json', { ...(await read('chores.json')), settings: { grabLimit: 0, grabHold: 'day' } });
    expect((await grabIt('car', 'ada')).status).toBe(200);
  });

  it('refuses someone it is not open to, and a chore that is not up for grabs', async () => {
    expect(await (await grabIt('car', 'mom')).json()).toMatchObject({ reason: 'not-yours' });
    expect(await (await grabIt('read', 'ada')).json()).toMatchObject({ reason: 'not-bonus' });
    expect((await grabIt('car', 'ada', 'steal')).status).toBe(400);
  });

  it('ends the grab when the holder finishes, pays them, and closes the chore to everyone', async () => {
    await grabIt('car', 'ada');
    const done = await tickIt('car', 'ada');
    expect(done.status).toBe(200);
    const body = await done.json();
    expect(body.grabs).toEqual([]);
    expect(body.rewards.balances.ada).toBe(5);
    expect(await (await grabIt('car', 'bram')).json()).toMatchObject({ reason: 'taken', memberId: 'ada' });
    expect(await (await tickIt('car', 'bram')).json()).toMatchObject({ reason: 'taken', memberId: 'ada' });
  });

  it('lets each person do an everyone-can chore once, and a repeat is a no-op', async () => {
    expect((await tickIt('read', 'ada')).status).toBe(200);
    expect((await tickIt('read', 'bram')).status).toBe(200);
    const again = await tickIt('read', 'ada');
    expect((await again.json()).changed).toBe(false);
    expect((await read('rewards.json')).balances).toEqual({ ada: 5, bram: 5 });
  });

  it('pays a put-back chore again when the same person does it again the same day, and keeps the first payment', async () => {
    await put('chores.json', { chores: [chore('garage', { points: 20, bonus: { claim: 'first', comesBack: 'manual' } })] });
    expect((await tickIt('garage', 'ada')).status).toBe(200);
    expect((await putBack(post('/api/chores/put-back', { choreId: 'garage' }), undefined)).status).toBe(200);

    const again = await (await tickIt('garage', 'ada')).json();
    expect(again.changed).toBe(true);
    expect((await read('rewards.json')).balances.ada).toBe(40);
    expect((await read('chore-completions.json')).completions.filter((c: { choreId: string }) => c.choreId === 'garage')).toHaveLength(2);

    // Un-ticking takes back only the second round's tickets.
    const undo = await (await tickOn('garage', 'ada', isoDateInTZ(), 'uncomplete')).json();
    expect(undo.changed).toBe(true);
    expect((await read('rewards.json')).balances.ada).toBe(20);
  });

  it('checks the whole week before paying a weekly bonus chore, whichever day is ticked first', async () => {
    await put('chores.json', { chores: [
      chore('car', { points: 5, bonus: { claim: 'first', comesBack: 'weekly' } }),
      chore('read', { points: 2, bonus: { claim: 'each', comesBack: 'weekly' } }),
    ] });
    expect((await tickOn('car', 'ada', lastWeek(-6))).status).toBe(200);
    const earlier = await tickOn('car', 'bram', lastWeek(-7));
    expect(earlier.status).toBe(409);
    expect(await earlier.json()).toMatchObject({ reason: 'taken', memberId: 'ada' });

    expect((await tickOn('read', 'ada', lastWeek(-6))).status).toBe(200);
    expect((await (await tickOn('read', 'ada', lastWeek(-7))).json()).changed).toBe(false);
    expect((await read('rewards.json')).balances).toEqual({ ada: 7 });
  });

  it('keeps what holds a put-back chore closed when old history is cleared, and drops grabs that lapsed', async () => {
    const old = new Date();
    old.setDate(old.getDate() - 91);
    const oldDay = localDateStr(old);
    const recent = new Date();
    recent.setDate(recent.getDate() - 3);
    const recentDay = localDateStr(recent);
    await put('chores.json', { chores: [
      chore('garage', { bonus: { claim: 'first', comesBack: 'manual' } }),
      chore('porch', { bonus: { claim: 'first', comesBack: 'manual' } }),
      chore('bed', { bonus: undefined }),
    ], settings: { grabLimit: 1, grabHold: 'until-back' } });
    await put('chore-completions.json', {
      completions: [
        { choreId: 'garage', memberId: 'ada', date: oldDay },
        { choreId: 'bed', memberId: 'ada', date: oldDay },
      ],
      // A grab of a put-back chore lasts a week under "until it comes back".
      grabs: [{ choreId: 'porch', memberId: 'bram', date: oldDay }, { choreId: 'porch', memberId: 'cleo', date: recentDay }],
    });
    const marks = await (await readMarks(new NextRequest('http://localhost/api/chores'))).json();
    expect(marks.completions).toEqual([{ choreId: 'garage', memberId: 'ada', date: oldDay }]);
    expect(marks.grabs).toEqual([{ choreId: 'porch', memberId: 'cleo', date: recentDay }]);
    expect(await (await grabIt('garage', 'bram')).json()).toMatchObject({ reason: 'taken', memberId: 'ada' });
  });

  it('109/1+38: a past-day tick keeps today\'s grab, and a backdated tick in the same week is refused while someone holds it', async () => {
    await put('chores.json', { chores: [
      chore('porch', { bonus: { claim: 'first', comesBack: 'daily' } }),
      chore('car', { bonus: { claim: 'first', comesBack: 'weekly' } }),
    ] });
    await grabIt('porch', 'ada');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect((await tickOn('porch', 'bram', localDateStr(yesterday))).status).toBe(200);
    expect((await read('chore-completions.json')).grabs).toEqual([{ choreId: 'porch', memberId: 'ada', date: isoDateInTZ() }]);

    // Weekly: a tick for any day of this week would finish the job Ada holds today.
    await grabIt('porch', 'ada', 'let-go');
    await grabIt('car', 'ada');
    const monday = lastWeek(0);
    if (monday < isoDateInTZ()) {
      const refused = await tickOn('car', 'bram', monday);
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({ reason: 'grabbed', memberId: 'ada', grabs: [{ choreId: 'car', memberId: 'ada', date: isoDateInTZ() }] });
    }
  });

  it('109/10: un-ticking a chore finished today gives it back to whoever did it', async () => {
    await grabIt('car', 'ada');
    await tickIt('car', 'ada');
    expect((await read('chore-completions.json')).grabs).toEqual([]);
    await tickOn('car', 'ada', isoDateInTZ(), 'uncomplete');
    expect((await read('chore-completions.json')).grabs).toEqual([{ choreId: 'car', memberId: 'ada', date: isoDateInTZ() }]);
    expect(await (await grabIt('car', 'bram')).json()).toMatchObject({ reason: 'grabbed', memberId: 'ada' });
  });

  it('an un-tick of a chore nobody had grabbed leaves it open', async () => {
    await tickIt('car', 'ada');
    await tickOn('car', 'ada', isoDateInTZ(), 'uncomplete');
    expect((await read('chore-completions.json')).grabs).toEqual([]);
    expect((await grabIt('car', 'bram')).status).toBe(200);
  });

  it('an un-tick hands back the grab with its own date, so the week it lasts does not restart', async () => {
    const d = parseISO(isoDateInTZ());
    d.setDate(d.getDate() - 3);
    const threeDaysAgo = localDateStr(d);
    await put('chores.json', { chores: [chore('garage', { bonus: { claim: 'first', comesBack: 'manual' } })], settings: { grabLimit: 1, grabHold: 'until-back' } });
    await put('chore-completions.json', { completions: [], grabs: [{ choreId: 'garage', memberId: 'ada', date: threeDaysAgo }] });
    await tickIt('garage', 'ada');
    expect((await read('chore-completions.json')).completions[0]).toMatchObject({ endedGrab: threeDaysAgo });
    await tickOn('garage', 'ada', isoDateInTZ(), 'uncomplete');
    expect((await read('chore-completions.json')).grabs).toEqual([{ choreId: 'garage', memberId: 'ada', date: threeDaysAgo }]);
  });

  it('grabbing a chore already held keeps the grab\'s own date', async () => {
    const d = parseISO(isoDateInTZ());
    d.setDate(d.getDate() - 3);
    const threeDaysAgo = localDateStr(d);
    await put('chores.json', { chores: [chore('garage', { bonus: { claim: 'first', comesBack: 'manual' } })], settings: { grabLimit: 1, grabHold: 'until-back' } });
    await put('chore-completions.json', { completions: [], grabs: [{ choreId: 'garage', memberId: 'ada', date: threeDaysAgo }] });
    expect((await grabIt('garage', 'ada')).status).toBe(200);
    expect((await read('chore-completions.json')).grabs).toEqual([{ choreId: 'garage', memberId: 'ada', date: threeDaysAgo }]);
  });

  it('an un-tick does not give a grab back past the grab limit', async () => {
    await grabIt('car', 'ada');
    await tickIt('car', 'ada');
    await grabIt('porch', 'ada');
    await tickOn('car', 'ada', isoDateInTZ(), 'uncomplete');
    expect((await read('chore-completions.json')).grabs).toEqual([{ choreId: 'porch', memberId: 'ada', date: isoDateInTZ() }]);
    expect((await grabIt('car', 'bram')).status).toBe(200);
  });

  it('109/11: a bonus chore is not paid on a day it does not show up', async () => {
    const other = (parseISO(isoDateInTZ()).getDay() + 1) % 7;
    await put('chores.json', { chores: [chore('lawn', { daysOfWeek: [other] })] });
    const res = await tickIt('lawn', 'ada');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'not-today' });
  });

  it('109/2: a new grab is the only one on its chore, so a stale grab never comes back', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await put('chore-completions.json', { completions: [], grabs: [{ choreId: 'porch', memberId: 'ada', date: localDateStr(yesterday) }] });
    await grabIt('porch', 'bram');
    expect((await read('chore-completions.json')).grabs).toEqual([{ choreId: 'porch', memberId: 'bram', date: isoDateInTZ() }]);
  });

  it('a grab is always for the hub\'s day, whatever day the screen sends', async () => {
    const d = parseISO(isoDateInTZ());
    d.setDate(d.getDate() + 1);
    const tomorrow = localDateStr(d);
    await grabIt('porch', 'ada');
    // A phone a day ahead cannot take the chore Ada is holding today.
    const refused = await grab(post('/api/chores/grab', { choreId: 'porch', memberId: 'bram', action: 'grab', date: tomorrow }));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ reason: 'grabbed', memberId: 'ada' });
    await grab(post('/api/chores/grab', { choreId: 'car', memberId: 'bram', action: 'grab', date: tomorrow }));
    expect((await read('chore-completions.json')).grabs).toEqual([
      { choreId: 'porch', memberId: 'ada', date: isoDateInTZ() },
      { choreId: 'car', memberId: 'bram', date: isoDateInTZ() },
    ]);
  });
});
