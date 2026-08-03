/**
 * Route-level tests for `/api/meals/grocery/list` — the server-side resolved
 * grocery list. The meal store is mocked; the aggregation itself is the
 * canonical `generateGroceryList` (unit-tested in grocery-utils.test.ts), so
 * these tests pin the route contract: week windowing by weekStartDay,
 * serialization shape, and the total/checked counts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return {
    ...actual,
    withDisplayAuth: (handler: unknown) => handler,
  };
});

vi.mock('@/lib/meal-data', () => ({
  readMealData: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { readMealData } from '@/lib/meal-data';
import { getWeekRange } from '@/lib/meal-constants';

const mockRead = vi.mocked(readMealData);

const meal = {
  id: 'meal-1',
  name: 'Tacos',
  ingredients: [
    { name: 'tortillas', amount: '12', category: 'bakery' },
    { name: 'ground beef', amount: '1 lb', category: 'meat' },
  ],
};

function request(): NextRequest {
  return new NextRequest('http://localhost/api/meals/grocery/list');
}

type ListResponse = {
  week: { start: string; end: string };
  categories: { category: string; items: { name: string; amount: string; checked: boolean }[] }[];
  total: number;
  checked: number;
};

describe('GET /api/meals/grocery/list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates ingredients from this week\'s plan with checked state', async () => {
    const { start } = getWeekRange(new Date(), 'sunday');
    mockRead.mockResolvedValue({
      savedMeals: [meal],
      plan: [{ date: start, slot: 'dinner', mealId: 'meal-1' }],
      groceryChecked: ['tortillas'],
      settings: { enabledSlots: ['dinner'], weekStartDay: 'sunday', defaultTimes: {} },
    } as never);

    const res = await GET(request());
    const body = (await res.json()) as ListResponse;

    expect(res.status).toBe(200);
    expect(body.week.start).toBe(start);
    expect(body.total).toBe(2);
    expect(body.checked).toBe(1);
    const bakery = body.categories.find((c) => c.category === 'bakery')!;
    expect(bakery.items).toEqual([{ name: 'Tortillas', amount: '12', checked: true }]);
  });

  it('excludes meals planned outside the current week', async () => {
    mockRead.mockResolvedValue({
      savedMeals: [meal],
      plan: [{ date: '2000-01-01', slot: 'dinner', mealId: 'meal-1' }],
      groceryChecked: [],
      settings: { enabledSlots: ['dinner'], weekStartDay: 'sunday', defaultTimes: {} },
    } as never);

    const res = await GET(request());
    const body = (await res.json()) as ListResponse;

    expect(body.total).toBe(0);
    expect(body.categories).toEqual([]);
  });
});
