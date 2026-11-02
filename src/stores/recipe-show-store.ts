import { create } from 'zustand';
import type { SavedMeal } from '@/types/config';

interface RecipeShowState {
  /** The recipe a phone put on the wall; `id` changes with every command, so a new one opens a fresh card. */
  shown: { meal: SavedMeal; id: number } | null;
  /** Open a recipe, replacing any on screen. */
  show: (meal: SavedMeal) => void;
  hide: () => void;
  /**
   * A phone's "Take it down": close the recipe it sent, and only that one, so
   * a recipe someone else sent since stays up. No `mealId` closes whatever is up.
   */
  takeDown: (mealId?: string) => void;
}

let counter = 0;

/**
 * The one recipe a phone put on the wall ("Show on the wall" in Meals), drawn
 * by RecipeShowOverlay on the recipe card over whatever screen is up. A newer
 * recipe replaces it; the card's own close, its own idle timer and the
 * phone's "Take it down" take it down, so the store keeps no timer of its own.
 */
export const useRecipeShowStore = create<RecipeShowState>((set) => ({
  shown: null,
  show: (meal) => set({ shown: { meal, id: ++counter } }),
  hide: () => set({ shown: null }),
  takeDown: (mealId) => set((state) => (
    state.shown && (mealId === undefined || state.shown.meal.id === mealId) ? { shown: null } : state
  )),
}));
