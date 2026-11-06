import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/mealie', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mealie')>();
  return { ...real, getMealieContext: vi.fn(), getMealieRecipe: vi.fn(), getMealieFavoriteIds: vi.fn() };
});

import { GET } from '../route';
import { getMealieContext, getMealieFavoriteIds, getMealieRecipe, MealieError } from '@/lib/mealie';

const ID = '0f1e2d3c-4b5a-4968-8776-655443322110';
const get = (id: string, query = '') => GET(new NextRequest(`http://localhost/api/mealie/recipe/${id}${query}`), { params: Promise.resolve({ recipeId: id }) });

describe('GET /api/mealie/recipe/[recipeId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMealieContext).mockResolvedValue({ baseUrl: 'http://mealie.local', groupSlug: 'home' });
    vi.mocked(getMealieFavoriteIds).mockResolvedValue(new Set([ID]));
  });

  it('answers the ingredients and steps as plain lines, with section headings', async () => {
    vi.mocked(getMealieRecipe).mockResolvedValue({
      id: ID, slug: 'chili', name: 'Chili', description: ' Warm. ',
      recipeIngredient: [{ title: 'For the pot', display: '1 lb beans' }, { display: '', note: '2 onions' }, { display: '' }],
      recipeInstructions: [{ title: '', text: 'Simmer.' }, { title: 'Serve', text: 'Top with cheese.' }, { text: ' ' }],
    });
    const body = await (await get(ID)).json();
    // The wall's recipe card draws its heart from this.
    expect(body.meal).toMatchObject({ id: `mealie:${ID}`, name: 'Chili', recipeUrl: 'http://mealie.local/g/home/r/chili', isFavorite: true });
    expect(body.description).toBe('Warm.');
    expect(body.ingredients).toEqual([{ heading: 'For the pot', text: '1 lb beans' }, { text: '2 onions' }]);
    expect(body.steps).toEqual([{ text: 'Simmer.' }, { heading: 'Serve', text: 'Top with cheese.' }]);
  });

  it('multiplies the amounts for a double batch, leaving the meal as Mealie has it', async () => {
    vi.mocked(getMealieRecipe).mockResolvedValue({
      id: ID, slug: 'chili', name: 'Chili', recipeServings: 4,
      recipeIngredient: [
        { quantity: 1, unit: { name: 'pound', pluralName: 'pounds', fraction: true }, food: { name: 'beans' }, display: '1 pound beans' },
        { quantity: 0, note: 'Salt to taste', display: 'Salt to taste' },
      ],
      recipeInstructions: [{ text: 'Simmer.' }],
    });
    const body = await (await get(ID, '?scale=2')).json();
    expect(body.ingredients).toEqual([{ text: '2 pounds beans' }, { text: 'Salt to taste' }]);
    expect(body.meal.servings).toBe(4);
    expect((await get(ID, '?scale=1')).status).toBe(200);
    for (const bad of ['0', '-1', 'two', '500']) expect((await get(ID, `?scale=${bad}`)).status).toBe(400);
  });

  it('refuses a made-up id and passes Mealie failures on', async () => {
    expect((await get('../../x')).status).toBe(400);
    vi.mocked(getMealieRecipe).mockRejectedValue(new MealieError('unreachable', 'down'));
    expect((await get(ID)).status).toBe(502);
  });

  it('says Mealie is not connected when nothing is saved', async () => {
    const real = await vi.importActual<typeof import('@/lib/mealie')>('@/lib/mealie');
    vi.mocked(getMealieRecipe).mockImplementationOnce(real.getMealieRecipe);
    vi.mocked(getMealieContext).mockImplementationOnce(real.getMealieContext);
    const res = await get(ID);
    expect(res.status).toBe(400);
    expect((await res.json()).failure).toBe('not-set-up');
  });
});
