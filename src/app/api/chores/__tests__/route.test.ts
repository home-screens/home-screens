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
// The chore toggle plans its point move now instead of writing it, so the
// completion and the points can be published in one commit. One planner
// serves both directions: a positive delta credits, a negative one debits.
vi.mock('@/lib/reward-data', () => ({
  planPointsMove: vi.fn(),
}));

vi.mock('@/lib/family-data', () => ({ readFamilyData: vi.fn(), settleFamilyMigration: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/data-transaction', () => ({
  durableRemove: async (file: string) => {
    const { promises: fs } = await import('fs');
    await fs.rm(file, { force: true });
  },
  getDataRoot: () => process.cwd(),
  onDataTransactionCommit: vi.fn(),
  withDataTransaction: (operation: () => Promise<unknown>) => operation(),
  durableWriteFile: async (file: string, data: string) => {
    const { promises: fs } = await import('fs');
    await fs.writeFile(file, data);
  },
  readTransactionFile: async (relative: string) => {
    const { promises: fs } = await import('fs');
    const nodePath = await import('path');
    try { return await fs.readFile(nodePath.join(process.cwd(), relative), 'utf-8'); }
    catch { return null; }
  },
  // Publishes every change in the plan, which is the property under test:
  // the completion and the points arrive in ONE call or not at all.
  commitDataTransaction: vi.fn(async (plan: { changes: Array<{ path: string; after: string | null }> }) => {
    const { promises: fs } = await import('fs');
    const nodePath = await import('path');
    for (const change of plan.changes) {
      await fs.writeFile(nodePath.join(process.cwd(), change.path), change.after ?? '');
    }
  }),
}));

import { readFamilyData } from '@/lib/family-data';
import { GET, POST } from '@/app/api/chores/route';
import { readChoreData } from '@/lib/chore-data';
import { planPointsMove } from '@/lib/reward-data';
import { commitDataTransaction } from '@/lib/data-transaction';
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

  vi.mocked(readChoreData).mockResolvedValue({ chores: choreDataFixture.chores } as never);
  vi.mocked(readFamilyData).mockResolvedValue({ members: choreDataFixture.members } as never);
  // The plan carries the post-move RewardData; the route embeds that snapshot
  // in the POST response so clients update balances without a second read.
  vi.mocked(planPointsMove).mockResolvedValue(
    plannedMove({ rewards: [], balances: { 'kid-1': 5 }, redemptions: [] }, 5),
  );
});

