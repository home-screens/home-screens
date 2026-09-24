// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import type { FamilyMember } from '@/types/family';
import type { ChoreDefinition } from '@/types/config';

// ── Test doubles ─────────────────────────────────────────────────────────────
// The hook's three GETs are shared-fetch driven; the POST is the thing under
// test, so it is the only call that reaches a spy.

const posted: Array<Record<string, unknown>> = [];
let postResponse: Record<string, unknown> = { completions: [], changed: true };

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: vi.fn(async (_url: string, init?: RequestInit) => {
    posted.push(JSON.parse(String(init?.body ?? '{}')));
    return { ok: true, json: async () => postResponse } as unknown as Response;
  }),
}));

const members: FamilyMember[] = [
  { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', id: 'kid-1', name: 'Noah', emoji: '', color: '#8b5cf6' },
];

const familyResult = { members, groups: [], loading: false, loaded: true, error: null };

vi.mock('@/hooks/useFamilyData', () => ({
  useFamilyData: () => familyResult,
}));

const chores: ChoreDefinition[] = [
  {
    id: 'chore-1', name: 'Dishwasher', emoji: '', points: 3, frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['kid-1'], rotation: 'fixed',
  },
  {
    id: 'garage', name: 'Clean out the garage', emoji: '', points: 20, frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['kid-1'], rotation: 'fixed',
    bonus: { claim: 'first', comesBack: 'manual' },
  },
];

// Stable references: the hook mirrors each fetch result into state from an
// effect keyed on it, so a fresh object per render would re-render forever.
const choreDataResult = [{ chores }, null] as const;
const rewardsResult = [{ balances: {}, rewards: [], redemptions: [] }, null] as const;
type Marks = {
  completions: Array<{ choreId: string; memberId: string; date: string; status?: 'skipped'; at?: string }>;
  bonusResets?: Record<string, string>;
};
let completionsResult: readonly [Marks, null] =
  [{ completions: [] }, null];

vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: (url: string) => {
    if (url.includes('/api/chores/data')) return choreDataResult;
    if (url.includes('/api/rewards')) return rewardsResult;
    return completionsResult;
  },
}));

const { useChoreData } = await import('../useChoreData');

const config = {
  weekStartDay: 'monday' as const,
  showPoints: true,
  showStreaks: true,
  showTimeOfDay: true,
  accentColor: '#8b5cf6',
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  posted.length = 0;
  completionsResult = [{ completions: [] }, null];
  postResponse = { completions: [], changed: true };
});
afterEach(cleanup);

describe('toggleComplete states what the tap meant', () => {
  it('sends direction "complete" when the row is not done yet', async () => {
    const { result } = renderHook(() => useChoreData(config), { wrapper });

    await act(async () => { await result.current.toggleComplete('chore-1', 'kid-1'); });

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ choreId: 'chore-1', memberId: 'kid-1', date: today(), direction: 'complete' });
  });

  it('sends direction "uncomplete" when the row is already done', async () => {
    completionsResult = [{ completions: [{ choreId: 'chore-1', memberId: 'kid-1', date: today() }] }, null];
    const { result } = renderHook(() => useChoreData(config), { wrapper });
    // Let the hook mirror the fetched completions into its own state first.
    await act(async () => {});

    await act(async () => { await result.current.toggleComplete('chore-1', 'kid-1'); });

    expect(posted[0]).toMatchObject({ direction: 'uncomplete' });
  });

  it('two people tapping the same unfinished chore both say "complete"', async () => {
    // Two displays, each with its own copy of the hook, tapping in the same
    // second. Two bare toggles cancel out; two "complete" requests do not.
    const first = renderHook(() => useChoreData(config), { wrapper });
    const second = renderHook(() => useChoreData(config), { wrapper });

    await act(async () => {
      await Promise.all([
        first.result.current.toggleComplete('chore-1', 'kid-1'),
        second.result.current.toggleComplete('chore-1', 'kid-1'),
      ]);
    });

    expect(posted.map((b) => b.direction)).toEqual(['complete', 'complete']);
  });
});

describe('an overspent balance reaches the screen', () => {
  it('returns a notice naming the member, the balance and what is owed', async () => {
    postResponse = { completions: [], changed: true, overspent: { memberId: 'kid-1', balance: -4 } };
    const { result } = renderHook(() => useChoreData(config), { wrapper });

    await act(async () => { await result.current.toggleComplete('chore-1', 'kid-1'); });

    expect(result.current.overspentNotice).toEqual({ name: 'Noah', balance: -4, owed: 4 });
  });

  it('carries no notice when the balance stayed positive', async () => {
    const { result } = renderHook(() => useChoreData(config), { wrapper });

    await act(async () => { await result.current.toggleComplete('chore-1', 'kid-1'); });

    expect(result.current.overspentNotice).toBeNull();
  });
});

describe('a chore put back by a grown-up', () => {
  it('is ticked as new, not un-ticked, when the same person did it earlier that day', async () => {
    completionsResult = [{
      completions: [{ choreId: 'garage', memberId: 'kid-1', date: today(), at: `${today()}T08:00:00.000Z` }],
      bonusResets: { garage: `${today()}T09:00:00.000Z` },
    }, null];
    const { result } = renderHook(() => useChoreData(config), { wrapper });
    await act(async () => { await result.current.toggleComplete('garage', 'kid-1'); });
    expect(posted).toEqual([expect.objectContaining({ choreId: 'garage', direction: 'complete' })]);
  });
});

describe('the week behind the stars', () => {
  it('leaves a day out when everything on it was marked not today', () => {
    completionsResult = [{ completions: [{ choreId: 'chore-1', memberId: 'kid-1', date: today(), status: 'skipped' }] }, null];
    const { result } = renderHook(() => useChoreData(config), { wrapper });
    const day = result.current.weekData.find((d) => d.date === today())!;
    expect(day.memberAssigned['kid-1']).toBe(false);
    expect(day.memberStars['kid-1']).toBe(false);
  });
});
