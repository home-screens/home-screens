import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/mealie', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mealie')>();
  return { ...real, getMealieConfig: vi.fn(), getMealieRecipe: vi.fn(), getMealieUser: vi.fn() };
});

import { GET } from '../route';
import { getMealieConfig, getMealieRecipe, getMealieUser, MealieError } from '@/lib/mealie';

const ID = '0f1e2d3c-4b5a-4968-8776-655443322110';
const get = (id: string) => GET(new NextRequest(`http://localhost/api/mealie/recipe/${id}`), { params: Promise.resolve({ recipeId: id }) });

describe('GET /api/mealie/recipe/[recipeId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMealieConfig).mockResolvedValue({ url: 'http://mealie.local', apiKey: 'k' });
    vi.mocked(getMealieUser).mockResolvedValue({ id: 'u', username: 'u', fullName: 'U', group: 'Home', household: 'Family', groupSlug: 'home', householdSlug: 'family' });
  });

  it('answers the ingredients and steps as plain lines, with section headings', async () => {
    vi.mocked(getMealieRecipe).mockResolvedValue({
      id: ID, slug: 'chili', name: 'Chili', description: ' Warm. ',
      recipeIngredient: [{ title: 'For the pot', display: '1 lb beans' }, { display: '', note: '2 onions' }, { display: '' }],
      recipeInstructions: [{ title: '', text: 'Simmer.' }, { title: 'Serve', text: 'Top with cheese.' }, { text: ' ' }],
    });
    const body = await (await get(ID)).json();
    expect(body.meal).toMatchObject({ id: `mealie:${ID}`, name: 'Chili', recipeUrl: 'http://mealie.local/g/home/r/chili' });
    expect(body.description).toBe('Warm.');
    expect(body.ingredients).toEqual([{ heading: 'For the pot', text: '1 lb beans' }, { text: '2 onions' }]);
    expect(body.steps).toEqual([{ text: 'Simmer.' }, { heading: 'Serve', text: 'Top with cheese.' }]);
  });

  it('refuses a made-up id and passes Mealie failures on', async () => {
    expect((await get('../../x')).status).toBe(400);
    vi.mocked(getMealieRecipe).mockRejectedValue(new MealieError('unreachable', 'down'));
    expect((await get(ID)).status).toBe(502);
  });
});
