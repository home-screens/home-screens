// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { SavedMeal } from '@/types/config';
import { MealClientError, type MealFetch } from '@/lib/meal-client';
import { resetMealFavorites, useMealFavorite } from '../useMealFavorite';

afterEach(() => {
  cleanup();
  resetMealFavorites();
});

const RECIPE = 'mealie:0f1e2d3c-4b5a-4968-8776-655443322110';
const ok = () => vi.fn<MealFetch>().mockResolvedValue(new Response('{}', { status: 200 }));
const sent = (fetcher: Mock<MealFetch>) => fetcher.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

/** Two places drawing the same meal's heart, a tile and the card it opened. */
function twoPlaces(meal: Pick<SavedMeal, 'id' | 'isFavorite'>, fetcher: Mock<MealFetch>, onFailed?: (err: unknown) => void) {
  return renderHook(({ m }) => ({ tile: useMealFavorite(m, fetcher, onFailed), card: useMealFavorite(m, fetcher) }), { initialProps: { m: meal } });
}

describe('useMealFavorite', () => {
  it('changes the heart at once, everywhere the meal is drawn, and saves it', async () => {
    const fetcher = ok();
    const { result } = twoPlaces({ id: RECIPE, isFavorite: false }, fetcher);
    act(() => result.current.tile.toggle());
    expect(result.current.tile.isFavorite).toBe(true);
    expect(result.current.card.isFavorite).toBe(true);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0][0]).toBe('/api/meals/favorite');
    expect(sent(fetcher)).toEqual([{ mealId: RECIPE, favorite: true }]);
  });

  it('puts the heart back and says why when the save fails', async () => {
    const onFailed = vi.fn();
    const refused = vi.fn<MealFetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'No.', failure: 'unreachable' }), { status: 502 }));
    const { result } = twoPlaces({ id: RECIPE, isFavorite: true }, refused, onFailed);
    act(() => result.current.tile.toggle());
    expect(result.current.tile.isFavorite).toBe(false);
    await waitFor(() => expect(result.current.tile.isFavorite).toBe(true));
    expect(onFailed).toHaveBeenCalledWith(expect.any(MealClientError));
    expect((onFailed.mock.calls[0][0] as MealClientError).problem).toBe('unreachable');
  });

  it('keeps a heart taken off while the list still says favorite, so the card does not jump away', async () => {
    const fetcher = ok();
    const { result } = twoPlaces({ id: RECIPE, isFavorite: true }, fetcher);
    act(() => result.current.tile.toggle());
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(result.current.tile.isFavorite).toBe(false);
  });

  it('lets what is loaded lead again once it agrees, so a heart changed later in Mealie shows', async () => {
    const fetcher = ok();
    const { result, rerender } = twoPlaces({ id: RECIPE, isFavorite: false }, fetcher);
    act(() => result.current.tile.toggle());
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    // The list loads again with the heart; then someone takes it off in Mealie.
    rerender({ m: { id: RECIPE, isFavorite: true } });
    await waitFor(() => expect(result.current.tile.isFavorite).toBe(true));
    rerender({ m: { id: RECIPE, isFavorite: false } });
    expect(result.current.tile.isFavorite).toBe(false);
  });

  it('saves two quick taps in the order they were made', async () => {
    let release!: () => void;
    const first = new Promise<Response>((resolve) => { release = () => resolve(new Response('{}', { status: 200 })); });
    const fetcher = vi.fn<MealFetch>().mockReturnValueOnce(first).mockResolvedValue(new Response('{}', { status: 200 }));
    const { result } = twoPlaces({ id: 'tacos', isFavorite: false }, fetcher);
    act(() => result.current.tile.toggle());
    act(() => result.current.tile.toggle());
    expect(result.current.tile.isFavorite).toBe(false);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    release();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(sent(fetcher).map((b) => b.favorite)).toEqual([true, false]);
  });

  it("knows a family recipe without a heart is not a favorite, and waits to hear about a Mealie recipe from the plan", () => {
    const { result } = renderHook(() => ({ own: useMealFavorite({ id: 'tacos' }, ok()), plan: useMealFavorite({ id: RECIPE }, ok()) }));
    expect(result.current.own.isFavorite).toBe(false);
    expect(result.current.plan.isFavorite).toBeNull();
  });
});
