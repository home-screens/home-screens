/**
 * Route-level tests for `/api/meals/grocery`.
 *
 * The shared meal store (`meal-data`) is faked so we exercise only the route:
 * GET returns the checked set, POST validates and toggles an item (add when
 * absent, remove when present) and persists through one `updateMealData`
 * cycle. The fake models the store's no-op contract exactly: a mutator that
 * returns the reference it was handed skips the write.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MealData } from '@/lib/meal-data';

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return {
    ...actual,
    withAuth: (handler: unknown) => handler,
    withDisplayAuth: (handler: unknown) => handler,
  };
});

vi.mock('@/lib/meal-data', () => ({
  readMealData: vi.fn(),
  updateMealData: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { readMealData, updateMealData } from '@/lib/meal-data';

const mockRead = vi.mocked(readMealData);
const mockUpdate = vi.mocked(updateMealData);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mealData(groceryChecked: string[]): any {
  return { groceryChecked };
}

/** Stand-in for the on-disk store, plus the values that actually got written. */
let current: MealData;
let persisted: MealData[];

function setStore(groceryChecked: string[]): void {
  current = mealData(groceryChecked);
  mockRead.mockResolvedValue(current);
}

/** Apply a mutator the way `updateAtomic` does: same reference back means no write. */
function applyMutator(mutator: (d: MealData) => MealData | Promise<MealData>) {
  return async () => {
    const next = await mutator(current);
    if (next !== current) {
      current = next;
      persisted.push(next);
    }
    return current;
  };
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/meals/grocery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  persisted = [];
  setStore([]);
  mockUpdate.mockImplementation((mutator) => applyMutator(mutator)());
});

describe('GET /api/meals/grocery', () => {
  it('returns the current grocery checked state', async () => {
    setStore(['milk', 'eggs']);
    const res = await GET(new NextRequest('http://localhost/api/meals/grocery'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groceryChecked: ['milk', 'eggs'] });
  });
});

describe('POST /api/meals/grocery', () => {
  it('rejects a non-string item with 400', async () => {
    const res = await POST(postRequest({ item: 42 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/non-empty string/);
    expect(persisted).toHaveLength(0);
  });

  it('rejects a blank item with 400', async () => {
    const res = await POST(postRequest({ item: '   ' }));
    expect(res.status).toBe(400);
    expect(persisted).toHaveLength(0);
  });

  it('adds an item that is not yet checked', async () => {
    setStore(['milk']);
    const res = await POST(postRequest({ item: 'eggs' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groceryChecked: ['milk', 'eggs'], changed: true });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].groceryChecked).toEqual(['milk', 'eggs']);
  });

  it('removes an item that is already checked', async () => {
    setStore(['milk', 'eggs']);
    const res = await POST(postRequest({ item: 'milk' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groceryChecked: ['eggs'], changed: true });
    expect(persisted).toHaveLength(1);
  });

  it('normalizes display-cased items to the stored lowercase form', async () => {
    setStore(['milk']);
    const res = await POST(postRequest({ item: '  Milk ' }));
    expect(await res.json()).toEqual({ groceryChecked: [], changed: true });
  });

  it('rejects an invalid direction with 400', async () => {
    const res = await POST(postRequest({ item: 'milk', direction: 'toggle' }));
    expect(res.status).toBe(400);
    expect(persisted).toHaveLength(0);
  });

  it('direction "check" is a no-op on an already-checked item', async () => {
    setStore(['milk']);
    const res = await POST(postRequest({ item: 'Milk', direction: 'check' }));
    expect(await res.json()).toEqual({ groceryChecked: ['milk'], changed: false });
    expect(persisted).toHaveLength(0);
  });

  it('direction "uncheck" is a no-op on an unchecked item', async () => {
    setStore([]);
    const res = await POST(postRequest({ item: 'milk', direction: 'uncheck' }));
    expect(await res.json()).toEqual({ groceryChecked: [], changed: false });
    expect(persisted).toHaveLength(0);
  });

  it('direction "check" adds when absent and "uncheck" removes when present', async () => {
    setStore([]);
    let res = await POST(postRequest({ item: 'milk', direction: 'check' }));
    expect(await res.json()).toEqual({ groceryChecked: ['milk'], changed: true });

    res = await POST(postRequest({ item: 'milk', direction: 'uncheck' }));
    expect(await res.json()).toEqual({ groceryChecked: [], changed: true });
  });

  it('builds the new list inside the transaction, not from an earlier read', async () => {
    // Two phones tapping at once. The route used to read with `readMealData`,
    // splice its own copy, then write it back in a second transaction, so a
    // toggle that committed in between was silently dropped. Here another
    // writer lands 'bread' before this request's mutator runs; 'bread' must
    // survive alongside the item this request is adding.
    setStore(['milk']);
    mockUpdate.mockImplementationOnce((mutator) => {
      current = mealData(['milk', 'bread']);
      return applyMutator(mutator)();
    });

    const res = await POST(postRequest({ item: 'eggs' }));
    expect(await res.json()).toEqual({
      groceryChecked: ['milk', 'bread', 'eggs'],
      changed: true,
    });
  });
});
