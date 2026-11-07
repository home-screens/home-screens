'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SavedMeal } from '@/types/config';
import type { MealieCategory } from '@/lib/mealie';
import type { LibraryFilter } from '@/lib/meal-constants';
import { displayFetch } from '@/lib/display-fetch';
import { fetchMealieCategories, searchMealieRecipes, type MealieClientProblem } from '@/lib/meal-client';
import { useMealieRecipeBrowser } from '@/components/meals/useMealieRecipeBrowser';
import { mealHeartsChangedHere, useMealHeartsChangedHere } from '@/components/meals/useMealFavorite';
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
  /** How many saved meals are not in the book because they have no recipe (local books only). */
  withoutRecipeCount: number;
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
  // Hearts changed on the wall count before the meals load again (about a
  // minute): one just hearted is on Favorites at once, and choosing the chip
  // leaves out one just taken off. While Favorites is up, a heart taken off
  // there keeps its tile, drawn empty, until the meals load again, so the
  // tile does not jump away under the finger. The hearts only choose which
  // recipes are listed: the tiles get the meals as loaded, since a heart that
  // read its own change back as loaded would take it for saved and forget it.
  const heartsHere = useMealHeartsChangedHere();
  const [heartsAtChoose, setHeartsAtChoose] = useState(mealHeartsChangedHere);
  const bookMeals = useMemo(() => {
    if (heartsHere.size === 0 && heartsAtChoose.size === 0) return savedMeals;
    return savedMeals.map((meal) => {
      const isFavorite = heartsHere.get(meal.id) === true || (heartsAtChoose.get(meal.id) ?? meal.isFavorite === true);
      return isFavorite === (meal.isFavorite === true) ? meal : { ...meal, isFavorite };
    });
  }, [savedMeals, heartsHere, heartsAtChoose]);
  const recipeMeals = useMemo(() => localBookMeals(bookMeals, '', 'all'), [bookMeals]);
  // Typed words search the whole book: the chip row is out of sight while
  // the keyboard is up, so a chip still narrowing the search was a filter
  // nobody could see.
  const local = useMemo(() => {
    const found = localBookSearch(bookMeals, localQuery, localQuery.trim() ? 'all' : localFilter);
    if (bookMeals === savedMeals) return found;
    const loaded = new Map(savedMeals.map((meal) => [meal.id, meal]));
    return { ...found, items: found.items.map((meal) => loaded.get(meal.id) ?? meal) };
  }, [bookMeals, savedMeals, localQuery, localFilter]);
  // The chips with something behind them: All and Favorites always (the
  // empty Favorites page says how to add one), the rest only when a recipe
  // would show, so an untagged household is not offered a row of dead ends.
  const localChips = useMemo(
    () => LOCAL_BOOK_CHIPS.filter((chip) => chip.kind !== 'local' || chip.filter === 'all' || chip.filter === 'favorites'
      || chip.filter === localFilter || localBookMeals(bookMeals, '', chip.filter).length > 0),
    [bookMeals, localFilter],
  );

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
      setHeartsAtChoose(mealHeartsChangedHere());
    } else if (chip.kind === 'mealie') chooseMealie(chip.filter);
    else if (chip.kind === 'cookbook') chooseMealie({ cookbook: chip.slug });
    else chooseMealie({ category: chip.slug });
  }, [chooseMealie]);

  if (source === 'local') {
    return {
      source,
      chips: localChips,
      active: { kind: 'local', filter: localFilter },
      choose,
      query: localQuery,
      setQuery: setLocalQuery,
      items: local.items,
      loading: false,
      problem: null,
      total: local.items.length,
      recipeCount: recipeMeals.length,
      withoutRecipeCount: Math.max(0, savedMeals.length - recipeMeals.length),
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
    withoutRecipeCount: 0,
  };
}
