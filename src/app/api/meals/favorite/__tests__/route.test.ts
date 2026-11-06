import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { SavedMeal } from '@/types/config';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/mealie', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mealie')>();
  return { ...real, setMealieFavorite: vi.fn() };
});

import { POST } from '../route';
import { requireDisplayAuth, requireSession } from '@/lib/auth';
import { readMealData, writeMealData } from '@/lib/meal-data';
import { MealieError, setMealieFavorite } from '@/lib/mealie';

const RECIPE = '0f1e2d3c-4b5a-4968-8776-655443322110';
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/meals/favorite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}));
const meal = (id: string, extra: Partial<SavedMeal> = {}): SavedMeal => ({ id, name: id, ...extra });

describe('POST /api/meals/favorite', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const data = await readMealData();
    await writeMealData({ ...data, savedMeals: [meal('tacos'), meal('chili', { isFavorite: true })] });
  });

  it('lets a wall heart a recipe, with its display key', async () => {
    await post({ mealId: 'tacos', favorite: true });
    expect(requireDisplayAuth).toHaveBeenCalled();
    expect(requireSession).not.toHaveBeenCalled();
  });

  it("hearts and un-hearts the family's own recipes in meals.json", async () => {
    expect(await (await post({ mealId: 'tacos', favorite: true })).json()).toEqual({ mealId: 'tacos', favorite: true });
    await post({ mealId: 'chili', favorite: false });
    const { savedMeals } = await readMealData();
    expect(savedMeals.map((m) => [m.id, !!m.isFavorite])).toEqual([['tacos', true], ['chili', false]]);
    expect(setMealieFavorite).not.toHaveBeenCalled();
  });

  it('sets rather than flips, so a heart sent twice is still one heart', async () => {
    await post({ mealId: 'tacos', favorite: true });
    await post({ mealId: 'tacos', favorite: true });
    expect((await readMealData()).savedMeals[0].isFavorite).toBe(true);
  });

  it('says so for a meal that is not there', async () => {
    const res = await post({ mealId: 'gone', favorite: true });
    expect(res.status).toBe(404);
  });

  it("hearts a Mealie recipe in Mealie, never in meals.json", async () => {
    const res = await post({ mealId: `mealie:${RECIPE}`, favorite: false });
    expect(res.status).toBe(200);
    expect(setMealieFavorite).toHaveBeenCalledWith(RECIPE, false);
    expect((await readMealData()).savedMeals.map((m) => m.id)).toEqual(['tacos', 'chili']);
  });

  it("refuses a Mealie id that is not one, and a body that does not say which way", async () => {
    expect((await post({ mealId: 'mealie:../../users', favorite: true })).status).toBe(400);
    expect((await post({ mealId: 'tacos', favorite: 'yes' })).status).toBe(400);
    expect((await post({ favorite: true })).status).toBe(400);
    expect(setMealieFavorite).not.toHaveBeenCalled();
  });

  it("answers Mealie's failure in the words every Mealie route uses", async () => {
    vi.mocked(setMealieFavorite).mockRejectedValue(new MealieError('key-rejected', 'no'));
    const res = await post({ mealId: `mealie:${RECIPE}`, favorite: true });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await res.json()).failure).toBe('key-rejected');
  });
});
