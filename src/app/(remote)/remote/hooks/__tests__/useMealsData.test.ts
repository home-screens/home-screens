// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const translate = (key: string) => key;
vi.mock('@/i18n', () => ({ useTranslate: () => translate }));

import { useMealsData } from '../useMealsData';

const THIS_WEEK = '2026-09-27';
const NEXT_WEEK = '2026-10-04';

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });

const STORED = {
  savedMeals: [],
  plan: [],
  groceryChecked: { [THIS_WEEK]: ['tortillas'] },
  settings: {},
  globalTimeFormat: '12h',
  revision: 'rev-1',
};

function posted(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter(([url]) => url === '/api/meals/grocery')
    .map(([, opts]) => JSON.parse((opts as RequestInit).body as string));
}

async function loaded(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  const view = renderHook(() => useMealsData());
  await act(async () => { await view.result.current.fetchData(); });
  return view;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useMealsData grocery ticks', () => {
  it('ticks on the week it is given and leaves the other weeks alone', async () => {
    // Tortillas ticked this week must still be wanted next week: the same
    // name is a fresh tick there, not an untick of this week's.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(STORED))
      .mockResolvedValueOnce(ok({ week: NEXT_WEEK, groceryChecked: ['tortillas'], changed: true }));
    const { result } = await loaded(fetchMock);

    await act(async () => { await result.current.toggleGroceryItem(NEXT_WEEK, 'Tortillas'); });

    expect(posted(fetchMock)).toEqual([{ item: 'Tortillas', direction: 'check', week: NEXT_WEEK }]);
    expect(result.current.groceryChecked).toEqual({ [THIS_WEEK]: ['tortillas'], [NEXT_WEEK]: ['tortillas'] });
  });

  it('unticks only on the week the tick was made on', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(STORED))
      .mockResolvedValueOnce(ok({ week: THIS_WEEK, groceryChecked: [], changed: true }));
    const { result } = await loaded(fetchMock);

    await act(async () => { await result.current.toggleGroceryItem(THIS_WEEK, 'Tortillas'); });

    expect(posted(fetchMock)[0].direction).toBe('uncheck');
    expect(result.current.groceryChecked).toEqual({});
  });

  it('does not let a poll started before a tick put the old ticks back', async () => {
    let answerPoll!: (value: unknown) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(STORED))
      .mockImplementationOnce(() => new Promise((resolve) => { answerPoll = resolve; }))
      .mockResolvedValueOnce(ok({ week: NEXT_WEEK, groceryChecked: ['lettuce'], changed: true }));
    const { result } = await loaded(fetchMock);

    let poll!: Promise<void>;
    act(() => { poll = result.current.fetchData(); });
    await act(async () => { await result.current.toggleGroceryItem(NEXT_WEEK, 'Lettuce'); });
    await act(async () => {
      answerPoll(ok(STORED));
      await poll;
    });

    expect(result.current.groceryChecked).toEqual({ [THIS_WEEK]: ['tortillas'], [NEXT_WEEK]: ['lettuce'] });
  });

  it('shows the last tick\'s answer when two ticks overlap', async () => {
    let answerFirst!: (value: unknown) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(STORED))
      .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve; }))
      .mockResolvedValueOnce(ok({ week: NEXT_WEEK, groceryChecked: ['lettuce', 'milk'], changed: true }));
    const { result } = await loaded(fetchMock);

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = result.current.toggleGroceryItem(NEXT_WEEK, 'Lettuce'); });
    act(() => { second = result.current.toggleGroceryItem(NEXT_WEEK, 'Milk'); });
    // The second tick waits for the first's answer.
    await vi.waitFor(() => expect(posted(fetchMock)).toHaveLength(1));
    await act(async () => {
      answerFirst(ok({ week: NEXT_WEEK, groceryChecked: ['lettuce'], changed: true }));
      await first;
      await second;
    });

    expect(posted(fetchMock).map((b) => b.item)).toEqual(['Lettuce', 'Milk']);
    expect(result.current.groceryChecked).toEqual({ [THIS_WEEK]: ['tortillas'], [NEXT_WEEK]: ['lettuce', 'milk'] });
  });

  it('puts a refused tick back and says so', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(STORED))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { result } = await loaded(fetchMock);

    await act(async () => { await result.current.toggleGroceryItem(NEXT_WEEK, 'Lettuce'); });

    expect(result.current.groceryChecked).toEqual({ [THIS_WEEK]: ['tortillas'] });
    expect(result.current.saveError).toBe('mealsTab.saveFailed');
  });
});

const RECIPE = 'mealie:95da3cd9-6bd2-4ef2-a316-2dbcaa30b6fd';

/** The meals answer while the plan lives in Mealie: the stored plan is not what the tab draws. */
function mealieAnswer(range: { start: string; end: string }, plan: unknown[], status: 'ok' | 'stale' | 'failed' = 'ok') {
  return {
    ...STORED,
    plan: [{ date: THIS_WEEK, slot: 'dinner', customText: 'Local supper' }],
    settings: { planSource: 'mealie' },
    mealieConnected: true,
    mealie: {
      status,
      plan,
      meals: [{ id: RECIPE, name: 'Pastel de Choclo' }],
      range,
      fetchedAt: 1_793_408_451_625,
      baseUrl: 'http://mealie.local',
    },
  };
}

