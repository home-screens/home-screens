// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useMealieShoppingList } from '../useMealieShoppingList';
import { HubUnreachableError, loadMealieShopping, tickMealieShoppingItem, type MealieShoppingWire } from '@/lib/meal-client';
import type { ShoppingItem } from '@/lib/shopping-list';

const item = (id: string, text: string, checked = false): ShoppingItem => ({ id, text, name: text, checked, recipes: [] });

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

type HubList = { id: string; name: string; items: ShoppingItem[] };

/** A hub whose lists, family pick and write answers the test controls. */
function hub(lists: HubList[]) {
  const state = { lists: lists.map((l) => ({ ...l, items: l.items.map((i) => ({ ...i })) })), chosen: lists[0]?.id, down: false };
  const ticks: { id: string; checked: boolean; settle: (res: Response) => void }[] = [];
  const reads: string[] = [];
  const wire = (listId?: string): MealieShoppingWire => {
    const shown = state.lists.find((l) => l.id === listId) ?? state.lists.find((l) => l.id === state.chosen) ?? state.lists[0];
    return {
      status: 'ok',
      lists: state.lists.map((l) => ({ id: l.id, name: l.name, left: l.items.filter((i) => !i.checked).length })),
      list: shown ? { id: shown.id, name: shown.name, groups: [{ label: null, items: shown.items.map((i) => ({ ...i })) }] } : null,
      fetchedAt: 1,
      baseUrl: 'http://mealie.local',
    };
  };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (state.down) throw new TypeError('Failed to fetch');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : null;
    if (method === 'PATCH') {
      const id = url.split('/').pop()!;
      return new Promise<Response>((settle) => ticks.push({ id, checked: body.checked, settle }));
    }
    if (method === 'PUT') {
      state.chosen = body.list;
      return json(wire(body.list));
    }
    if (method === 'POST') {
      const list = state.lists.find((l) => l.id === body.list)!;
      const made = item(`new-${list.items.length}`, body.text);
      list.items.push(made);
      return json({ ...wire(list.id), added: made.id });
    }
    if (method === 'DELETE') {
      const id = url.split('/').pop()!;
      for (const l of state.lists) l.items = l.items.filter((i) => i.id !== id);
      return json({ ok: true });
    }
    reads.push(url);
    return json(wire());
  });
  return { state, ticks, reads, fetcher };
}

const GROCERIES = (items: ShoppingItem[]) => ({ id: 'groceries', name: 'Groceries', items });

afterEach(() => cleanup());

async function open(h: ReturnType<typeof hub>, onError = vi.fn()) {
  const view = renderHook(() => useMealieShoppingList(h.fetcher, { onError }));
  await waitFor(() => expect(view.result.current.state).toBe('ready'));
  return view;
}

