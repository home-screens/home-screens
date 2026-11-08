'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SavedMeal } from '@/types/config';
import type { MealieCategory } from '@/lib/mealie';
import type { LibraryFilter } from '@/lib/meal-constants';
import { displayFetch } from '@/lib/display-fetch';
import { useRotationHeld } from '@/lib/interaction-hold';
import { fetchMealieCategories, fetchMealieRecipesRevision, searchMealieRecipes, type MealieClientProblem } from '@/lib/meal-client';
import { useMealieRecipeBrowser } from '@/components/meals/useMealieRecipeBrowser';
import { mealHeartsChangedHere, useMealHeartsChangedHere } from '@/components/meals/useMealFavorite';
import { useGoneRecipes } from '@/components/meals/goneRecipes';
import {
  LOCAL_BOOK_CHIPS, localBookMeals, localBookSearch, mealieBookChips, recipeBookChipId,
  type RecipeBookChip, type RecipeBookSource,
} from '@/lib/meal-recipe-book';

/** While Mealie is not answering, the book asks again this often by itself. */
export const RECIPE_BOOK_RETRY_MS = 60_000;

/**
 * How often a book on screen asks the hub whether Mealie's recipes changed
 * (`/api/mealie/recipes/revision`, kept half a minute on the hub). A kitchen
 * wall stays on one screen all day, and its book was read once when the
 * screen came up: recipes added in Mealie never showed.
 */
export const RECIPE_BOOK_CHECK_MS = 60_000;

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
  /** `items` are the last chip's or words', and the answer for these is on its way (`MealieRecipeSearch.outdated`). */
  outdated: boolean;
  /** The next page is on its way. */
  loadingMore: boolean;
  /** The next page did not come; `retryMore` asks again. */
  moreFailed: boolean;
  /** Ask again for the page that did not come. */
  retryMore: () => void;
  /** Goes up when a refresh changed what is listed, so a list scrolled down goes back to the top. */
  refreshed: number;
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
  const { search } = browser;

  // The categories for the chips, and the size of the whole book for the
  // corner of the title and the search box. Without them the book still
  // works from Favorites, Recently made and All. Mealie down when the wall
  // loaded fails these too, so they ask again once it answers, and again on
  // every refresh.
  const [categories, setCategories] = useState<MealieCategory[]>([]);
  const [recipeCount, setRecipeCount] = useState<number | null>(null);
  const { recovered } = search;
  const { refreshes } = browser;
  useEffect(() => {
    if (!useMealie) return;
    const controller = new AbortController();
    fetchMealieCategories(displayFetch, controller.signal).then(setCategories, () => {});
    searchMealieRecipes(displayFetch, { filter: 'all' }, controller.signal).then((page) => setRecipeCount(page.total), () => {});
    return () => controller.abort();
  }, [useMealie, recovered, refreshes]);
  // All with nothing typed is the whole book: its answer is the count too,
  // so the corner never says one number while the heading under it says another.
  const allAnswered = useMealie && browser.shortcut.kind === 'all' && !search.loading && !search.outdated && !search.problem;
  useEffect(() => {
    if (allAnswered) setRecipeCount(search.total);
  }, [allAnswered, search.total]);

  // Read the recipes, the chips (cookbooks in the browser, categories above)
  // and the count again, keeping the book on screen meanwhile.
  const { refresh: refreshMealie } = browser;

  // ── Mealie changed under the book ──
  // Asked once a minute; a change waits until nobody has touched the wall
  // for a while (the rotation hold: a card or sheet open, or a touch on the
  // book in the last minute), so the tiles never move under a finger.
  const held = useRotationHeld();
  const [behind, setBehind] = useState(false);
  const seenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!useMealie) return;
    seenRef.current = null;
    const controller = new AbortController();
    const check = () => {
      fetchMealieRecipesRevision(displayFetch, controller.signal).then((revision) => {
        // The first answer is what the book was read against.
        if (seenRef.current !== null && seenRef.current !== revision) setBehind(true);
        seenRef.current = revision;
      }, () => {});
    };
    check();
    const id = setInterval(check, RECIPE_BOOK_CHECK_MS);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [useMealie]);
  useEffect(() => {
    if (!behind || held || !useMealie) return;
    setBehind(false);
    refreshMealie();
  }, [behind, held, useMealie, refreshMealie]);
  // Read again by hand (the lit chip): nothing left to catch up on.
  useEffect(() => {
    setBehind(false);
  }, [refreshes]);

  // A recipe a card found deleted in Mealie leaves the book at once; the
  // book reads Mealie again as soon as nobody is using it.
  const gone = useGoneRecipes();
  const goneCount = gone.size;
  useEffect(() => {
    if (goneCount > 0) setBehind(true);
  }, [goneCount]);
  const mealieItems = useMemo(
    () => (gone.size === 0 ? search.items : search.items.filter((meal) => !gone.has(meal.id))),
    [search.items, gone],
  );

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
  const { problem, retry } = search;
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
      return;
    }
    // The lit chip again, nothing typed, reads the book again (`useMealieRecipeBrowser`).
    if (chip.kind === 'mealie') chooseMealie(chip.filter);
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
      outdated: false,
      loadingMore: false,
      moreFailed: false,
      retryMore: () => {},
      refreshed: 0,
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

  return {
    source,
    chips: mealieChips,
    active: shortcut.kind === 'search' ? lastMealieChip : activeMealie,
    choose,
    query: browser.query,
    setQuery: browser.setQuery,
    items: mealieItems,
    loading: search.loading,
    outdated: search.outdated,
    loadingMore: search.loadingMore,
    moreFailed: search.moreFailed,
    retryMore: search.retryMore,
    refreshed: search.refreshed,
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
