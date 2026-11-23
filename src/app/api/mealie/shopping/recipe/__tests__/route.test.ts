import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  hasEditorSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/config', () => ({ readConfig: vi.fn() }));
vi.mock('@/lib/meal-data', () => ({ readMealData: vi.fn() }));
vi.mock('@/lib/mealie-shopping', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mealie-shopping')>()),
  readMealieShopping: vi.fn(),
  addMealieRecipeToShopping: vi.fn(),
}));

import { POST } from '../route';
import { addMealieRecipeToShopping, MealieShoppingGoneError, readMealieShopping } from '@/lib/mealie-shopping';
import { hasEditorSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { readMealData } from '@/lib/meal-data';
import { mealieMealId } from '@/lib/mealie-map';
import type { ScreenConfiguration } from '@/types/config';
import type { MealData } from '@/lib/meal-data';

const LIST = '930a09f2-00f6-44b3-89ec-449586cffcc0';
const RECIPE = '7b1c2a4e-5d3f-4e8a-9b6c-1f2e3d4c5b6a';
const post = (body: unknown) => new NextRequest('http://localhost/api/mealie/shopping/recipe', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const mealCard = (config: Record<string, unknown>) => ({
  version: 21, settings: {}, screens: [{ id: 's', name: 'S', modules: [{ id: 'm', type: 'meal-planner', position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, style: {}, config }] }],
}) as unknown as ScreenConfiguration;
const meals = (planSource?: 'mealie') => ({ settings: { planSource }, mealieShoppingList: LIST }) as unknown as MealData;

describe('POST /api/mealie/shopping/recipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasEditorSession).mockResolvedValue(false);
    vi.mocked(readConfig).mockResolvedValue(mealCard({ view: 'week', wallPlan: true }));
    vi.mocked(readMealData).mockResolvedValue(meals('mealie'));
    vi.mocked(addMealieRecipeToShopping).mockResolvedValue(undefined);
    vi.mocked(readMealieShopping).mockResolvedValue({ status: 'ok', lists: [], list: { id: LIST, name: 'Weekly Shop', groups: [] }, fetchedAt: 1, baseUrl: 'http://mealie.local' });
  });

  it("adds the recipe's ingredients to the family's list and answers with the list read fresh", async () => {
    const res = await POST(post({ mealId: mealieMealId(RECIPE) }));
    expect(res.status).toBe(200);
    expect(readMealieShopping).toHaveBeenCalledWith(LIST);
    expect(addMealieRecipeToShopping).toHaveBeenCalledWith(LIST, RECIPE);
    expect(readMealieShopping).toHaveBeenLastCalledWith(LIST, { fresh: true });
    expect(await res.json()).toMatchObject({ list: { id: LIST, name: 'Weekly Shop' } });
  });

  it('refuses anything but a Mealie recipe', async () => {
    for (const mealId of ['tacos', 'mealie:not-a-recipe', 7, undefined]) {
      expect((await POST(post({ mealId }))).status).toBe(400);
    }
    expect(addMealieRecipeToShopping).not.toHaveBeenCalled();
  });

  it('refuses while the plan is kept in Home Screens, even with a session', async () => {
    vi.mocked(readMealData).mockResolvedValue(meals());
    vi.mocked(hasEditorSession).mockResolvedValue(true);
    const res = await POST(post({ mealId: mealieMealId(RECIPE) }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'meals.wallPlanOff' });
    expect(addMealieRecipeToShopping).not.toHaveBeenCalled();
  });

  it('refuses a wall while no meal card lets it plan', async () => {
    vi.mocked(readConfig).mockResolvedValue(mealCard({ view: 'week' }));
    const res = await POST(post({ mealId: mealieMealId(RECIPE) }));
    expect(res.status).toBe(403);
    expect(addMealieRecipeToShopping).not.toHaveBeenCalled();
  });

  it('lets a session add without any planning card', async () => {
    vi.mocked(readConfig).mockResolvedValue(mealCard({ view: 'week' }));
    vi.mocked(hasEditorSession).mockResolvedValue(true);
    expect((await POST(post({ mealId: mealieMealId(RECIPE) }))).status).toBe(200);
    expect(addMealieRecipeToShopping).toHaveBeenCalledWith(LIST, RECIPE);
  });

  it('says there is no list when Mealie has none yet', async () => {
    vi.mocked(readMealieShopping).mockResolvedValue({ status: 'ok', lists: [], list: null, fetchedAt: 1, baseUrl: 'http://mealie.local' });
    const res = await POST(post({ mealId: mealieMealId(RECIPE) }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reason: 'gone' });
    expect(addMealieRecipeToShopping).not.toHaveBeenCalled();
  });

  it('says the list is gone when Mealie lost it in the moment since', async () => {
    vi.mocked(addMealieRecipeToShopping).mockRejectedValue(new MealieShoppingGoneError('list'));
    const res = await POST(post({ mealId: mealieMealId(RECIPE) }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reason: 'gone' });
  });
});