/** A `planPointsMove` result: an after-image for rewards.json plus the balance. */
function plannedMove(data: unknown, balance: number, wentNegative = false) {
  return {
    change: { path: 'data/rewards.json', before: null, after: JSON.stringify(data, null, 2) },
    data,
    balance,
    wentNegative,
  } as never;
}

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
      { choreId: 'chore-pts5', memberId: 'kid-1', date: recent },
      { choreId: 'chore-pts5', memberId: 'kid-1', date: stale },
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

    expect(planPointsMove).toHaveBeenCalledWith('kid-1', 5);
  });

  it('exact-debits points on remove', async () => {
    const today = daysAgo(0);

    // First call adds it...
    await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: today }),
    );
    vi.mocked(planPointsMove).mockClear();

    // ...second call removes it.
    await POST(
      makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: today }),
    );

    expect(planPointsMove).toHaveBeenCalledWith('kid-1', -5);
  });

  it('does NOT credit or debit when chore.points === 0', async () => {
    const today = daysAgo(0);

    await POST(
      makePostRequest({ choreId: 'chore-free', memberId: 'kid-1', date: today }),
    );
    await POST(
      makePostRequest({ choreId: 'chore-free', memberId: 'kid-1', date: today }),
    );

    expect(planPointsMove).not.toHaveBeenCalled();
  });

  it('does NOT credit or debit when the chore is not found', async () => {
    const today = daysAgo(0);

    await POST(
      makePostRequest({ choreId: 'chore-unknown', memberId: 'kid-1', date: today }),
    );

    expect(planPointsMove).not.toHaveBeenCalled();
  });

  it('surfaces a warning when the debit sends the balance negative', async () => {
    vi.mocked(planPointsMove).mockResolvedValue(plannedMove({} as never, -3, true));

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

  it('embeds the planned rewards snapshot in the POST response', async () => {
    // Route must surface the planner's snapshot directly, not re-read, so
    // the snapshot is race-free against concurrent toggles from another kid.
    vi.mocked(planPointsMove).mockResolvedValue(plannedMove({
      rewards: [],
      balances: { 'kid-1': 42 },
      redemptions: [],
    }, 5));

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

  it('embeds the planned rewards snapshot on un-complete', async () => {
    vi.mocked(planPointsMove).mockResolvedValue(plannedMove({ rewards: [], balances: { 'kid-1': 7 }, redemptions: [] }, 7, false));
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
    expect(planPointsMove).not.toHaveBeenCalled();
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
    vi.mocked(planPointsMove).mockResolvedValue(plannedMove({} as never, 4, false));

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

// ============================================================================
describe('POST /api/chores with direction (idempotent voice callers)', () => {
  const base = { choreId: 'chore-pts5', memberId: 'kid-1' };

  it('rejects an unknown direction value', async () => {
    const res = await POST(
      makePostRequest({ ...base, date: daysAgo(0), direction: 'flip' }),
    );
    expect(res.status).toBe(400);
  });

  it('direction complete adds the completion and reports changed: true', async () => {
    const res = await POST(
      makePostRequest({ ...base, date: daysAgo(0), direction: 'complete' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.changed).toBe(true);
    expect(json.completions).toHaveLength(1);
    expect(planPointsMove).toHaveBeenCalledWith('kid-1', 5);
  });

  it('repeated direction complete is a no-op: completion stays, no double credit', async () => {
    const today = daysAgo(0);
    await POST(makePostRequest({ ...base, date: today, direction: 'complete' }));
    vi.mocked(planPointsMove).mockClear();

    const res = await POST(
      makePostRequest({ ...base, date: today, direction: 'complete' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.changed).toBe(false);
    // The flip hazard direction exists to prevent: a repeat must NOT remove
    // the completion or move points in either direction.
    expect(json.completions).toHaveLength(1);
    expect(planPointsMove).not.toHaveBeenCalled();
    expect(json.rewards).toBeUndefined();
  });

  it('direction uncomplete removes an existing completion and debits', async () => {
    const today = daysAgo(0);
    await POST(makePostRequest({ ...base, date: today, direction: 'complete' }));
    vi.mocked(planPointsMove).mockClear();

    const res = await POST(
      makePostRequest({ ...base, date: today, direction: 'uncomplete' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.changed).toBe(true);
    expect(json.completions).toHaveLength(0);
    expect(planPointsMove).toHaveBeenCalledWith('kid-1', -5);
  });

  it('direction uncomplete on a not-done chore is a no-op with no debit', async () => {
    const res = await POST(
      makePostRequest({ ...base, date: daysAgo(0), direction: 'uncomplete' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.changed).toBe(false);
    expect(json.completions).toHaveLength(0);
    expect(planPointsMove).not.toHaveBeenCalled();
  });

  it('a plain toggle (no direction) still flips and reports changed: true both ways', async () => {
    const today = daysAgo(0);
    const res1 = await POST(makePostRequest({ ...base, date: today }));
    const json1 = await res1.json();
    expect(json1.changed).toBe(true);
    expect(json1.completions).toHaveLength(1);

    const res2 = await POST(makePostRequest({ ...base, date: today }));
    const json2 = await res2.json();
    expect(json2.changed).toBe(true);
    expect(json2.completions).toHaveLength(0);
  });
});

/* ─── Cross-file atomicity ────────────────────────
 * The completion and the points it moves used to be two independent durable
 * writes inside one coordinator hold. Nothing could interleave, but losing
 * power between them recorded the chore and credited nothing. Both are planned
 * and published in one journal commit now.
 */

describe('POST /api/chores — one commit for both files', () => {
  it('publishes the completion and its points together', async () => {
    await POST(makePostRequest({ choreId: 'chore-pts5', memberId: 'kid-1', date: daysAgo(0) }));

    expect(commitDataTransaction).toHaveBeenCalledTimes(1);
    const plan = vi.mocked(commitDataTransaction).mock.calls[0][0] as unknown as {
      kind: string; changes: Array<{ path: string; after: string | null }>;
    };
    expect(plan.kind).toBe('chore-toggle');
    expect(plan.changes.map((c) => c.path).sort()).toEqual([
      'data/chore-completions.json',
      'data/rewards.json',
    ]);
    // Both carry a real after-image, so recovery can finish either one.
    expect(plan.changes.every((c) => typeof c.after === 'string' && c.after.length > 0)).toBe(true);
  });

  it('commits only the completion for a zero-point chore', async () => {
    await POST(makePostRequest({ choreId: 'chore-free', memberId: 'kid-1', date: daysAgo(0) }));

    expect(commitDataTransaction).toHaveBeenCalledTimes(1);
    const plan = vi.mocked(commitDataTransaction).mock.calls[0][0] as unknown as {
      changes: Array<{ path: string }>;
    };
    expect(plan.changes.map((c) => c.path)).toEqual(['data/chore-completions.json']);
  });

  it('commits nothing at all when the toggle is a directional no-op', async () => {
    const body = { choreId: 'chore-pts5', memberId: 'kid-1', date: daysAgo(0), direction: 'complete' };
    await POST(makePostRequest(body));
    vi.mocked(commitDataTransaction).mockClear();

    // Already complete: no write, and no empty transaction either.
    await POST(makePostRequest(body));
    expect(commitDataTransaction).not.toHaveBeenCalled();
  });
});
