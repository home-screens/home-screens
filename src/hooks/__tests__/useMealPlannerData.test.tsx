// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act, waitFor } from '@testing-library/react';
import type { ModuleInstance } from '@/types/config';
import { useMealPlannerData } from '../useMealPlannerData';

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
};

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => SERVER_PAYLOAD,
  });
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
      // initial GET
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      // failing PUT
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ savedMeals: [{ id: 'new' }, { id: 'new-2' }] });
    });

    expect(result.current.saveError).not.toBeNull();
    // Rolled back to the server state, not left showing the rejected edit.
    expect(result.current.mealData.savedMeals).toEqual(SERVER_PAYLOAD.savedMeals);
  });

  it('rolls back and surfaces an error when the PUT throws', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ savedMeals: [{ id: 'new' }] });
    });

    expect(result.current.saveError).not.toBeNull();
    expect(result.current.mealData.savedMeals).toEqual(SERVER_PAYLOAD.savedMeals);
  });

  it('does not flash an error when the session expired (a login redirect is landing)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      // editorFetch turns a 401 into a thrown "Session expired" and redirects
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ savedMeals: [{ id: 'new' }] });
    });

    expect(result.current.saveError).toBeNull();
  });

  it('reconciles from the server response on a successful write', async () => {
    const reconciled = {
      savedMeals: [{ id: 'server-1' }],
      plan: [{ id: 'server-plan' }],
      settings: { slots: ['dinner'] },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => reconciled });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ savedMeals: [{ id: 'local' }] });
    });

    expect(result.current.mealData.savedMeals).toEqual(reconciled.savedMeals);
    expect(result.current.mealData.settings).toEqual(reconciled.settings);
    expect(result.current.saveError).toBeNull();
  });

  it('omits settings from the PUT body so a concurrent settings edit is not clobbered', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ savedMeals: [{ id: 'x' }] });
    });

    const putCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PUT');
    expect(putCall).toBeDefined();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('settings');
    expect(body).toHaveProperty('savedMeals');
  });
});
