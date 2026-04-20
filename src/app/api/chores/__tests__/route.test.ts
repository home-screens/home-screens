import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- fs/promises mock: in-memory file store ---------------------------------
const fakeFs = new Map<string, string>();

vi.mock('fs', () => {
  return {
    promises: {
      readFile: vi.fn(async (p: string) => {
        if (!fakeFs.has(p)) {
          const err = new Error('ENOENT') as NodeJS.ErrnoException;
          err.code = 'ENOENT';
          throw err;
        }
        return fakeFs.get(p)!;
      }),
      writeFile: vi.fn(async (p: string, contents: string) => {
        fakeFs.set(p, contents);
      }),
      mkdir: vi.fn(async () => undefined),
      rename: vi.fn(async (from: string, to: string) => {
        if (fakeFs.has(from)) {
          fakeFs.set(to, fakeFs.get(from)!);
          fakeFs.delete(from);
        }
      }),
    },
  };
});

// --- auth mock: pass-through (matches reference test pattern) ---------------
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

// --- chore-data mock --------------------------------------------------------
vi.mock('@/lib/chore-data', () => ({
  readChoreData: vi.fn(),
  writeChoreData: vi.fn(),
}));

// --- reward-data mock -------------------------------------------------------
vi.mock('@/lib/reward-data', () => ({
  creditPoints: vi.fn(),
  debitPointsExact: vi.fn(),
}));

import { GET, POST } from '@/app/api/chores/route';
import { readChoreData } from '@/lib/chore-data';
import { creditPoints, debitPointsExact } from '@/lib/reward-data';
import { CHORE_HISTORY_DAYS } from '@/components/modules/chore-chart/types';
import { promises as fsPromises } from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'chore-completions.json');

const choreDataFixture = {
  members: [
    { id: 'kid-1', name: 'Ada', color: '#ff0000' },
    { id: 'kid-2', name: 'Ben', color: '#00ff00' },
  ],
  chores: [
    {
      id: 'chore-pts5',
      name: 'Dishes',
      emoji: 'dish',
      points: 5,
      frequency: 'daily',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      timeOfDay: 'anytime',
      assigneeIds: ['kid-1'],
      rotation: 'none',
    },
    {
      id: 'chore-free',
      name: 'Smile',
      emoji: 'smile',
      points: 0,
      frequency: 'daily',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      timeOfDay: 'anytime',
      assigneeIds: ['kid-1'],
      rotation: 'none',
    },
  ],
};

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
}

function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function seedCompletions(completions: Array<Record<string, string>>): void {
  fakeFs.set(DATA_FILE, JSON.stringify({ completions }));
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeFs.clear();

  vi.mocked(readChoreData).mockResolvedValue(choreDataFixture as never);
  // Mutations return the post-write RewardData from the shared opQueue —
  // the route embeds this snapshot in the POST response so clients can
  // update balances instantly without a second read (which would race).
  vi.mocked(creditPoints).mockResolvedValue({
    rewards: [],
    balances: { 'kid-1': 5 },
    redemptions: [],
  });
  vi.mocked(debitPointsExact).mockResolvedValue({
    data: { rewards: [], balances: { 'kid-1': 5 }, redemptions: [] },
    balance: 5,
    wentNegative: false,
  });
});

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/chores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ============================================================================
describe('GET /api/chores', () => {
  it('purges completions older than CHORE_HISTORY_DAYS, retains day 89', async () => {
    const recent = daysAgo(CHORE_HISTORY_DAYS - 1); // 89 days ago — kept
    const stale = daysAgo(CHORE_HISTORY_DAYS + 1);  // 91 days ago — purged
    seedCompletions([
      { choreId: 'chore-pts5', memberId: 'kid-1', date: recent, completedAt: 'x' },
      { choreId: 'chore-pts5', memberId: 'kid-1', date: stale, completedAt: 'y' },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.completions).toHaveLength(1);
    expect(json.completions[0].date).toBe(recent);
    expect(json.completions.some((c: { date: string }) => c.date === stale)).toBe(false);
  });

  it('returns an empty array when no completions exist', async () => {
    // fakeFs is empty — readFile throws ENOENT, route returns { completions: [] }
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ completions: [] });
  });

  it('writes back to disk when purgeOld evicts at least one completion', async () => {
    seedCompletions([
      {
        choreId: 'chore-pts5',
        memberId: 'kid-1',
        date: daysAgo(CHORE_HISTORY_DAYS + 5),
        completedAt: 'z',
      },
    ]);

    await GET();

    // Stale entry exists → purge mutates the array → enqueueOp persists the change.
    expect(fsPromises.writeFile).toHaveBeenCalled();
  });

  it('skips disk write when purgeOld is a no-op (quiescent poll)', async () => {
    // Only fresh entries — purge won't evict anything.
    seedCompletions([
      {
        choreId: 'chore-pts5',
        memberId: 'kid-1',
        date: daysAgo(0),
        completedAt: 'today',
      },
    ]);

    await GET();

    // No churn: a quiescent display polling every 15s must NOT touch the disk
    // when nothing is old enough to purge.
    expect(fsPromises.writeFile).not.toHaveBeenCalled();
  });
});

