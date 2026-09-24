import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/chore-data', async () => {
  const { contentRevision } = await import('@/lib/content-revision');
  const readChoreData = vi.fn();
  return {
    readChoreData,
    writeChoreList: vi.fn(),
    readChoreSnapshot: vi.fn(async () => {
      const { chores } = await readChoreData();
      return { chores, revision: contentRevision(chores) };
    }),
  };
});

vi.mock('@/lib/family-data', () => ({ readFamilyData: vi.fn(), settleFamilyMigration: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/data-transaction', () => ({
  durableRemove: async (file: string) => {
    const { promises: fs } = await import('fs');
    await fs.rm(file, { force: true });
  },
  onDataTransactionCommit: vi.fn(),
  withDataTransaction: (operation: () => Promise<unknown>) => operation(),
  durableWriteFile: async (file: string, data: string) => {
    const { promises: fs } = await import('fs');
    await fs.writeFile(file, data);
  },
}));

import { readFamilyData } from '@/lib/family-data';
import { GET, PUT } from '@/app/api/chores/data/route';
import { readChoreData, writeChoreList } from '@/lib/chore-data';
import { contentRevision } from '@/lib/content-revision';

const emptyData = { chores: [] };
const populatedData = {
  chores: [{ id: 'c1', name: 'Dishes', emoji: 'dish', frequency: 'daily', assigneeIds: ['m1'] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFamilyData).mockResolvedValue({ members: [{ id: 'm1', name: 'Alice', color: '#ff0000', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] });
  vi.mocked(readChoreData).mockResolvedValue(emptyData as never);
  vi.mocked(writeChoreList).mockImplementation(async (chores) => ({ chores }));
});

// ------- GET tests -------

describe('GET /api/chores/data', () => {
  it('returns chore data', async () => {
    vi.mocked(readChoreData).mockResolvedValue(populatedData as never);

    const req = new NextRequest('http://localhost/api/chores/data');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).not.toHaveProperty('members');
    expect(json.chores).toHaveLength(1);
  });

  it('returns 500 when readChoreData throws', async () => {
    vi.mocked(readChoreData).mockRejectedValue(new Error('disk error'));

    const req = new NextRequest('http://localhost/api/chores/data');
    const res = await GET(req);

    expect(res.status).toBe(500);
  });
});

// ------- PUT tests -------