describe('useMealieShoppingList', () => {
  it('folds what was ticked when the tab opened, and keeps a fresh tick in place', async () => {
    const h = hub([GROCERIES([item('milk', 'Milk'), item('bread', 'Bread', true)])]);
    const { result } = await open(h);
    expect(result.current.view.groups[0].items.map((i) => i.id)).toEqual(['milk']);
    expect(result.current.view.folded.map((i) => i.id)).toEqual(['bread']);

    act(() => result.current.toggle(result.current.view.groups[0].items[0]));
    expect(result.current.view.groups[0].items[0]).toMatchObject({ id: 'milk', checked: true });
    expect(result.current.counts).toEqual({ total: 2, got: 2 });
    await waitFor(() => expect(h.ticks).toHaveLength(1));
  });

  it('brings something put back in Mealie out of the fold, and it stays out when ticked again', async () => {
    const h = hub([GROCERIES([item('milk', 'Milk'), item('eggs', '4 eggs', true)])]);
    const { result } = await open(h);
    expect(result.current.view.folded.map((i) => i.id)).toEqual(['eggs']);

    h.state.lists[0].items[1].checked = false;
    await act(async () => { await result.current.retry(); });
    expect(result.current.view.folded).toEqual([]);
    expect(result.current.view.groups[0].items.map((i) => i.id)).toEqual(['eggs', 'milk']);

    act(() => result.current.toggle(result.current.view.groups[0].items[0]));
    expect(result.current.view.groups[0].items[0]).toMatchObject({ id: 'eggs', checked: true });
    expect(result.current.view.folded).toEqual([]);
  });

  it("puts a tick Mealie didn't take back, and names it", async () => {
    const onError = vi.fn();
    const h = hub([GROCERIES([item('milk', 'Milk'), item('eggs', '4 eggs')])]);
    const { result } = await open(h, onError);

    act(() => result.current.toggle(result.current.view.groups[0].items[0]));
    act(() => result.current.toggle(result.current.view.groups[0].items[1]));
    await waitFor(() => expect(h.ticks).toHaveLength(2));
    const refused = json({ error: "We couldn't reach Mealie.", failure: 'unreachable' }, 502);
    await act(async () => {
      h.ticks[0].settle(refused);
      h.ticks[1].settle(json({ error: "We couldn't reach Mealie.", failure: 'unreachable' }, 502));
    });
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    // Both springs back, one message naming both.
    expect(result.current.view.groups[0].items.map((i) => i.checked)).toEqual([false, false]);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ problem: 'unreachable' }), 'tick', ['Milk', '4 eggs']);
  });

  it('sends two taps on one item one after the other, so Mealie ends where the last tap left it', async () => {
    const h = hub([GROCERIES([item('milk', 'Milk')])]);
    const { result } = await open(h);

    act(() => result.current.toggle(result.current.view.groups[0].items[0]));
    act(() => result.current.toggle(result.current.view.groups[0].items[0]));
    expect(result.current.view.groups[0].items[0].checked).toBe(false);
    await waitFor(() => expect(h.ticks).toHaveLength(1));
    // The second waits for the first.
    await new Promise((r) => setTimeout(r, 20));
    expect(h.ticks).toHaveLength(1);
    await act(async () => h.ticks[0].settle(json({ changed: true })));
    await waitFor(() => expect(h.ticks).toHaveLength(2));
    expect(h.ticks.map((t) => t.checked)).toEqual([true, false]);
  });

  it('keeps a tick on screen through a read that started before Mealie took it', async () => {
    const h = hub([GROCERIES([item('milk', 'Milk')])]);
    const { result } = await open(h);

    act(() => result.current.toggle(result.current.view.groups[0].items[0]));
    await act(async () => { await result.current.retry(); });
    expect(result.current.view.groups[0].items[0].checked).toBe(true);
    await waitFor(() => expect(h.ticks).toHaveLength(1));
    h.state.lists[0].items[0].checked = true;
    await act(async () => h.ticks[0].settle(json({ changed: true })));
    await act(async () => { await result.current.retry(); });
    expect(result.current.view.groups[0].items[0].checked).toBe(true);
  });

  it("follows the family's list picked on another device, and says so", async () => {
    const h = hub([GROCERIES([item('milk', 'Milk')]), { id: 'costco', name: 'Costco run', items: [item('beans', 'Coffee beans')] }]);
    const { result } = await open(h);
    h.state.chosen = 'costco';
    await act(async () => { await result.current.retry(); });
    // Reads ask for the family's list, never the one this tab first showed.
    expect(h.reads.every((url) => !url.includes('list='))).toBe(true);
    expect(result.current.list?.name).toBe('Costco run');
    expect(result.current.notice).toEqual({ kind: 'moved', list: 'Costco run' });
  });

  it('says so when the list on screen was deleted in Mealie', async () => {
    const h = hub([{ id: 'party', name: 'Party supplies', items: [item('b', 'Balloons')] }, GROCERIES([item('milk', 'Milk')])]);
    const { result } = await open(h);
    h.state.lists = h.state.lists.filter((l) => l.id !== 'party');
    h.state.chosen = 'groceries';
    await act(async () => { await result.current.retry(); });
    expect(result.current.notice).toEqual({ kind: 'gone', from: 'Party supplies', list: 'Groceries' });
  });

  it('a pick says it is for everyone, takes no taps until it lands, and Undo goes back', async () => {
    const h = hub([GROCERIES([item('milk', 'Milk')]), { id: 'costco', name: 'Costco run', items: [item('beans', 'Coffee beans')] }]);
    const { result } = await open(h);
    act(() => result.current.choose('costco'));
    expect(result.current.choosing).toBe('costco');
    // The old list is still on screen: a tap must not land on it.
    act(() => result.current.toggle(result.current.view.groups[0].items[0]));
    await waitFor(() => expect(result.current.list?.name).toBe('Costco run'));
    expect(h.ticks).toHaveLength(0);
    expect(result.current.notice).toMatchObject({ kind: 'picked', list: 'Costco run' });

    const notice = result.current.notice;
    act(() => { if (notice?.kind === 'picked') notice.undo(); });
    await waitFor(() => expect(result.current.list?.name).toBe('Groceries'));
    expect(h.state.chosen).toBe('groceries');
    expect(result.current.notice).toBeNull();
  });

  it('adds something new with Undo, never twice, and puts back what was checked off', async () => {
    const h = hub([GROCERIES([item('milk', 'Milk'), item('bread', 'Bread', true)])]);
    const { result } = await open(h);

    await act(async () => { expect(await result.current.add('Lemons')).toBe(true); });
    expect(result.current.justAdded).toMatchObject({ kind: 'added', text: 'Lemons', list: 'Groceries' });
    expect(result.current.view.groups[0].items[0].text).toBe('Lemons');
    await act(async () => { result.current.justAdded?.undo?.(); });
    await waitFor(() => expect(result.current.list?.groups[0].items.map((i) => i.text)).toEqual(['Milk', 'Bread']));

    await act(async () => { expect(await result.current.add('milk')).toBe(true); });
    expect(result.current.justAdded).toMatchObject({ kind: 'already', text: 'Milk' });
    expect(h.state.lists[0].items).toHaveLength(2);

    await act(async () => { expect(await result.current.add('bread')).toBe(true); });
    expect(result.current.justAdded).toMatchObject({ kind: 'putBack', text: 'Bread' });
    await waitFor(() => expect(h.ticks.at(-1)).toMatchObject({ id: 'bread', checked: false }));
  });

  it("tells not reaching the hub apart from Mealie's problems", async () => {
    const h = hub([GROCERIES([item('milk', 'Milk')])]);
    const { result } = await open(h);
    h.state.down = true;
    await act(async () => { await result.current.retry(); });
    expect(result.current.stale).toBe(true);
    expect(result.current.problem).toBe('connection');
    h.state.down = false;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(result.current.stale).toBe(false));
  });

  it('keeps the saved address for Open Mealie when Mealie never answered', async () => {
    const fetcher = vi.fn(async () => json({ error: "We couldn't reach Mealie.", failure: 'unreachable', baseUrl: 'http://mealie.local' }, 502));
    const { result } = renderHook(() => useMealieShoppingList(fetcher, { onError: vi.fn() }));
    await waitFor(() => expect(result.current.state).toBe('failed'));
    expect(result.current.problem).toBe('unreachable');
    expect(result.current.baseUrl).toBe('http://mealie.local');
  });

  it('gives every request a time limit, and a request that fails or runs out counts as not reaching the hub', async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(init?.signal);
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    await expect(loadMealieShopping(fetcher)).rejects.toBeInstanceOf(HubUnreachableError);
    await expect(tickMealieShoppingItem(fetcher, 'milk', true)).rejects.toBeInstanceOf(HubUnreachableError);
    expect(seen.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });
});
