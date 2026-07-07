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

import { GET, PUT } from '@/app/api/chores/data/route';
import { readChoreData, writeChoreData } from '@/lib/chore-data';

const emptyData = { members: [], chores: [] };
const populatedData = {
  members: [{ id: 'm1', name: 'Alice', color: '#ff0000' }],
  chores: [{ id: 'c1', name: 'Dishes', icon: 'dish', frequency: 'daily' }],
};

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(json.members).toHaveLength(1);
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
    expect(json.members).toHaveLength(1);
  });

  it('returns 400 when members is not an array', async () => {
    const res = await PUT(makePutRequest({ members: 'not-array', chores: [] }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('members must be an array');
  });

  it('returns 400 when chores is not an array', async () => {
    const res = await PUT(makePutRequest({ members: [], chores: 'not-array' }));

    expect(res.status).toBe(400);
  });

  describe('empty overwrite protection', () => {
    it('returns 409 when overwriting non-empty data with empty payload', async () => {
      vi.mocked(readChoreData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({ members: [], chores: [] }));

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('empty payload');
      expect(writeChoreData).not.toHaveBeenCalled();
    });

    it('allows empty payload when existing data is also empty', async () => {
      vi.mocked(readChoreData).mockResolvedValue(emptyData as never);

      const res = await PUT(makePutRequest({ members: [], chores: [] }));

      expect(res.status).toBe(200);
      expect(writeChoreData).toHaveBeenCalled();
    });

    it('allows empty payload when force flag is true', async () => {
      vi.mocked(readChoreData).mockResolvedValue(populatedData as never);

      const res = await PUT(makePutRequest({ members: [], chores: [], force: true }));

      expect(res.status).toBe(200);
      expect(writeChoreData).toHaveBeenCalled();
    });

    it('allows empty payload when readChoreData fails (cannot verify existing)', async () => {
      vi.mocked(readChoreData).mockRejectedValue(new Error('file not found'));

      const res = await PUT(makePutRequest({ members: [], chores: [] }));

      expect(res.status).toBe(200);
      expect(writeChoreData).toHaveBeenCalled();
    });
  });

  it('allows non-empty payload without force flag', async () => {
    vi.mocked(readChoreData).mockResolvedValue(populatedData as never);

    const newData = {
      members: [{ id: 'm2', name: 'Bob', color: '#00ff00' }],
      chores: [],
    };
    const res = await PUT(makePutRequest(newData));

    expect(res.status).toBe(200);
    expect(writeChoreData).toHaveBeenCalledWith(newData);
  });
});
