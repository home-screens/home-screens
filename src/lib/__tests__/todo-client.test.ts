import { describe, it, expect, vi, beforeEach } from 'vitest';
import { displayCache } from '@/lib/display-cache';
import {
  addItemRequest,
  createListRequest,
  deleteItemRequest,
  deleteListRequest,
  listActionRequest,
  primeTodoCache,
  reorderItemsRequest,
  sendTodoWrite,
  updateItemRequest,
  updateListRequest,
  TODO_LISTS_TTL_MS,
} from '@/lib/todo-client';

beforeEach(() => {
  displayCache.clear();
});

/** A fetcher answering one canned response, recording what it was handed. */
function stubFetch(body: unknown, ok = true, status = 200) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return { ok, status, json: async () => body } as unknown as Response;
  });
  return { fetcher, calls };
}

describe('request builders', () => {
  it('build every list write against /api/todo/lists', () => {
    expect(createListRequest('Groceries')).toEqual({
      url: '/api/todo/lists',
      method: 'POST',
      body: { name: 'Groceries' },
    });
    expect(createListRequest('Groceries', '#f00').body).toEqual({ name: 'Groceries', color: '#f00' });
    expect(updateListRequest('l1', { name: 'Shopping' })).toEqual({
      url: '/api/todo/lists/l1',
      method: 'PATCH',
      body: { name: 'Shopping' },
    });
    expect(listActionRequest('l1', 'clear-completed').body).toEqual({ action: 'clear-completed' });
    expect(reorderItemsRequest('l1', ['b', 'a']).body).toEqual({ itemOrder: ['b', 'a'] });
    expect(deleteListRequest('l1')).toEqual({ url: '/api/todo/lists/l1', method: 'DELETE' });
  });

  it('build every item write under its list', () => {
    expect(addItemRequest('l1', 'Milk')).toEqual({
      url: '/api/todo/lists/l1/items',
      method: 'POST',
      body: { text: 'Milk' },
    });
    expect(updateItemRequest('l1', 'i1', { completed: true })).toEqual({
      url: '/api/todo/lists/l1/items/i1',
      method: 'PATCH',
      body: { completed: true },
    });
    expect(deleteItemRequest('l1', 'i1')).toEqual({
      url: '/api/todo/lists/l1/items/i1',
      method: 'DELETE',
    });
  });

  // Ids reach the URL from user-named lists and from the store, so a stray
  // slash or space must not invent a path segment.
  it('escape ids in the path', () => {
    expect(updateItemRequest('a/b', 'c d', {}).url).toBe('/api/todo/lists/a%2Fb/items/c%20d');
    expect(deleteListRequest('a?b').url).toBe('/api/todo/lists/a%3Fb');
  });

  it("copy the patch rather than aliasing the caller's object", () => {
    const patch = { text: 'Milk' };
    const req = updateItemRequest('l1', 'i1', patch);
    patch.text = 'Bread';
    expect(req.body).toEqual({ text: 'Milk' });
  });
});

describe('sendTodoWrite', () => {
  it('sends the method and JSON body, and returns the lists', async () => {
    const { fetcher, calls } = stubFetch({ lists: [{ id: 'l1' }] });

    const result = await sendTodoWrite(fetcher, updateItemRequest('l1', 'i1', { completed: true }), 'nope');

    expect(result.lists).toEqual([{ id: 'l1' }]);
    expect(calls[0].url).toBe('/api/todo/lists/l1/items/i1');
    expect(calls[0].init?.method).toBe('PATCH');
    expect(calls[0].init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(calls[0].init?.body).toBe('{"completed":true}');
  });

  it('sends no body or content type for a DELETE', async () => {
    const { calls, fetcher } = stubFetch({ lists: [] });
    await sendTodoWrite(fetcher, deleteItemRequest('l1', 'i1'), 'nope');
    expect(calls[0].init?.body).toBeUndefined();
    expect(calls[0].init?.headers).toBeUndefined();
  });

  it('hands back what a create route named', async () => {
    const { fetcher } = stubFetch({ lists: [], created: { id: 'new-1' } });
    const { created } = await sendTodoWrite(fetcher, createListRequest('Groceries'), 'nope');
    expect(created).toEqual({ id: 'new-1' });
  });

  it('ignores a created without a string id', async () => {
    const { fetcher } = stubFetch({ lists: [], created: { id: 7 } });
    const { created } = await sendTodoWrite(fetcher, createListRequest('x'), 'nope');
    expect(created).toBeUndefined();
  });

  it("throws the store's own message on a refusal", async () => {
    const { fetcher } = stubFetch({ error: 'That list already exists' }, false, 400);
    await expect(sendTodoWrite(fetcher, createListRequest('Groceries'), 'Could not save'))
      .rejects.toThrow('That list already exists');
  });

  it('throws the fallback when the failure carries no message', async () => {
    const { fetcher } = stubFetch(null, false, 500);
    await expect(sendTodoWrite(fetcher, createListRequest('x'), 'Could not save'))
      .rejects.toThrow('Could not save');
  });

  it('throws the fallback when a 200 comes back without lists', async () => {
    const { fetcher } = stubFetch({ ok: true });
    await expect(sendTodoWrite(fetcher, createListRequest('x'), 'Could not save'))
      .rejects.toThrow('Could not save');
  });

  // The caller has to be able to tell an expired session from a refusal, so
  // transport failures must arrive as themselves and not as a save error.
  it('lets a transport error through untouched', async () => {
    const boom = new Error('session expired');
    await expect(sendTodoWrite(async () => { throw boom; }, createListRequest('x'), 'Could not save'))
      .rejects.toBe(boom);
  });

  it('primes the shared cache so nothing re-asks for what it just got', async () => {
    const { fetcher } = stubFetch({ lists: [{ id: 'l1' }] });
    await sendTodoWrite(fetcher, addItemRequest('l1', 'Milk'), 'nope');
    expect(displayCache.get('/api/todo/lists')).toEqual({
      data: { lists: [{ id: 'l1' }] },
      stale: false,
      fetchedAt: expect.any(Number),
    });
  });

  it('leaves the cache alone when the write is refused', async () => {
    displayCache.replace('/api/todo/lists', { lists: [{ id: 'old' }] }, TODO_LISTS_TTL_MS);
    const { fetcher } = stubFetch({ error: 'nope' }, false, 400);
    await expect(sendTodoWrite(fetcher, addItemRequest('l1', 'Milk'), 'fallback')).rejects.toThrow();
    expect(displayCache.get<{ lists: unknown[] }>('/api/todo/lists')?.data).toEqual({ lists: [{ id: 'old' }] });
  });
});

describe('primeTodoCache', () => {
  it('stores the lists under the shared lists URL', () => {
    primeTodoCache([{ id: 'l1' }] as never);
    expect(displayCache.get('/api/todo/lists')?.data).toEqual({ lists: [{ id: 'l1' }] });
  });
});
