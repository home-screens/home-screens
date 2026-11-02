import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SavedMeal } from '@/types/config';

let useRecipeShowStore: typeof import('@/stores/recipe-show-store').useRecipeShowStore;

beforeEach(async () => {
  vi.resetModules();
  ({ useRecipeShowStore } = await import('@/stores/recipe-show-store'));
});

const soup: SavedMeal = { id: 'meal-soup', name: 'Tomato Soup', notes: 'Simmer.' };
const chili: SavedMeal = { id: 'mealie:0f1e2d3c-4b5a-4968-8776-655443322110', name: 'Harvest Chili' };

describe('recipe show store', () => {
  it('takes down the recipe the phone names', () => {
    useRecipeShowStore.getState().show(soup);
    useRecipeShowStore.getState().takeDown(soup.id);
    expect(useRecipeShowStore.getState().shown).toBeNull();
  });

  it('leaves up a recipe someone sent since', () => {
    useRecipeShowStore.getState().show(soup);
    useRecipeShowStore.getState().show(chili);
    const before = useRecipeShowStore.getState().shown;
    useRecipeShowStore.getState().takeDown(soup.id);
    expect(useRecipeShowStore.getState().shown).toBe(before);
  });

  it('takes down whatever is up when no recipe is named', () => {
    useRecipeShowStore.getState().show(chili);
    useRecipeShowStore.getState().takeDown();
    expect(useRecipeShowStore.getState().shown).toBeNull();
    // Nothing up: nothing happens.
    useRecipeShowStore.getState().takeDown(soup.id);
    expect(useRecipeShowStore.getState().shown).toBeNull();
  });
});
