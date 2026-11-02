import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// POST /api/display/show-recipe: the phone's "Show on the wall" in Meals. The
// hub turns a meal id into the meal itself and queues it for the wall.

vi.mock('@/lib/display-commands', () => ({
  enqueueCommand: vi.fn(),
  drainCommands: vi.fn(() => []),
  getDisplayStatus: vi.fn(() => null),
  setDisplayStatus: vi.fn(),
  getSharedStateReport: vi.fn(() => null),
  recordSharedStateReport: vi.fn(),
  getProviderHealthReport: vi.fn(() => null),
  recordProviderHealthReport: vi.fn(),
  recordViewportReport: vi.fn(),
  markSharedStateInterest: vi.fn(),
  hasSharedStateInterest: vi.fn(() => false),
}));
vi.mock('@/lib/config', () => ({ readConfig: vi.fn(), writeConfig: vi.fn(), updateConfigAtomic: vi.fn() }));
vi.mock('@/lib/config-cache', () => ({ readConfigCached: vi.fn() }));
vi.mock('@/lib/display-revisions', () => ({ readDisplayRevisions: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/media-token', () => ({ mintMediaToken: vi.fn(async () => null) }));
vi.mock('@/lib/meal-data', () => ({ readMealData: vi.fn() }));
vi.mock('@/lib/mealie', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mealie')>();
  return { ...real, getMealieRecipe: vi.fn(), getMealieContext: vi.fn() };
});

import { POST } from '@/app/api/display/[action]/route';
import { enqueueCommand } from '@/lib/display-commands';
import { readConfigCached } from '@/lib/config-cache';
import { readMealData } from '@/lib/meal-data';
import { getMealieContext, getMealieRecipe, MealieError } from '@/lib/mealie';

const NOW = Date.UTC(2026, 10, 2, 17, 30, 0);
const TEN_MINUTES = 10 * 60_000;
const CHILI_ID = '0f1e2d3c-4b5a-4968-8776-655443322110';
const CHILI = {
  id: CHILI_ID,
  slug: 'harvest-chili',
  name: 'Harvest Chili',
  image: 'abc',
  prepTimeSeconds: 1200,
  performTimeSeconds: 2700,
  recipeServings: 6,
  tags: [{ id: 't1', name: 'Dinner', slug: 'dinner' }],
  recipeIngredient: [{ display: '1 lb ground beef' }],
  recipeInstructions: [{ text: 'Brown the beef.' }],
};
const SOUP = { id: 'meal-1', name: 'Tomato Soup', emoji: '🍅', ingredients: [{ name: 'Tomatoes', quantity: '2 cans' }], notes: 'Simmer.' };
const TOAST = { id: 'meal-2', name: 'Toast', emoji: '🍞' };

function show(body?: Record<string, unknown>, query = '') {
  const request = new NextRequest(`http://localhost/api/display/show-recipe${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ action: 'show-recipe' }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  // A single-display install: an untargeted command goes to the legacy queue.
  vi.mocked(readConfigCached).mockResolvedValue({ screens: [], settings: {} } as never);
  vi.mocked(readMealData).mockResolvedValue({ savedMeals: [SOUP, TOAST], plan: [] } as never);
  vi.mocked(getMealieRecipe).mockResolvedValue(CHILI as never);
  vi.mocked(getMealieContext).mockResolvedValue({ baseUrl: 'http://mealie.local', groupSlug: 'home' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/display/show-recipe', () => {
  it('turns a Mealie recipe into the meal every view draws, and queues it for ten minutes', async () => {
    const res = await show({ mealId: `mealie:${CHILI_ID}` });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, command: 'show-recipe', mealId: `mealie:${CHILI_ID}` });
    expect(getMealieRecipe).toHaveBeenCalledWith(CHILI_ID);
    expect(enqueueCommand).toHaveBeenCalledWith(undefined, 'show-recipe', {
      meal: {
        id: `mealie:${CHILI_ID}`,
        name: 'Harvest Chili',
        recipeUrl: 'http://mealie.local/g/home/r/harvest-chili',
        tags: ['Dinner'],
        prepTime: 20,
        cookTime: 45,
        servings: 6,
        photoUrl: `/api/mealie/image/${CHILI_ID}?v=abc`,
      },
      expiresAt: NOW + TEN_MINUTES,
    });
    // The steps stay in Mealie: the card reads them through the hub itself.
    expect(readMealData).not.toHaveBeenCalled();
  });

  it('sends one of the family\'s saved meals as saved, ingredients and notes included', async () => {
    const res = await show({ mealId: 'meal-1' });

    expect(res.status).toBe(200);
    expect(enqueueCommand).toHaveBeenCalledWith(undefined, 'show-recipe', { meal: SOUP, expiresAt: NOW + TEN_MINUTES });
    expect(getMealieRecipe).not.toHaveBeenCalled();
  });

  it('answers 404 for a saved meal that is gone', async () => {
    const res = await show({ mealId: 'meal-404' });

    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe('gone');
    expect(enqueueCommand).not.toHaveBeenCalled();
  });

  it('answers 404 for a recipe deleted in Mealie, not a Mealie problem', async () => {
    vi.mocked(getMealieRecipe).mockRejectedValue(new MealieError('upstream', 'Mealie answered 404', 404));

    const res = await show({ mealId: `mealie:${CHILI_ID}` });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'That recipe is not in Mealie anymore', reason: 'gone' });
    expect(enqueueCommand).not.toHaveBeenCalled();
  });

  it('says why when Mealie cannot answer, the way the Mealie routes do', async () => {
    vi.mocked(getMealieRecipe).mockRejectedValue(new MealieError('unreachable', 'Mealie did not answer'));
    const down = await show({ mealId: `mealie:${CHILI_ID}` });
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ error: "We couldn't reach Mealie.", failure: 'unreachable' });

    vi.mocked(getMealieRecipe).mockRejectedValue(new MealieError('not-set-up', 'No Mealie'));
    const unset = await show({ mealId: `mealie:${CHILI_ID}` });
    expect(unset.status).toBe(400);
    expect((await unset.json()).failure).toBe('not-set-up');

    expect(enqueueCommand).not.toHaveBeenCalled();
  });

  it('answers 400 for an id that is not a meal id', async () => {
    const bad: unknown[] = [
      undefined,
      '',
      '   ',
      42,
      'x'.repeat(201),
      // Says it is Mealie's, but is not a recipe: a typo, or a plan entry's id.
      'mealie:not-a-recipe',
      'mealie:13.abc123',
    ];
    for (const mealId of bad) {
      const res = await show(mealId === undefined ? {} : { mealId });
      expect(res.status, JSON.stringify(mealId)).toBe(400);
    }
    expect((await show()).status).toBe(400);
    expect(getMealieRecipe).not.toHaveBeenCalled();
    expect(readMealData).not.toHaveBeenCalled();
    expect(enqueueCommand).not.toHaveBeenCalled();
  });

  it('answers 400 for a saved meal with no ingredients or notes to show', async () => {
    const res = await show({ mealId: 'meal-2' });

    expect(res.status).toBe(400);
    expect(enqueueCommand).not.toHaveBeenCalled();
  });

  it('broadcasts with displayId "all", and targets one display by body or query', async () => {
    expect((await show({ mealId: 'meal-1', displayId: 'all' })).status).toBe(200);
    expect(enqueueCommand).toHaveBeenLastCalledWith('all', 'show-recipe', expect.objectContaining({ meal: SOUP }));

    expect((await show({ mealId: 'meal-1', displayId: 'kitchen' })).status).toBe(200);
    expect(enqueueCommand).toHaveBeenLastCalledWith('kitchen', 'show-recipe', expect.objectContaining({ meal: SOUP }));

    expect((await show({ mealId: 'meal-1' }, '?display=all')).status).toBe(200);
    expect(enqueueCommand).toHaveBeenLastCalledWith('all', 'show-recipe', expect.objectContaining({ meal: SOUP }));
  });

  it('goes to the main display when a registry exists and none is named', async () => {
    vi.mocked(readConfigCached).mockResolvedValue({
      screens: [],
      settings: {},
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
    } as never);

    await show({ mealId: 'meal-1' });

    expect(enqueueCommand).toHaveBeenCalledWith('kitchen', 'show-recipe', expect.objectContaining({ meal: SOUP }));
  });

  it('answers 400 for a display id that is not one', async () => {
    const res = await show({ mealId: 'meal-1', displayId: 'Kitchen Wall!' });

    expect(res.status).toBe(400);
    expect(enqueueCommand).not.toHaveBeenCalled();
  });
});

describe('POST /api/display/hide-recipe', () => {
  function hide(body?: Record<string, unknown>, query = '') {
    const request = new NextRequest(`http://localhost/api/display/hide-recipe${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return POST(request, { params: Promise.resolve({ action: 'hide-recipe' }) });
  }

  it('queues the take-down for the wall the recipe went to, naming the recipe', async () => {
    const res = await hide({ mealId: 'meal-1', displayId: 'kitchen' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, command: 'hide-recipe' });
    expect(enqueueCommand).toHaveBeenCalledWith('kitchen', 'hide-recipe', { mealId: 'meal-1' });
    // Nothing to look up: a take-down for a recipe that is not up does nothing on the wall.
    expect(readMealData).not.toHaveBeenCalled();
    expect(getMealieRecipe).not.toHaveBeenCalled();
  });

  it('takes down whatever is up when no recipe is named, and broadcasts like show-recipe', async () => {
    expect((await hide()).status).toBe(200);
    expect(enqueueCommand).toHaveBeenLastCalledWith(undefined, 'hide-recipe', undefined);

    expect((await hide({ mealId: `mealie:${CHILI_ID}` }, '?display=all')).status).toBe(200);
    expect(enqueueCommand).toHaveBeenLastCalledWith('all', 'hide-recipe', { mealId: `mealie:${CHILI_ID}` });
  });

  it('answers 400 for a meal id or display id that is not one', async () => {
    for (const mealId of ['', '   ', 42, 'x'.repeat(201)]) {
      expect((await hide({ mealId })).status, JSON.stringify(mealId)).toBe(400);
    }
    expect((await hide({ mealId: 'meal-1', displayId: 'Kitchen Wall!' })).status).toBe(400);
    expect(enqueueCommand).not.toHaveBeenCalled();
  });
});
