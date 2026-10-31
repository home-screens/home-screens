// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act, waitFor } from '@testing-library/react';
import type { ModuleInstance, SavedMeal, PlannedMeal } from '@/types/config';
import { useMealPlannerData } from '../useMealPlannerData';

/** Meals and plan entries only need enough shape for identity assertions here. */
const meals = (...ids: string[]) => ids.map((id) => ({ id })) as unknown as SavedMeal[];
const entries = (...ids: string[]) => ids.map((id) => ({ id })) as unknown as PlannedMeal[];

function makeModule(config: Record<string, unknown> = {}): ModuleInstance {
  return {
    id: 'mod-1',
    type: 'meal-planner',
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config,
  } as unknown as ModuleInstance;
}

const SERVER_PAYLOAD = {
  savedMeals: [{ id: 'meal-1', name: 'Tacos' }],
  plan: [{ id: 'plan-1', mealId: 'meal-1' }],
  settings: { slots: [] },
  revision: 'rev-1',
};

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });

function mockFetchOk() {
  return vi.fn().mockResolvedValue(ok(SERVER_PAYLOAD));
}

function putBodies(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter(([, opts]) => (opts as RequestInit | undefined)?.method === 'PUT')
    .map(([, opts]) => JSON.parse((opts as RequestInit).body as string));
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetchOk());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useMealPlannerData', () => {
  it('loads meal data on mount', async () => {
    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );

    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));
    expect(result.current.mealData.plan).toHaveLength(1);
    expect(result.current.saveError).toBeNull();
  });

  /* ─── legacy field migration ─────────────────────
   * The fullscreen copy of this logic stripped only `slots` and
   * `weekStartDay`, so a module carrying legacy embedded `savedMeals` / `plan`
   * never had them cleared and the next editor save re-persisted exactly what
   * the server migration had harvested out.
   */
  it('strips all five legacy embedded fields, not just slots and weekStartDay', async () => {
    const set = vi.fn();
    renderHook(() =>
      useMealPlannerData({
        mod: makeModule({ savedMeals: [{ id: 'legacy' }], plan: [], previousPlan: [] }),
        set,
        showModal: false,
      }),
    );

    await waitFor(() => expect(set).toHaveBeenCalled());
    expect(set).toHaveBeenCalledWith({
      slots: undefined,
      weekStartDay: undefined,
      savedMeals: undefined,
      plan: undefined,
      previousPlan: undefined,
    });
  });

  it('strips legacy fields when only slots is present', async () => {
    const set = vi.fn();
    renderHook(() =>
      useMealPlannerData({ mod: makeModule({ slots: [] }), set, showModal: false }),
    );
    await waitFor(() => expect(set).toHaveBeenCalled());
  });

  it('does not touch the config when no legacy fields are present', async () => {
    const set = vi.fn();
    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule({ view: 'week' }), set, showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));
    expect(set).not.toHaveBeenCalled();
  });

  /* ─── write failures ─────────────────────
   * Previously a `catch {}` plus a bare `if (res.ok)` discarded every failure,
   * leaving the optimistic local state applied. The editor showed the edit as
   * saved while the server never received it, and the user lost it on reload.
   */
  it('rolls back optimistic state and surfaces an error when the PUT fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate(() => ({ savedMeals: meals('new', 'new-2') }));
    });

    expect(result.current.saveError).not.toBeNull();
    // Rolled back to the server state, not left showing the rejected edit.
    expect(result.current.mealData.savedMeals).toEqual(SERVER_PAYLOAD.savedMeals);
  });

  it('rolls back and surfaces an error when the PUT throws', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate(() => ({ savedMeals: meals('new') }));
    });

    expect(result.current.saveError).not.toBeNull();
    expect(result.current.mealData.savedMeals).toEqual(SERVER_PAYLOAD.savedMeals);
  });

  it('does not flash an error when the session expired (a login redirect is landing)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      // editorFetch turns a 401 into a thrown "Session expired" and redirects
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate(() => ({ savedMeals: meals('new') }));
    });

    expect(result.current.saveError).toBeNull();
  });

  it('reconciles from the server response on a successful write', async () => {
    const reconciled = {
      savedMeals: [{ id: 'server-1' }],
      plan: [{ id: 'server-plan' }],
      settings: { slots: ['dinner'] },
      revision: 'rev-2',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      .mockResolvedValueOnce(ok(reconciled));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate(() => ({ savedMeals: meals('local') }));
    });

    expect(result.current.mealData.savedMeals).toEqual(reconciled.savedMeals);
    expect(result.current.mealData.settings).toEqual(expect.objectContaining({ enabledSlots: expect.any(Array) }));
    expect(result.current.saveError).toBeNull();
  });

  it('omits settings from the PUT body so a concurrent settings edit is not clobbered', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate(() => ({ savedMeals: meals('x') }));
    });

    const [body] = putBodies(fetchMock);
    expect(body).toBeDefined();
    expect(body).not.toHaveProperty('settings');
    expect(body).toHaveProperty('savedMeals');
    expect(body.revision).toBe('rev-1');
  });

  /* ─── partial writes ─────────────────────
   * The panel used to PUT its whole `savedMeals` and `plan` on every change,
   * filled in from its own possibly-stale copy. A phone editing the plan while
   * this modal was open lost that edit to the modal's stale copy, and vice
   * versa. Only the half the modal actually changed goes on the wire now.
   */
  it('sends only the field the modal changed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate(() => ({ plan: entries('plan-2') }));
    });

    const [body] = putBodies(fetchMock);
    expect(body).not.toHaveProperty('savedMeals');
    expect(body.plan).toEqual([{ id: 'plan-2' }]);
    // The panel still shows both halves — only the request is narrowed.
    expect(result.current.mealData.savedMeals).toEqual(SERVER_PAYLOAD.savedMeals);
  });

  it('keeps showing the untouched half while a partial write is in flight', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate(() => ({ savedMeals: meals('m-1', 'm-2') }));
    });

    expect(result.current.mealData.plan).toEqual(SERVER_PAYLOAD.plan);
  });

  /* ─── the empty-overwrite guard ─────────────────────
   * The server refuses an empty savedMeals/plan against non-empty stored data
   * unless the caller confirms. A combined write slipped past that whenever
   * either half was non-empty; a partial write no longer does, so clearing the
   * last planned week has to say it meant it.
   */
  it('confirms a deliberate clear of loaded data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.plan).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate(() => ({ plan: [] }));
    });

    const [body] = putBodies(fetchMock);
    expect(body.force).toBe(true);
  });

  /* ─── nothing loaded, nothing to edit ─────────────────────
   * A panel whose GET failed holds empty arrays it never received. It used to
   * treat an error body as a loaded empty library, after which adding one meal
   * sent `savedMeals: [thatMeal]`: non-empty, so the guard let it replace the
   * whole stored library. No load, no write.
   */
  it('refuses every write, not just an empty one, when the load answered with an error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Cannot read meals' }) })
      .mockResolvedValue(ok(SERVER_PAYLOAD));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await act(async () => {
      await result.current.handleModalUpdate((c) => ({ savedMeals: [...c.savedMeals, ...meals('only-one')] }));
    });
    await act(async () => {
      await result.current.handleModalUpdate(() => ({ plan: [] }));
    });

    expect(putBodies(fetchMock)).toEqual([]);
    expect(result.current.saveError).not.toBeNull();
    expect(result.current.mealData.savedMeals).toEqual([]);
  });

  it('refuses every write when the load failed on the network', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(ok(SERVER_PAYLOAD));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await act(async () => {
      await result.current.handleModalUpdate(() => ({ savedMeals: meals('only-one') }));
    });

    expect(putBodies(fetchMock)).toEqual([]);
    expect(result.current.saveError).not.toBeNull();
  });

  /* ─── somebody else saved first ─────────────────────
   * The phone assigned Tuesday's dinner while this modal was open. The modal's
   * slot assignment quotes the revision it loaded, the hub answers 409 with
   * the phone's plan, and the edit is re-applied to that: both slots survive.
   */
  it('re-applies the edit to the hub copy on a revision conflict', async () => {
    const theirs = {
      ...SERVER_PAYLOAD,
      plan: [...SERVER_PAYLOAD.plan, { id: 'phone-added' }],
      revision: 'rev-2',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ reason: 'revision', error: 'Somebody else changed the meals.', ...theirs }) })
      .mockImplementationOnce(async (_url: string, opts: RequestInit) => {
        const body = JSON.parse(opts.body as string);
        return ok({ ...theirs, plan: body.plan, revision: 'rev-3' });
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.plan).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate((c) => ({ plan: [...c.plan, ...entries('modal-added')] }));
    });

    const bodies = putBodies(fetchMock);
    expect(bodies.map((b) => b.revision)).toEqual(['rev-1', 'rev-2']);
    expect(bodies[1].plan).toEqual([{ id: 'plan-1', mealId: 'meal-1' }, { id: 'phone-added' }, { id: 'modal-added' }]);
    expect(result.current.mealData.plan).toEqual([{ id: 'plan-1', mealId: 'meal-1' }, { id: 'phone-added' }, { id: 'modal-added' }]);
    expect(result.current.saveError).toBeNull();
  });

  /* ─── grocery ticks ─────────────────────
   * The dialog kept its own ticks, in memory, for every week at once: a tick
   * made on one week showed on every week it was moved to, and none of the
   * phone's ticks showed at all. It now reads and writes the stored ticks,
   * one list per week.
   */
  it('shows the stored ticks and saves a tick on the week it was made on', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ ...SERVER_PAYLOAD, groceryChecked: { '2026-09-27': ['tortillas'] } }))
      .mockResolvedValueOnce(ok({ week: '2026-10-04', groceryChecked: ['lettuce'], changed: true }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.groceryChecked).toEqual({ '2026-09-27': ['tortillas'] }));

    await act(async () => {
      await result.current.toggleGroceryItem('2026-10-04', 'Lettuce');
    });

    const [url, opts] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/meals/grocery');
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ item: 'Lettuce', direction: 'check', week: '2026-10-04' });
    expect(result.current.mealData.groceryChecked).toEqual({ '2026-09-27': ['tortillas'], '2026-10-04': ['lettuce'] });
    expect(result.current.saveError).toBeNull();
  });

  it('unticks an item ticked on that week, not on another', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ ...SERVER_PAYLOAD, groceryChecked: { '2026-09-27': ['tortillas'] } }))
      .mockResolvedValueOnce(ok({ week: '2026-09-27', groceryChecked: [], changed: true }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.groceryChecked).toEqual({ '2026-09-27': ['tortillas'] }));

    await act(async () => {
      await result.current.toggleGroceryItem('2026-09-27', 'Tortillas');
    });

    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).direction).toBe('uncheck');
    expect(result.current.mealData.groceryChecked).toEqual({});
  });

  it('does not let the reload on opening the dialog put the old ticks back', async () => {
    let answerReload!: (value: unknown) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      .mockImplementationOnce(() => new Promise((resolve) => { answerReload = resolve; }))
      .mockResolvedValueOnce(ok({ week: '2026-09-27', groceryChecked: ['milk'], changed: true }));
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ showModal }) => useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal }),
      { initialProps: { showModal: false } },
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    rerender({ showModal: true }); // the reload is now out
    await act(async () => {
      await result.current.toggleGroceryItem('2026-09-27', 'Milk');
    });
    await act(async () => {
      answerReload(ok(SERVER_PAYLOAD));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.mealData.groceryChecked).toEqual({ '2026-09-27': ['milk'] });
  });

  it('shows the last tick\'s answer when two ticks overlap', async () => {
    let answerFirst!: (value: unknown) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve; }))
      .mockResolvedValueOnce(ok({ week: '2026-09-27', groceryChecked: ['milk', 'eggs'], changed: true }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.toggleGroceryItem('2026-09-27', 'Milk');
    });
    act(() => {
      second = result.current.toggleGroceryItem('2026-09-27', 'Eggs');
    });
    expect(result.current.mealData.groceryChecked).toEqual({ '2026-09-27': ['milk', 'eggs'] });
    // The second tick waits for the first's answer.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      answerFirst(ok({ week: '2026-09-27', groceryChecked: ['milk'], changed: true }));
      await first;
      await second;
    });

    expect(result.current.mealData.groceryChecked).toEqual({ '2026-09-27': ['milk', 'eggs'] });
  });

  it('keeps a tick through an edit that changed nothing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      .mockResolvedValueOnce(ok({ week: '2026-09-27', groceryChecked: ['milk'], changed: true }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.toggleGroceryItem('2026-09-27', 'Milk');
    });
    await act(async () => {
      await result.current.handleModalUpdate((c) => ({ plan: c.plan }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.mealData.groceryChecked).toEqual({ '2026-09-27': ['milk'] });
  });

  it('puts a refused tick back and says so', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.toggleGroceryItem('2026-10-04', 'Lettuce');
    });

    expect(result.current.mealData.groceryChecked).toEqual({});
    expect(result.current.saveError).not.toBeNull();
  });

  /* ─── an open window follows the phone ─────────────────────
   * A meal planned on the phone while the window was open only showed once
   * the editor saved something. The open window now asks again every so
   * often, and never adopts a copy over a save of its own still on its way.
   */
  describe('while the window is open', () => {
    // Only the poll's clock is faked: the answers still settle on real time.
    beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }); });
    afterEach(() => { vi.useRealTimers(); });

    const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const phonePlanned = { ...SERVER_PAYLOAD, plan: [...SERVER_PAYLOAD.plan, { id: 'phone-added' }], revision: 'rev-2' };

    it('shows a meal planned on the phone without a save from here', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(ok(SERVER_PAYLOAD)).mockResolvedValue(ok(phonePlanned));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() =>
        useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: true }),
      );
      await settle();
      expect(result.current.mealData.plan).toHaveLength(1);

      act(() => { vi.advanceTimersByTime(15_000); });
      await settle();

      expect(result.current.mealData.plan).toEqual(phonePlanned.plan);
      expect(putBodies(fetchMock)).toEqual([]);
    });

    it('asks nothing more while the window is closed', async () => {
      const fetchMock = mockFetchOk();
      vi.stubGlobal('fetch', fetchMock);

      renderHook(() => useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }));
      await settle();
      act(() => { vi.advanceTimersByTime(60_000); });
      await settle();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps an edit whose save is on its way over a copy answered meanwhile', async () => {
      let answerSave!: (value: unknown) => void;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(ok(SERVER_PAYLOAD))
        .mockImplementationOnce(() => new Promise((resolve) => { answerSave = resolve; }))
        // The poll, answered before the save landed: it has not got the edit.
        .mockResolvedValueOnce(ok(SERVER_PAYLOAD));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() =>
        useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: true }),
      );
      await settle();

      let saving!: Promise<void>;
      act(() => { saving = result.current.handleModalUpdate((c) => ({ plan: [...c.plan, ...entries('modal-added')] })); });
      await settle();
      expect(putBodies(fetchMock)).toHaveLength(1);

      act(() => { vi.advanceTimersByTime(15_000); });
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.current.mealData.plan).toEqual([...SERVER_PAYLOAD.plan, { id: 'modal-added' }]);

      const saved = [...SERVER_PAYLOAD.plan, { id: 'modal-added' }];
      await act(async () => {
        answerSave(ok({ ...SERVER_PAYLOAD, plan: saved, revision: 'rev-2' }));
        await saving;
      });
      expect(result.current.mealData.plan).toEqual(saved);
    });
  });
});