describe('PUT /api/chores/data', () => {
  function makePutRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/chores/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /** A body that quotes the revision a client of the current mock would hold. */
  async function makeCurrentPutRequest(body: Record<string, unknown>): Promise<NextRequest> {
    const existing = await readChoreData().catch(() => emptyData);
    return makePutRequest({ revision: contentRevision(existing.chores), ...body });
  }

  it('saves valid chore data', async () => {
    const res = await PUT(await makeCurrentPutRequest(populatedData));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(writeChoreList).toHaveBeenCalledWith(populatedData.chores);
    expect(json).not.toHaveProperty('members');
    expect(json.revision).toBe(contentRevision(populatedData.chores));
  });

  describe('revision check', () => {
    it('hands out the revision a save has to quote', async () => {
      vi.mocked(readChoreData).mockResolvedValue(populatedData as never);
      const res = await GET(new NextRequest('http://localhost/api/chores/data'));
      expect((await res.json()).revision).toBe(contentRevision(populatedData.chores));
    });

    it('refuses a write that quotes no revision', async () => {
      const res = await PUT(makePutRequest(populatedData));
      expect(res.status).toBe(400);
      expect(writeChoreList).not.toHaveBeenCalled();
    });

    /* Two phones both loaded [original]; the second to save must not drop
     * what the first added. */
    it('answers a write built from an older copy with 409 and the current list', async () => {
      vi.mocked(readChoreData).mockResolvedValue(populatedData as never);
      const res = await PUT(await makeCurrentPutRequest({ chores: [], force: true, revision: contentRevision([]) }));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.reason).toBe('revision');
      expect(json.chores).toEqual(populatedData.chores);
      expect(json.revision).toBe(contentRevision(populatedData.chores));
      expect(writeChoreList).not.toHaveBeenCalled();
    });
  });

  it('rejects stale clients that still write members with refresh_required', async () => {
    const res = await PUT(makePutRequest({ members: 'not-array', chores: [] }));

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('refresh_required');
    expect(writeChoreList).not.toHaveBeenCalled();
  });

  it('returns 400 when chores is not an array', async () => {
    const res = await PUT(makePutRequest({ chores: 'not-array' }));

    expect(res.status).toBe(400);
  });

  describe('empty overwrite protection', () => {
    it('returns 409 when overwriting non-empty data with empty payload', async () => {
      vi.mocked(readChoreData).mockResolvedValue(populatedData as never);

      const res = await PUT(await makeCurrentPutRequest({ chores: [] }));

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('empty payload');
      expect(writeChoreList).not.toHaveBeenCalled();
    });

    it('allows empty payload when existing data is also empty', async () => {
      vi.mocked(readChoreData).mockResolvedValue(emptyData as never);

      const res = await PUT(await makeCurrentPutRequest({ chores: [] }));

      expect(res.status).toBe(200);
      expect(writeChoreList).toHaveBeenCalled();
    });

    it('allows empty payload when force flag is true', async () => {
      vi.mocked(readChoreData).mockResolvedValue(populatedData as never);

      const res = await PUT(await makeCurrentPutRequest({ chores: [], force: true }));

      expect(res.status).toBe(200);
      expect(writeChoreList).toHaveBeenCalled();
    });

    it('allows empty payload when readChoreData fails (cannot verify existing)', async () => {
      vi.mocked(readChoreData).mockRejectedValue(new Error('file not found'));

      const res = await PUT(await makeCurrentPutRequest({ chores: [] }));

      expect(res.status).toBe(200);
      expect(writeChoreList).toHaveBeenCalled();
    });
  });

  it('allows non-empty payload without force flag', async () => {
    vi.mocked(readChoreData).mockResolvedValue(populatedData as never);

    const newData = {
      chores: [{ ...populatedData.chores[0], name: 'Laundry' }],
    };
    const res = await PUT(await makeCurrentPutRequest(newData));

    expect(res.status).toBe(200);
    expect(writeChoreList).toHaveBeenCalledWith(newData.chores);
  });
  it('rejects a malformed assignee list before writing', async () => {
    const res = await PUT(await makeCurrentPutRequest({ chores: [{ id: "c1", assigneeIds: "m1" }] }));
    expect(res.status).toBe(400);
    expect(writeChoreList).not.toHaveBeenCalled();
  });

  it('refuses a chore worth fewer than 0 tickets', async () => {
    const res = await PUT(await makeCurrentPutRequest({ chores: [{ ...populatedData.chores[0], points: -5 }] }));
    expect(res.status).toBe(400);
    expect(writeChoreList).not.toHaveBeenCalled();
  });

  it.each([
    { ...populatedData.chores[0], assigneeIds: ['deleted'] },
    { ...populatedData.chores[0], schedule: { deleted: [1] } },
  ])('rejects assignments to absent family members', async (chore) => {
    const res = await PUT(await makeCurrentPutRequest({ chores: [chore] }));
    expect(res.status).toBe(409);
    expect(writeChoreList).not.toHaveBeenCalled();
  });

  describe('chores handed to a group', () => {
    const member = { id: 'm1', name: 'Alice', color: '#ff0000', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const kids = { id: 'kids', name: 'Kids', memberIds: ['m1'], createdAt: member.createdAt, updatedAt: member.updatedAt };
    const groupChore = { id: 'c1', name: 'Dishes', emoji: 'dish', frequency: 'daily', assigneeIds: [], assigneeGroupIds: ['kids'] };

    it('saves a chore that names a group and nobody directly', async () => {
      vi.mocked(readFamilyData).mockResolvedValue({ members: [member], groups: [kids] });
      const res = await PUT(await makeCurrentPutRequest({ chores: [groupChore] }));
      expect(res.status).toBe(200);
      expect(writeChoreList).toHaveBeenCalledWith([groupChore]);
    });

    it('refuses a chore newly pointed at a group that was removed', async () => {
      const res = await PUT(await makeCurrentPutRequest({ chores: [groupChore] }));
      expect(res.status).toBe(409);
      expect(writeChoreList).not.toHaveBeenCalled();
    });

    it('hands a page holding an old chore list the current one, even when it names a removed group', async () => {
      const current = [{ ...groupChore, assigneeGroupIds: undefined }];
      vi.mocked(readChoreData).mockResolvedValue({ chores: current } as never);
      const stale = new NextRequest('http://localhost/api/chores/data', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chores: [groupChore], revision: contentRevision([groupChore]) }),
      });
      const res = await PUT(stale);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: 'revision', revision: contentRevision(current) });
    });

    it('hands a page holding an old chore list the current one, even when it names a removed person', async () => {
      const current = [{ id: 'c1', name: 'Dishes', emoji: 'dish', frequency: 'daily', assigneeIds: ['m1'] }];
      const held = [{ ...current[0], assigneeIds: ['m1', 'gone'] }];
      vi.mocked(readChoreData).mockResolvedValue({ chores: current } as never);
      const res = await PUT(new NextRequest('http://localhost/api/chores/data', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chores: held, revision: contentRevision(held) }),
      }));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: 'revision', chores: current });
    });

    it('still refuses a removed person on a save built from the current list', async () => {
      const res = await PUT(await makeCurrentPutRequest({ chores: [{ id: 'c1', name: 'Dishes', emoji: 'dish', frequency: 'daily', assigneeIds: ['gone'] }] }));
      expect(res.status).toBe(409);
      expect((await res.json()).reason).toBeUndefined();
      expect(writeChoreList).not.toHaveBeenCalled();
    });

    it('saves a chore that a removed group left with nobody', async () => {
      const res = await PUT(await makeCurrentPutRequest({ chores: [{ ...groupChore, assigneeGroupIds: undefined }] }));
      expect(res.status).toBe(200);
    });

    it('saves a schedule with a group row, and refuses a row for a group the chore does not name', async () => {
      vi.mocked(readFamilyData).mockResolvedValue({ members: [member], groups: [kids] });
      const scheduled = { ...groupChore, rotation: 'schedule', groupSchedule: { kids: [1, 3] } };
      expect((await PUT(await makeCurrentPutRequest({ chores: [scheduled] }))).status).toBe(200);
      expect(writeChoreList).toHaveBeenCalledWith([scheduled]);
      expect((await PUT(await makeCurrentPutRequest({ chores: [{ ...scheduled, assigneeGroupIds: undefined }] }))).status).toBe(400);
      expect((await PUT(await makeCurrentPutRequest({ chores: [{ ...scheduled, groupSchedule: { kids: [7] } }] }))).status).toBe(400);
    });

    it('refuses a group list that is not a list of ids', async () => {
      const res = await PUT(await makeCurrentPutRequest({ chores: [{ ...groupChore, assigneeGroupIds: 'kids' }] }));
      expect(res.status).toBe(400);
    });
  });

});
