// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { FetchError } from '@/lib/fetch-error';

const fetched = vi.hoisted(() => ({ answer: [null, null, null] as [unknown, FetchError | null, number | null] }));
vi.mock('@/hooks/useFetchData', () => ({ useFetchData: vi.fn(() => fetched.answer) }));

import { useFetchData } from '@/hooks/useFetchData';
import { resetGoneRecipes, useGoneRecipes } from '@/components/meals/goneRecipes';
import { MEALIE_RECIPE_TTL_MS, useMealRecipe } from '../useMealRecipe';

const ID = '0f1e2d3c-4b5a-4968-8776-655443322110';
const MEAL = { id: `mealie:${ID}`, name: 'Carrot cake' };

afterEach(() => {
  cleanup();
  resetGoneRecipes();
  vi.clearAllMocks();
});

describe('useMealRecipe', () => {
  /* A recipe deleted in Mealie said "Couldn't get the recipe right now", as if it might come back. */
  it('says a recipe Mealie no longer has is gone, and the book hears of it', () => {
    fetched.answer = [null, { kind: 'transient', message: 'That recipe is no longer in Mealie.', reason: 'gone' }, null];
    const { result } = renderHook(() => ({ recipe: useMealRecipe(MEAL), gone: useGoneRecipes() }));
    expect(result.current.recipe).toEqual({ status: 'gone' });
    expect(result.current.gone.has(MEAL.id)).toBe(true);
  });

  it('still says "not right now" when the hub or Mealie is only down', () => {
    fetched.answer = [null, { kind: 'transient', message: 'Mealie did not answer' }, null];
    const { result } = renderHook(() => ({ recipe: useMealRecipe(MEAL), gone: useGoneRecipes() }));
    expect(result.current.recipe).toEqual({ status: 'failed' });
    expect(result.current.gone.size).toBe(0);
  });

  it("keeps a recipe a minute, as long as the hub does, so a fix in Mealie reaches the card", () => {
    fetched.answer = [null, null, null];
    renderHook(() => useMealRecipe(MEAL));
    expect(MEALIE_RECIPE_TTL_MS).toBe(60_000);
    expect(vi.mocked(useFetchData)).toHaveBeenCalledWith(`/api/mealie/recipe/${ID}`, MEALIE_RECIPE_TTL_MS);
  });
});
