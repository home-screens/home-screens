// @vitest-environment jsdom

/**
 * The phone's Meals tab paging through Mealie's plan: which weeks it asks the
 * hub for, and what a week outside the copy shows while Mealie is down.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const translate = (key: string) => key;
vi.mock('@/i18n', () => ({ useTranslate: () => translate, useFormattingLocale: () => 'en-US' }));
vi.mock('../../household-clock', () => ({
  useHouseholdTimezone: () => 'UTC',
  useHouseholdNow: () => new Date(2026, 8, 21, 12, 0),
}));

import { useMealsTabData } from '../useMealsTabData';

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });

/** Monday 21 September; the household's weeks start on Monday. */
const MONDAY_DINNER = { date: '2026-09-21', slot: 'dinner', customText: 'Tacos', sourceId: 'mealie:1' };

function mealsAnswer(status: 'ok' | 'stale', range: { start: string; end: string }) {
  return {
    savedMeals: [],
    plan: [],
    groceryChecked: {},
    settings: { planSource: 'mealie', weekStartDay: 'monday', enabledSlots: ['dinner'] },
    globalTimeFormat: '12h',
    revision: 'rev-1',
    mealieConnected: true,
    mealie: { status, ...(status === 'stale' ? { failure: 'unreachable' } : {}), plan: [MONDAY_DINNER], meals: [], range, fetchedAt: 1 },
  };
}

const planRequests = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([url]) => url as string).filter((url) => url.startsWith('/api/mealie/plan'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-21T12:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function opened(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  const view = renderHook(() => useMealsTabData());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('the Meals tab paging through Mealie\'s plan', () => {
  /* Mealie went down and somebody paged a week ahead: the phone asked, and
   * the hub's empty answer replaced every week, the old copy included. */
  it('asks nothing while Mealie is down, says a week outside the copy is missing and keeps the copy', async () => {
    const fetchMock = vi.fn(async (url: string) => (url.startsWith('/api/mealie/plan')
      ? ok({ mealie: { status: 'failed', failure: 'unreachable', plan: [], meals: [], range: { start: '2026-10-12', end: '2026-10-25' }, fetchedAt: null } })
      : ok(mealsAnswer('stale', { start: '2026-09-14', end: '2026-10-18' }))));
    const { result } = await opened(fetchMock);
    expect(result.current.weekState).toBe('ready');

    for (let i = 0; i < 4; i++) act(() => { result.current.navigateWeek(1); });
    expect(result.current.weekDates[0].date).toBe('2026-10-19');
    await act(async () => { await Promise.resolve(); });

    expect(result.current.weekState).toBe('failed');
    expect(planRequests(fetchMock)).toEqual([]);

    act(() => { result.current.jumpToToday(); });
    expect(result.current.weekState).toBe('ready');
    expect(result.current.weekPlan.map((p) => p.customText)).toEqual(['Tacos']);
  });

  /* Paging back to the first week of the copy never brought in the week
   * before it, so Copy Last Week stayed hidden. */
  it('brings in the week before the one in view', async () => {
    const fetchMock = vi.fn(async (url: string) => (url.startsWith('/api/mealie/plan')
      ? ok({ mealie: { ...mealsAnswer('ok', { start: '2026-09-14', end: '2026-10-25' }).mealie } })
      : ok(mealsAnswer('ok', { start: '2026-09-21', end: '2026-10-25' }))));
    const { result } = await opened(fetchMock);

    await waitFor(() => expect(planRequests(fetchMock)).toEqual(['/api/mealie/plan?start=2026-09-14&end=2026-10-25']));
    expect(result.current.weekState).toBe('ready');
  });
});
