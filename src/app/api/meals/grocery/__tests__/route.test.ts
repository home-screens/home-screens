/**
 * Route-level tests for `/api/meals/grocery`.
 *
 * The shared meal store (`meal-data`) is mocked so we exercise only the
 * route: GET returns the checked set, POST validates and toggles an item
 * (add when absent, remove when present) and persists via `writeMealData`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

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
  writeMealData: vi.fn(async () => {}),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { readMealData, writeMealData } from '@/lib/meal-data';

const mockRead = vi.mocked(readMealData);
const mockWrite = vi.mocked(writeMealData);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mealData(groceryChecked: string[]): any {
  return { groceryChecked };
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/meals/grocery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/meals/grocery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the current grocery checked state', async () => {
    mockRead.mockResolvedValue(mealData(['milk', 'eggs']));
    const res = await GET(new NextRequest('http://localhost/api/meals/grocery'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groceryChecked: ['milk', 'eggs'] });
  });
});

describe('POST /api/meals/grocery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a non-string item with 400', async () => {
    const res = await POST(postRequest({ item: 42 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/non-empty string/);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('rejects a blank item with 400', async () => {
    const res = await POST(postRequest({ item: '   ' }));
    expect(res.status).toBe(400);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('adds an item that is not yet checked', async () => {
    mockRead.mockResolvedValue(mealData(['milk']));
    const res = await POST(postRequest({ item: 'eggs' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groceryChecked: ['milk', 'eggs'], changed: true });
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockWrite.mock.calls[0][0].groceryChecked).toEqual(['milk', 'eggs']);
  });

  it('removes an item that is already checked', async () => {
    mockRead.mockResolvedValue(mealData(['milk', 'eggs']));
    const res = await POST(postRequest({ item: 'milk' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groceryChecked: ['eggs'], changed: true });
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });

  it('normalizes display-cased items to the stored lowercase form', async () => {
    mockRead.mockResolvedValue(mealData(['milk']));
    const res = await POST(postRequest({ item: '  Milk ' }));
    expect(await res.json()).toEqual({ groceryChecked: [], changed: true });
  });

  it('rejects an invalid direction with 400', async () => {
    const res = await POST(postRequest({ item: 'milk', direction: 'toggle' }));
    expect(res.status).toBe(400);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('direction "check" is a no-op on an already-checked item', async () => {
    mockRead.mockResolvedValue(mealData(['milk']));
    const res = await POST(postRequest({ item: 'Milk', direction: 'check' }));
    expect(await res.json()).toEqual({ groceryChecked: ['milk'], changed: false });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('direction "uncheck" is a no-op on an unchecked item', async () => {
    mockRead.mockResolvedValue(mealData([]));
    const res = await POST(postRequest({ item: 'milk', direction: 'uncheck' }));
    expect(await res.json()).toEqual({ groceryChecked: [], changed: false });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('direction "check" adds when absent and "uncheck" removes when present', async () => {
    mockRead.mockResolvedValue(mealData([]));
    let res = await POST(postRequest({ item: 'milk', direction: 'check' }));
    expect(await res.json()).toEqual({ groceryChecked: ['milk'], changed: true });

    mockRead.mockResolvedValue(mealData(['milk']));
    res = await POST(postRequest({ item: 'milk', direction: 'uncheck' }));
    expect(await res.json()).toEqual({ groceryChecked: [], changed: true });
  });
});
