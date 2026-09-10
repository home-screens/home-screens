import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/chore-data', () => ({
  readChoreData: vi.fn(),
  writeChoreData: vi.fn(),
}));

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
import { readChoreData, writeChoreData } from '@/lib/chore-data';

const emptyData = { chores: [] };
const populatedData = {
  chores: [{ id: 'c1', name: 'Dishes', emoji: 'dish', frequency: 'daily', assigneeIds: ['m1'] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFamilyData).mockResolvedValue({ members: [{ id: 'm1', name: 'Alice', color: '#ff0000', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] });
  vi.mocked(readChoreData).mockResolvedValue(emptyData as never);
  vi.mocked(writeChoreData).mockResolvedValue(undefined);
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

  it('saves valid chore data', async () => {
    const res = await PUT(makePutRequest(populatedData));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(writeChoreData).toHaveBeenCalledWith(populatedData);
    expect(json).not.toHaveProperty('members');
  });

  it('rejects stale clients that still write members with refresh_required', async () => {
    const res = await PUT(makePutRequest({ members: 'not-array', chores: [] }));

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('refresh_required');
    expect(writeChoreData).not.toHaveBeenCalled();
  });

  it('returns 400 when chores is not an array', async () => {
    const res = await PUT(makePutRequest({ chores: 'not-array' }));

    expect(res.status).toBe(400);
  });

  describe('empty overwrite protection', () => {
    it('returns 409 when overwriting non-empty data with empty payload', async () => {
      vi.mocked(readChoreData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({ chores: [] }));

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('empty payload');
      expect(writeChoreData).not.toHaveBeenCalled();
    });

    it('allows empty payload when existing data is also empty', async () => {
      vi.mocked(readChoreData).mockResolvedValue(emptyData as never);

      const res = await PUT(makePutRequest({ chores: [] }));

      expect(res.status).toBe(200);
      expect(writeChoreData).toHaveBeenCalled();
    });

    it('allows empty payload when force flag is true', async () => {
      vi.mocked(readChoreData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({ chores: [], force: true }));

      expect(res.status).toBe(200);
      expect(writeChoreData).toHaveBeenCalled();
    });

    it('allows empty payload when readChoreData fails (cannot verify existing)', async () => {
      vi.mocked(readChoreData).mockRejectedValue(new Error('file not found'));

      const res = await PUT(makePutRequest({ chores: [] }));

      expect(res.status).toBe(200);
      expect(writeChoreData).toHaveBeenCalled();
    });
  });

  it('allows non-empty payload without force flag', async () => {
    vi.mocked(readChoreData).mockResolvedValue(populatedData as never);

    const newData = {
      chores: [{ ...populatedData.chores[0], name: 'Laundry' }],
    };
    const res = await PUT(makePutRequest(newData));

    expect(res.status).toBe(200);
    expect(writeChoreData).toHaveBeenCalledWith(newData);
  });
  it('rejects a malformed assignee list before writing', async () => {
    const res = await PUT(makePutRequest({ chores: [{ id: 'c1', assigneeIds: 'm1' }] }));
    expect(res.status).toBe(400);
    expect(writeChoreData).not.toHaveBeenCalled();
  });

  it.each([
    { ...populatedData.chores[0], assigneeIds: ['deleted'] },
    { ...populatedData.chores[0], schedule: { deleted: [1] } },
  ])('rejects assignments to absent family members', async (chore) => {
    const res = await PUT(makePutRequest({ chores: [chore] }));
    expect(res.status).toBe(409);
    expect(writeChoreData).not.toHaveBeenCalled();
  });

});