const SHARED = { start: '2026-09-20', end: '2026-10-24' };
const SHARED_PLAN = [{ date: THIS_WEEK, slot: 'dinner', mealId: RECIPE, sourceId: 'mealie:90' }];

describe('useMealsData in Mealie mode', () => {
  it('draws Mealie\'s plan and says where it came from', async () => {
    const { result } = await loaded(vi.fn().mockResolvedValueOnce(ok(mealieAnswer(SHARED, SHARED_PLAN))));

    expect(result.current.source).toBe('mealie');
    expect(result.current.mealieConnected).toBe(true);
    expect(result.current.mealie?.status).toBe('ok');
    expect(result.current.plan).toEqual(SHARED_PLAN);
    expect(result.current.savedMeals.map((m) => m.id)).toEqual([RECIPE]);
  });

  it('brings in a week beyond the shared ones and keeps it on the next reload', async () => {
    const far = { start: '2026-11-22', end: '2026-11-28' };
    const union = { start: SHARED.start, end: far.end };
    const farPlan = [...SHARED_PLAN, { date: '2026-11-25', slot: 'dinner', customText: 'Leftovers', sourceId: 'mealie:195' }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(mealieAnswer(SHARED, SHARED_PLAN)))
      .mockResolvedValueOnce(ok({ mealie: mealieAnswer(union, farPlan).mealie }))
      .mockResolvedValueOnce(ok(mealieAnswer(SHARED, SHARED_PLAN)))
      .mockResolvedValueOnce(ok({ mealie: mealieAnswer(union, farPlan).mealie }));
    const { result } = await loaded(fetchMock);

    await act(async () => { await result.current.showMealieRange(far); });

    // One request for the days from the shared start to the far week's end.
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/mealie/plan?start=${union.start}&end=${union.end}`);
    expect(result.current.plan).toEqual(farPlan);
    expect(result.current.rangeLoading).toBe(false);
    expect(result.current.rangeFailed).toBe(false);

    await act(async () => { await result.current.fetchData(); });
    expect(fetchMock.mock.calls[3][0]).toBe(`/api/mealie/plan?start=${union.start}&end=${union.end}`);
    expect(result.current.plan).toEqual(farPlan);
  });

  it('says so when the hub does not answer for a paged week', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(mealieAnswer(SHARED, SHARED_PLAN)))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = await loaded(fetchMock);

    await act(async () => { await result.current.showMealieRange({ start: '2026-11-22', end: '2026-11-28' }); });

    expect(result.current.rangeFailed).toBe(true);
    expect(result.current.plan).toEqual(SHARED_PLAN);
  });

  it('asks again after Mealie refuses a save, so the tab can pause planning', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(mealieAnswer(SHARED, SHARED_PLAN)))
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "We couldn't reach Mealie." }) })
      .mockResolvedValueOnce(ok(mealieAnswer(SHARED, SHARED_PLAN, 'stale')));
    const { result } = await loaded(fetchMock);

    let saved = true;
    await act(async () => {
      saved = await result.current.saveData((c) => ({ plan: c.plan.filter(() => false) }));
    });

    expect(saved).toBe(false);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/mealie/plan');
    await vi.waitFor(() => expect(result.current.mealie?.status).toBe('stale'));
    expect(result.current.plan).toEqual(SHARED_PLAN);
  });

  it('says Mealie refused the token when it did, for a save and for Suggest', async () => {
    const refused = { ok: false, status: 400, json: async () => ({ error: 'Mealie did not accept the key.', failure: 'key-rejected' }) };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(mealieAnswer(SHARED, SHARED_PLAN)))
      .mockResolvedValueOnce(refused)
      .mockResolvedValue(ok(mealieAnswer(SHARED, SHARED_PLAN, 'stale')));
    const { result } = await loaded(fetchMock);

    await act(async () => { await result.current.saveData((c) => ({ plan: c.plan.filter(() => false) })); });
    expect(result.current.saveError).toBe('mealie.saveFailed.token');

    fetchMock.mockResolvedValueOnce(refused);
    await act(async () => { await result.current.suggestFromMealie([{ date: THIS_WEEK, slot: 'dinner' }]); });
    expect(result.current.saveError).toBe('mealie.saveFailed.token');
  });

  it('keeps the "try again in a moment" words when Mealie is only away', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(mealieAnswer(SHARED, SHARED_PLAN)))
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: "We couldn't reach Mealie.", failure: 'unreachable' }) })
      .mockResolvedValue(ok(mealieAnswer(SHARED, SHARED_PLAN, 'stale')));
    const { result } = await loaded(fetchMock);

    await act(async () => { await result.current.suggestFromMealie([{ date: THIS_WEEK, slot: 'dinner' }]); });
    expect(result.current.saveError).toBe('mealie.suggest.failed');
  });

  it('reloads behind the loading line after the plan moved to the other app', async () => {
    let answer!: (value: unknown) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(STORED))
      .mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const { result } = await loaded(fetchMock);
    expect(result.current.source).toBe('local');

    let reload!: Promise<void>;
    act(() => { reload = result.current.reloadFresh(); });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      answer(ok(mealieAnswer(SHARED, SHARED_PLAN)));
      await reload;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.source).toBe('mealie');
    expect(result.current.plan).toEqual(SHARED_PLAN);
  });
});
