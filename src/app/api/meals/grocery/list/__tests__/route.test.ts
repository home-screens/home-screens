/**
 * Route-level tests for `/api/meals/grocery/list` — the server-side resolved
 * grocery list. The meal store is mocked; the aggregation itself is the
 * canonical `generateGroceryList` (unit-tested in grocery-utils.test.ts), so
 * these tests pin the route contract: week windowing by weekStartDay,
 * serialization shape, and the total/checked counts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

let householdZone: string | undefined;
vi.mock('@/lib/config-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/config-cache')>()),
  readConfigCached: vi.fn(async () => ({ settings: { timezone: householdZone } })),
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
  beforeEach(() => {
    vi.clearAllMocks();
    householdZone = undefined;
  });
  afterEach(() => vi.useRealTimers());

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

  it('uses the household week, not the hub clock, on Saturday evening', async () => {
    // Saturday Sep 26 at 8 pm in Chicago is already Sunday Sep 27 in UTC,
    // which would start next week on a Sunday-start plan.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T01:00:00Z'));
    householdZone = 'America/Chicago';
    mockRead.mockResolvedValue({
      savedMeals: [meal],
      plan: [{ date: '2026-09-26', slot: 'dinner', mealId: 'meal-1' }],
      groceryChecked: [],
      settings: { enabledSlots: ['dinner'], weekStartDay: 'sunday', defaultTimes: {} },
    } as never);

    const body = (await (await GET(request())).json()) as ListResponse;

    expect(body.week).toEqual({ start: '2026-09-20', end: '2026-09-26' });
    expect(body.total).toBe(2);
  });

  it('starts the new week at household midnight east of UTC', async () => {
    // 00:30 Monday Sep 28 in Berlin is still Sunday in UTC.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T22:30:00Z'));
    householdZone = 'Europe/Berlin';
    mockRead.mockResolvedValue({
      savedMeals: [meal],
      plan: [],
      groceryChecked: [],
      settings: { enabledSlots: ['dinner'], weekStartDay: 'monday', defaultTimes: {} },
    } as never);

    const body = (await (await GET(request())).json()) as ListResponse;

    expect(body.week).toEqual({ start: '2026-09-28', end: '2026-10-04' });
  });
});
