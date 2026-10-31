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
    getMealieConfig: vi.fn(),
    getMealieUser: vi.fn(),
    searchMealieRecipes: vi.fn(),
  };
});

import { GET } from '../route';
import { getMealieConfig, getMealieUser, searchMealieRecipes, MealieError } from '@/lib/mealie';

const req = (q = '') => new NextRequest(`http://localhost/api/mealie/recipes${q}`);
const RECIPE = { id: '0f1e2d3c-4b5a-4968-8776-655443322110', slug: 'tikka', name: 'Tikka', image: 'abc', prepTime: '15 minutes' };

describe('GET /api/mealie/recipes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMealieConfig).mockResolvedValue({ url: 'http://mealie.local', apiKey: 'k' });
    vi.mocked(getMealieUser).mockResolvedValue({ id: 'u', username: 'u', fullName: 'U', group: 'Home', household: 'Family', groupSlug: 'home', householdSlug: 'family' });
    vi.mocked(searchMealieRecipes).mockResolvedValue({ items: [RECIPE], page: 1, totalPages: 1, total: 1 });
  });

  it('answers with Mealie recipes as saved meals', async () => {
    const res = await GET(req('?search=tik&filter=favorites&page=2'));
    expect(searchMealieRecipes).toHaveBeenCalledWith({ search: 'tik', filter: 'favorites', category: undefined, page: 2 });
    expect(await res.json()).toEqual({
      items: [{
        id: `mealie:${RECIPE.id}`,
        name: 'Tikka',
        recipeUrl: 'http://mealie.local/g/home/r/tikka',
        prepTime: 15,
        photoUrl: `/api/mealie/image/${RECIPE.id}?v=abc`,
      }],
      page: 1,
      totalPages: 1,
      total: 1,
    });
  });

  it('refuses an unknown filter or a made-up category', async () => {
    expect((await GET(req('?filter=everything'))).status).toBe(400);
    expect((await GET(req('?category=Not%20A%20Slug'))).status).toBe(400);
  });

  it('passes a category on to Mealie', async () => {
    await GET(req('?category=dessert'));
    expect(searchMealieRecipes).toHaveBeenCalledWith(expect.objectContaining({ category: 'dessert' }));
  });

  it('says Mealie is not connected', async () => {
    vi.mocked(getMealieConfig).mockResolvedValue(null);
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