// ============================================================================
describe('POST /api/chores', () => {
  it('returns 400 when choreId is missing', async () => {
    const res = await POST(
      makePostRequest({ memberId: 'kid-1', date: daysAgo(0) }),
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when memberId is missing', async () => {
    const res = await POST(
      makePostRequest({ choreId: 'chore-pts5', date: daysAgo(0) }),
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when date is missing', async () => {
    const res = await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1' }),
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when date is malformed (uses slashes)', async () => {
    const res = await POST(
      makePostRequest({
        choreId: 'chore-pts5',
        memberId: 'kid-1',
        date: '2026/04/09',
      }),
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when date passes the regex but is not a real calendar date', async () => {
    // 2026-99-99 matches /^\d{4}-\d{2}-\d{2}$/ but is junk; isValidISODate rejects it
    // with the proper "Invalid date format" error rather than the bounds error.
    const res = await POST(
      makePostRequest({
        choreId: 'chore-pts5',
        memberId: 'kid-1',
        date: '2026-99-99',
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid date/i);
  });

  it('returns 400 when date is in the future', async () => {
    const res = await POST(
      makePostRequest({
        choreId: 'chore-pts5',
        memberId: 'kid-1',
        date: daysAhead(1),
      }),
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when date is older than the retention window', async () => {
    const res = await POST(
      makePostRequest({
        choreId: 'chore-pts5',
        memberId: 'kid-1',
        date: daysAgo(100),
      }),
    );

    expect(res.status).toBe(400);
  });

  it('accepts a valid date today and returns the new completion', async () => {
    const today = daysAgo(0);
    const res = await POST(
      makePostRequest({
        choreId: 'chore-pts5',
        memberId: 'kid-1',
        date: today,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.completions).toHaveLength(1);
    expect(json.completions[0]).toMatchObject({
      choreId: 'chore-pts5',
      memberId: 'kid-1',
      date: today,
    });
  });

  it('accepts a valid date 89 days ago (edge of retention window)', async () => {
    const edge = daysAgo(CHORE_HISTORY_DAYS - 1);
    const res = await POST(
      makePostRequest({
        choreId: 'chore-pts5',
        memberId: 'kid-1',
        date: edge,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.completions).toHaveLength(1);
    expect(json.completions[0].date).toBe(edge);
  });

  it('toggles an existing completion off when posted twice', async () => {
    const today = daysAgo(0);

    const res1 = await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: today }),
    );
    const json1 = await res1.json();
    expect(json1.completions).toHaveLength(1);

    const res2 = await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: today }),
    );
    const json2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(json2.completions).toHaveLength(0);
  });

  it('credits points on add for a chore with points > 0', async () => {
    await POST(
      makePostRequest({
        choreId: 'chore-pts5',
        memberId: 'kid-1',
        date: daysAgo(0),
      }),
    );

    expect(creditPoints).toHaveBeenCalledWith('kid-1', 5);
    expect(debitPointsExact).not.toHaveBeenCalled();
  });

  it('exact-debits points on remove', async () => {
    const today = daysAgo(0);

    // First call adds it...
    await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: today }),
    );
    vi.mocked(creditPoints).mockClear();
    vi.mocked(debitPointsExact).mockClear();

    // ...second call removes it.
    await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: today }),
    );

    expect(debitPointsExact).toHaveBeenCalledWith('kid-1', 5);
    expect(creditPoints).not.toHaveBeenCalled();
  });

  it('does NOT credit or debit when chore.points === 0', async () => {
    const today = daysAgo(0);

    await POST(
      makePostRequest({ choreId: 'chore-free', memberId: 'kid-1', date: today }),
    );
    await POST(
      makePostRequest({ choreId: 'chore-free', memberId: 'kid-1', date: today }),
    );

    expect(creditPoints).not.toHaveBeenCalled();
    expect(debitPointsExact).not.toHaveBeenCalled();
  });

  it('does NOT credit or debit when the chore is not found', async () => {
    const today = daysAgo(0);

    await POST(
      makePostRequest({ choreId: 'chore-unknown', memberId: 'kid-1', date: today }),
    );

    expect(creditPoints).not.toHaveBeenCalled();
    expect(debitPointsExact).not.toHaveBeenCalled();
  });

  it('surfaces a warning when the debit sends the balance negative', async () => {
    vi.mocked(debitPointsExact).mockResolvedValue({
      data: {} as never,
      balance: -3,
      wentNegative: true,
    });

    const today = daysAgo(0);

    // Add, then remove to trigger the debit path.
    await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: today }),
    );
    const res = await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: today }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.warning).toBeDefined();
    expect(typeof json.warning).toBe('string');
    expect(json.warning).toContain('-3');
  });

  it('embeds the post-write rewards snapshot from creditPoints in the POST response', async () => {
    // Route must surface creditPoints' return value directly — not re-read — so
    // the snapshot is race-free against concurrent toggles from another kid.
    vi.mocked(creditPoints).mockResolvedValue({
      rewards: [],
      balances: { 'kid-1': 42 },
      redemptions: [],
    });

    const res = await POST(
      makePostRequest({
        choreId: 'chore-pts5',
        memberId: 'kid-1',
        date: daysAgo(0),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.rewards).toBeDefined();
    expect(json.rewards.balances['kid-1']).toBe(42);
  });

  it('embeds the post-write rewards snapshot from debitPointsExact on un-complete', async () => {
    vi.mocked(debitPointsExact).mockResolvedValue({
      data: { rewards: [], balances: { 'kid-1': 7 }, redemptions: [] },
      balance: 7,
      wentNegative: false,
    });
    const today = daysAgo(0);

    // First add to create the completion, then remove to trigger the debit.
    await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: today }),
    );
    const res = await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: today }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.rewards.balances['kid-1']).toBe(7);
  });

  it('OMITS rewards from the response when no credit/debit happened (0-point chore)', async () => {
    // A 0-point chore doesn't touch balances, so there's no reason to make the
    // client overwrite its rewards cache — omitting the field is correct.
    const res = await POST(
      makePostRequest({
        choreId: 'chore-free',
        memberId: 'kid-1',
        date: daysAgo(0),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.rewards).toBeUndefined();
    expect(creditPoints).not.toHaveBeenCalled();
    expect(debitPointsExact).not.toHaveBeenCalled();
  });

  it('OMITS rewards from the response when the chore is not found', async () => {
    const res = await POST(
      makePostRequest({
        choreId: 'chore-unknown',
        memberId: 'kid-1',
        date: daysAgo(0),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.rewards).toBeUndefined();
  });

  it('does NOT include a warning when balance stayed non-negative', async () => {
    vi.mocked(debitPointsExact).mockResolvedValue({
      data: {} as never,
      balance: 4,
      wentNegative: false,
    });

    const today = daysAgo(0);

    await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: today }),
    );
    const res = await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: today }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.warning).toBeUndefined();
  });
});
