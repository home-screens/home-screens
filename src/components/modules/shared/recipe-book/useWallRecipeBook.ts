'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SavedMeal } from '@/types/config';
import type { MealieCategory } from '@/lib/mealie';
import type { LibraryFilter } from '@/lib/meal-constants';
import { displayFetch } from '@/lib/display-fetch';
import { fetchMealieCategories, searchMealieRecipes, type MealieClientProblem } from '@/lib/meal-client';
import { useMealieRecipeBrowser } from '@/components/meals/useMealieRecipeBrowser';
import {
  LOCAL_BOOK_CHIPS, localBookMeals, localBookSearch, mealieBookChips, recipeBookChipId,
  type RecipeBookChip, type RecipeBookSource,
} from '@/lib/meal-recipe-book';

/** While Mealie is not answering, the book asks again this often by itself. */
export const RECIPE_BOOK_RETRY_MS = 60_000;

export interface WallRecipeBook {
  source: RecipeBookSource;
  chips: RecipeBookChip[];
  /** The lit chip; with words typed it stays the one the search will go back to. */
  active: RecipeBookChip;
  choose: (chip: RecipeBookChip) => void;
  query: string;
  setQuery: (query: string) => void;
  items: SavedMeal[];
  /** The first page for the current chip or words is on its way. */
  loading: boolean;
  /** Why Mealie did not answer, or null. */
  problem: MealieClientProblem | null;
  /** How many recipes the chip or the words hold in all. */
  total: number;
  /** How many recipes the whole book holds ("848 recipes"), once known. */
  recipeCount: number | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
  /** The shorter words searched instead, when the typed ones found nothing ("choc" for "choclate"). */
  widenedTo: string | null;
  /** The saved meal the typed words name that has no recipe, when that is why nothing was found. */
  withoutRecipe: SavedMeal | null;
}

/**
 * The recipes the wall's recipe book shows: Mealie's, searched live through
 * the hub with the display's key, or the saved meals with a recipe. Shares the
 * phone's and the editor's Mealie browsing (`useMealieRecipeBrowser`, which
 * opens on Favorites) and the phone's local filters (`localBookMeals`).
 *
 * `enabled` false asks Mealie nothing (another view is showing).
 */
export function useWallRecipeBook({ source, savedMeals, enabled }: {
  source: RecipeBookSource;
  savedMeals: SavedMeal[];
  enabled: boolean;
}): WallRecipeBook {
  const useMealie = enabled && source === 'mealie';
  const browser = useMealieRecipeBrowser(displayFetch, { enabled: useMealie, widen: true });

  // The categories for the chips, and the size of the whole book for the
  // corner of the title and the search box. Without them the book still
  // works from Favorites, Recently made and All. Mealie down when the wall
  // loaded fails these too, so they ask again once it answers.
  const [categories, setCategories] = useState<MealieCategory[]>([]);
  const [recipeCount, setRecipeCount] = useState<number | null>(null);
  const { recovered } = browser.search;
  useEffect(() => {
    if (!useMealie) return;
    const controller = new AbortController();
    fetchMealieCategories(displayFetch, controller.signal).then(setCategories, () => {});
    searchMealieRecipes(displayFetch, { filter: 'all' }, controller.signal).then((page) => setRecipeCount(page.total), () => {});
    return () => controller.abort();
  }, [useMealie, recovered]);

  // ── A family without Mealie ──
  const [localQuery, setLocalQuery] = useState('');
  const [localFilter, setLocalFilter] = useState<LibraryFilter>('all');
  const recipeMeals = useMemo(() => localBookMeals(savedMeals, '', 'all'), [savedMeals]);
  const local = useMemo(() => localBookSearch(savedMeals, localQuery, localFilter), [savedMeals, localQuery, localFilter]);

  // Mealie not answering: ask again once a minute, nobody has to be there.
  // Here rather than in a view, so the full-screen book and the small
  // Recipes column (whose message promises it) both come back by themselves.
  const { problem, retry } = browser.search;
  useEffect(() => {
    if (!useMealie || !problem) return;
    const id = setInterval(retry, RECIPE_BOOK_RETRY_MS);
    return () => clearInterval(id);
  }, [useMealie, problem, retry]);

  const mealieChips = useMemo(() => mealieBookChips(browser.cookbooks, categories), [browser.cookbooks, categories]);
  const { choose: chooseMealie, shortcut } = browser;
  const activeMealie = useMemo<RecipeBookChip>(() => {
    const found = shortcut.kind === 'cookbook' || shortcut.kind === 'category'
      ? mealieChips.find((c) => recipeBookChipId(c) === `${shortcut.kind}:${shortcut.slug}`)
      : shortcut.kind === 'search' ? undefined : mealieChips.find((c) => c.kind === 'mealie' && c.filter === shortcut.kind);
    return found ?? mealieChips[0];
  }, [shortcut, mealieChips]);
  // The words typed hide which chip was lit; remember it so clearing the box goes back.
  const [lastMealieChip, setLastMealieChip] = useState<RecipeBookChip>(mealieChips[0]);
  useEffect(() => {
    if (shortcut.kind !== 'search') setLastMealieChip(activeMealie);
  }, [shortcut.kind, activeMealie]);

  const choose = useCallback((chip: RecipeBookChip) => {
    if (chip.kind === 'local') {
      setLocalQuery('');
      setLocalFilter(chip.filter);
    } else if (chip.kind === 'mealie') chooseMealie(chip.filter);
    else if (chip.kind === 'cookbook') chooseMealie({ cookbook: chip.slug });
    else chooseMealie({ category: chip.slug });
  }, [chooseMealie]);

  if (source === 'local') {
    return {
      source,
      chips: [...LOCAL_BOOK_CHIPS],
      active: { kind: 'local', filter: localFilter },
      choose,
      query: localQuery,
      setQuery: setLocalQuery,
      items: local.items,
      loading: false,
      problem: null,
      total: local.items.length,
      recipeCount: recipeMeals.length,
      hasMore: false,
      loadMore: () => {},
      retry: () => {},
      widenedTo: local.widenedTo,
      withoutRecipe: local.withoutRecipe,
    };
  }

  const { search } = browser;
  return {
    source,
    chips: mealieChips,
    active: shortcut.kind === 'search' ? lastMealieChip : activeMealie,
    choose,
    query: browser.query,
    setQuery: browser.setQuery,
    items: search.items,
    loading: search.loading,
    problem: search.problem,
    total: search.total,
    recipeCount,
    hasMore: search.hasMore,
    loadMore: search.loadMore,
    retry: search.retry,
    widenedTo: search.widenedTo,
    withoutRecipe: null,
  };
}
