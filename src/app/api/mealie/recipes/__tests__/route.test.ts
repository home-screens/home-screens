import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/mealie', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mealie')>();
  return {
    ...real,
    getMealieContext: vi.fn(),
    getMealieFavoriteIds: vi.fn(),
    searchMealieRecipes: vi.fn(),
  };
});

import { GET } from '../route';
import { requireDisplayAuth, requireSession } from '@/lib/auth';
import { getMealieContext, getMealieFavoriteIds, searchMealieRecipes, MealieError } from '@/lib/mealie';

const req = (q = '') => new NextRequest(`http://localhost/api/mealie/recipes${q}`);
const RECIPE = { id: '0f1e2d3c-4b5a-4968-8776-655443322110', slug: 'tikka', name: 'Tikka', image: 'abc', prepTime: '15 minutes' };

describe('GET /api/mealie/recipes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMealieContext).mockResolvedValue({ baseUrl: 'http://mealie.local', groupSlug: 'home' });
    vi.mocked(searchMealieRecipes).mockResolvedValue({ items: [RECIPE], page: 1, totalPages: 1, total: 1 });
    vi.mocked(getMealieFavoriteIds).mockResolvedValue(new Set());
  });

  it('answers with Mealie recipes as saved meals', async () => {
    const res = await GET(req('?search=tik&filter=favorites&page=2'));
    expect(searchMealieRecipes).toHaveBeenCalledWith({ search: 'tik', filter: 'favorites', category: undefined, cookbook: undefined, page: 2 });
    expect(await res.json()).toEqual({
      items: [{
        id: `mealie:${RECIPE.id}`,
        name: 'Tikka',
        recipeUrl: 'http://mealie.local/g/home/r/tikka',
        prepTime: 15,
        photoUrl: `/api/mealie/image/${RECIPE.id}?v=abc`,
        isFavorite: false,
      }],
      page: 1,
      totalPages: 1,
      total: 1,
    });
  });

  it("says which recipes are the hub's Mealie user's favorites, for the hearts", async () => {
    const other = { ...RECIPE, id: '1f1e2d3c-4b5a-4968-8776-655443322110', slug: 'naan', name: 'Naan' };
    vi.mocked(searchMealieRecipes).mockResolvedValue({ items: [RECIPE, other], page: 1, totalPages: 1, total: 2 });
    vi.mocked(getMealieFavoriteIds).mockResolvedValue(new Set([RECIPE.id]));
    const { items } = await (await GET(req())).json();
    expect(items.map((m: { name: string; isFavorite: boolean }) => [m.name, m.isFavorite])).toEqual([['Tikka', true], ['Naan', false]]);
  });

  it('refuses an unknown filter or a made-up category', async () => {
    expect((await GET(req('?filter=everything'))).status).toBe(400);
    expect((await GET(req('?category=Not%20A%20Slug'))).status).toBe(400);
    expect((await GET(req('?cookbook=../x'))).status).toBe(400);
  });

  it('passes a cookbook on to Mealie', async () => {
    await GET(req('?cookbook=weeknight-dinners'));
    expect(searchMealieRecipes).toHaveBeenCalledWith(expect.objectContaining({ cookbook: 'weeknight-dinners' }));
  });

  it('passes a category on to Mealie', async () => {
    await GET(req('?category=dessert'));
    expect(searchMealieRecipes).toHaveBeenCalledWith(expect.objectContaining({ category: 'dessert' }));
  });

  it('says Mealie is not connected', async () => {
    // The real calls, with no address or key saved in the test sandbox.
    const real = await vi.importActual<typeof import('@/lib/mealie')>('@/lib/mealie');
    vi.mocked(searchMealieRecipes).mockImplementationOnce(real.searchMealieRecipes);
    vi.mocked(getMealieContext).mockImplementationOnce(real.getMealieContext);
    const res = await GET(req());
    expect(res.status).toBe(400);
    expect((await res.json()).failure).toBe('not-set-up');
  });

  it('turns a Mealie failure into its plain answer', async () => {
    vi.mocked(searchMealieRecipes).mockRejectedValue(new MealieError('unreachable', 'down'));
    const res = await GET(req());
    expect(res.status).toBe(502);
    expect((await res.json()).failure).toBe('unreachable');
  });
});

describe('who may read it', () => {
  it("lets a wall read it with its display key, for the recipe book", async () => {
    await GET(req());
    expect(requireDisplayAuth).toHaveBeenCalled();
    expect(requireSession).not.toHaveBeenCalled();
  });
});
