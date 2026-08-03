import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- auth mock: pass-through (matches reference test pattern) ---------------
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

// --- data mocks -------------------------------------------------------------
vi.mock('@/lib/chore-data', () => ({
  readChoreData: vi.fn(),
}));
vi.mock('@/lib/chore-completion-data', () => ({
  readCompletions: vi.fn(),
}));

import { GET } from '@/app/api/chores/today/route';
import { readChoreData } from '@/lib/chore-data';
import { readCompletions } from '@/lib/chore-completion-data';
import { resolveAssignee } from '@/components/modules/chore-chart/types';
import type { ChoreDefinition } from '@/types/config';

// 2026-08-03 is a Monday (dayOfWeek 1).
const DATE = '2026-08-03';

const dishes: ChoreDefinition = {
  id: 'chore-dishes',
  name: 'Dishes',
  emoji: 'dish',
  points: 5,
  frequency: 'daily',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  timeOfDay: 'evening',
  assigneeIds: ['kid-1'],
  rotation: 'fixed',
};

const trash: ChoreDefinition = {
  ...dishes,
  id: 'chore-trash',
  name: 'Trash',
  points: 2,
  timeOfDay: 'morning',
  assigneeIds: ['kid-1', 'kid-2'],
  rotation: 'rotate-daily',
};

const sundayOnly: ChoreDefinition = {
  ...dishes,
  id: 'chore-sunday',
  name: 'Water plants',
  daysOfWeek: [0],
  assigneeIds: ['kid-2'],
};

const choreData = {
  members: [
    { id: 'kid-1', name: 'Ada', emoji: 'fox', color: '#ff0000' },
    { id: 'kid-2', name: 'Ben', emoji: 'owl', color: '#00ff00' },
  ],
  chores: [dishes, trash, sundayOnly],
};

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/chores/today${query}`);
}

type TodayResponse = {
  date: string;
  members: {
    id: string;
    name: string;
    chores: { id: string; name: string; points: number; timeOfDay: string; completed: boolean }[];
  }[];
};

describe('GET /api/chores/today', () => {
  beforeEach(() => {
    vi.mocked(readChoreData).mockResolvedValue(choreData as never);
    vi.mocked(readCompletions).mockResolvedValue({ completions: [] } as never);
  });

  it('resolves fixed assignments for the requested date', async () => {
    const res = await GET(request(`?date=${DATE}`));
    const body = (await res.json()) as TodayResponse;

    expect(res.status).toBe(200);
    expect(body.date).toBe(DATE);
    const ada = body.members.find((m) => m.id === 'kid-1')!;
    expect(ada.chores.map((c) => c.id)).toContain('chore-dishes');
    const ben = body.members.find((m) => m.id === 'kid-2')!;
    expect(ben.chores.map((c) => c.id)).not.toContain('chore-dishes');
  });

  it('gives a rotating chore to exactly the member the canonical resolver picks', async () => {
    const res = await GET(request(`?date=${DATE}`));
    const body = (await res.json()) as TodayResponse;

    const expected = resolveAssignee(trash, DATE);
    expect(expected).toHaveLength(1);
    const holders = body.members.filter((m) => m.chores.some((c) => c.id === 'chore-trash'));
    expect(holders.map((m) => m.id)).toEqual(expected);
  });

  it('excludes chores whose day-of-week gate does not match', async () => {
    // DATE is a Monday; the Sunday-only chore must not appear for anyone.
    const res = await GET(request(`?date=${DATE}`));
    const body = (await res.json()) as TodayResponse;

    for (const m of body.members) {
      expect(m.chores.map((c) => c.id)).not.toContain('chore-sunday');
    }
  });

  it('marks completions for the same chore, member, and date', async () => {
    vi.mocked(readCompletions).mockResolvedValue({
      completions: [
        { choreId: 'chore-dishes', memberId: 'kid-1', date: DATE },
        // Same chore, different day: must not count.
        { choreId: 'chore-trash', memberId: 'kid-1', date: '2026-08-01' },
      ],
    } as never);

    const res = await GET(request(`?date=${DATE}`));
    const body = (await res.json()) as TodayResponse;

    const ada = body.members.find((m) => m.id === 'kid-1')!;
    expect(ada.chores.find((c) => c.id === 'chore-dishes')!.completed).toBe(true);
    const others = ada.chores.filter((c) => c.id !== 'chore-dishes');
    expect(others.every((c) => !c.completed)).toBe(true);
  });

  it('defaults to the server-local today when no date is given', async () => {
    const res = await GET(request());
    const body = (await res.json()) as TodayResponse;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(body.date).toBe(today);
  });

  it('rejects malformed and impossible dates with 400', async () => {
    for (const bad of ['nope', '2026-99-99', '2026-02-30', '08-03-2026']) {
      const res = await GET(request(`?date=${bad}`));
      expect(res.status).toBe(400);
    }
  });
});
