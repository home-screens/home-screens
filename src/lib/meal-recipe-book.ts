import type { SavedMeal } from '@/types/config';
import type { MealieCategory, MealieCookbook, MealieRecipeFilter } from '@/lib/mealie';
import { LIBRARY_FILTERS, type LibraryFilter } from '@/lib/meal-constants';
import { filterLibraryMeals } from '@/lib/meal-dish-rules';
import { mealHasRecipe } from '@/lib/meal-recipe';

/**
 * The wall's recipe book: a family's recipes to browse and cook from, on the
 * full-screen Meal Planner's Recipe book view and the small Meal Planner's
 * Recipes view.
 *
 * With Mealie connected the book is Mealie's recipes, searched live (whatever
 * the plan source; a family planning in Home Screens still keeps its recipes
 * there). Without it, the book is the saved meals that have a recipe of their
 * own: ingredients or notes, the same test the recipe card uses.
 */

export type RecipeBookSource = 'mealie' | 'local';

/** Mealie whenever its address and key are saved; the plan source does not decide. */
export function recipeBookSource(mealieConnected: boolean): RecipeBookSource {
  return mealieConnected ? 'mealie' : 'local';
}

/** One chip across the top of the book. */
export type RecipeBookChip =
  | { kind: 'mealie'; filter: MealieRecipeFilter }
  | { kind: 'cookbook'; slug: string; name: string }
  | { kind: 'category'; slug: string; name: string }
  | { kind: 'local'; filter: LibraryFilter };

/** A stable id for a chip, for keys, test ids and which one is lit. */
export function recipeBookChipId(chip: RecipeBookChip): string {
  switch (chip.kind) {
    case 'mealie': return chip.filter;
    case 'cookbook': return `cookbook:${chip.slug}`;
    case 'category': return `category:${chip.slug}`;
    case 'local': return `local:${chip.filter}`;
  }
}

/**
 * Mealie's chips in the wall's order: Favorites, Recently made and All, then
 * the cookbooks, then the categories. Cookbooks come before categories here
 * (the phone puts them last) because a family made them on purpose, and on a
 * wall only the first two rows of chips show.
 */
export function mealieBookChips(cookbooks: readonly MealieCookbook[], categories: readonly MealieCategory[]): RecipeBookChip[] {
  return [
    { kind: 'mealie', filter: 'favorites' },
    { kind: 'mealie', filter: 'recent' },
    { kind: 'mealie', filter: 'all' },
    ...cookbooks.map((c): RecipeBookChip => ({ kind: 'cookbook', slug: c.slug, name: c.name })),
    ...categories.map((c): RecipeBookChip => ({ kind: 'category', slug: c.slug, name: c.name })),
  ];
}

/** The local book's chips: the phone Library's filters, in its order. */
export const LOCAL_BOOK_CHIPS: readonly RecipeBookChip[] = LIBRARY_FILTERS.map((filter) => ({ kind: 'local', filter }));

/** The saved meals the local book shows for the typed words and the chip, A to Z: only ones with a recipe. */
export function localBookMeals(savedMeals: readonly SavedMeal[], query: string, filter: LibraryFilter): SavedMeal[] {
  return filterLibraryMeals(savedMeals.filter(mealHasRecipe), query, filter)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/**
 * Shorter tries, in order, for words that found nothing, so a child's
 * spelling still lands somewhere: the first four letters of the longest word
 * ("choclate" finds the chocolate recipes through "choc"), then its first
 * three ("wafles" finds the waffles through "waf", the mistake being inside
 * the first four). Only starts shorter than the word itself, and never under
 * three letters, so "pie" has nothing shorter to try.
 */
export function spellingFallbacks(query: string): string[] {
  let longest: string[] = [];
  for (const word of query.trim().toLowerCase().split(/\s+/)) {
    const letters = Array.from(word);
    if (letters.length > longest.length) longest = letters;
  }
  return [4, 3].filter((n) => n < longest.length).map((n) => longest.slice(0, n).join(''));
}

/**
 * A saved meal the typed words name that is not in the book because it has
 * no recipe ("Leftovers", "Eating out"), so the book can say why it is
 * missing instead of "check the spelling".
 */
export function savedMealWithoutRecipe(savedMeals: readonly SavedMeal[], query: string): SavedMeal | null {
  const words = query.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!words) return null;
  return savedMeals.find((m) => m.name.replace(/\s+/g, ' ').toLowerCase().includes(words) && !mealHasRecipe(m)) ?? null;
}

export interface LocalBookSearch {
  items: SavedMeal[];
  /** The shorter words searched instead, when the typed ones found nothing (`spellingFallbacks`). */
  widenedTo: string | null;
  /** The saved meal the words name that has no recipe, when that is why nothing was found. */
  withoutRecipe: SavedMeal | null;
}

/**
 * The local book's answer for the typed words and the chip: the matches, or,
 * when there are none, the meal they name that has no recipe, or else the
 * matches for a shorter try at the spelling.
 */
export function localBookSearch(savedMeals: readonly SavedMeal[], query: string, filter: LibraryFilter): LocalBookSearch {
  const items = localBookMeals(savedMeals, query, filter);
  if (items.length > 0 || !query.trim()) return { items, widenedTo: null, withoutRecipe: null };
  const withoutRecipe = savedMealWithoutRecipe(savedMeals, query);
  if (withoutRecipe) return { items, widenedTo: null, withoutRecipe };
  for (const part of spellingFallbacks(query)) {
    const wider = localBookMeals(savedMeals, part, filter);
    if (wider.length > 0) return { items: wider, widenedTo: part, withoutRecipe: null };
  }
  return { items, widenedTo: null, withoutRecipe: null };
}

/** How many rows chips of these widths take when they wrap greedily at `rowWidth`. */
export function chipRows(widths: readonly number[], rowWidth: number, gap: number): number {
  let rows = 0;
  let used = 0;
  for (const w of widths) {
    if (rows === 0 || used + gap + w > rowWidth + 0.5) {
      rows += 1;
      used = w;
    } else {
      used += gap + w;
    }
  }
  return rows;
}

/**
 * Which chips show when they may take at most `maxRows` rows: as many as fit
 * in their order, then a "+ N more" chip `moreWidth` wide for the rest. Chips
 * never scroll sideways on a wall (a sideways flick changes screens), so what
 * does not fit goes behind that chip. The lit chip (`keep`) always shows,
 * taking the last place when it lives further along.
 *
 * Answers the indexes to draw, in order. `widths` are every chip's width.
 */
export function chipsThatFit(widths: readonly number[], rowWidth: number, gap: number, moreWidth: number, maxRows = 2, keep = -1): number[] {
  const all = widths.map((_, i) => i);
  if (chipRows(widths, rowWidth, gap) <= maxRows) return all;
  for (let take = widths.length - 1; take >= 0; take--) {
    const shown = all.slice(0, take);
    if (keep >= take) shown.push(keep);
    if (chipRows([...shown.map((i) => widths[i]), moreWidth], rowWidth, gap) <= maxRows) return shown;
  }
  return keep >= 0 ? [keep] : [];
}

/** What the line over the tiles says, as a key under `meal-planner.recipeBook.heading` and its values. */
export interface RecipeBookHeading {
  key: 'search' | 'widened' | 'favorites' | 'recent' | 'all' | 'inGroup';
  values: Record<string, string | number>;
  /** The small words on the right ("Best matches first"), as a key under the same object, if any. */
  sideKey?: 'bestFirst' | 'newestFirst';
}

/**
 * The heading over the tiles: the typed words, or the chip with how many
 * recipes it holds. `groupLabel` names a local filter chip ("Desserts");
 * `widenedTo` the shorter words searched when the typed ones found nothing.
 *
 * "Best matches first" only where it is true: the hub puts the recipes with
 * every word first for a Mealie search of several words. One word comes back
 * A to Z, and so does the local book.
 */
export function recipeBookHeading(
  query: string,
  chip: RecipeBookChip,
  total: number,
  groupLabel = '',
  widenedTo: string | null = null,
): RecipeBookHeading {
  const typed = query.trim();
  if (typed && widenedTo) return { key: 'widened', values: { query: typed, part: widenedTo } };
  if (typed) {
    // The hub's own test for "several words" (`searchWords`): three letters or more, each counted once.
    const reordered = chip.kind !== 'local' && new Set(typed.toLowerCase().split(/\s+/).filter((w) => Array.from(w).length >= 3)).size > 1;
    return reordered ? { key: 'search', values: { query: typed }, sideKey: 'bestFirst' } : { key: 'search', values: { query: typed } };
  }
  switch (chip.kind) {
    case 'mealie':
      if (chip.filter === 'favorites') return { key: 'favorites', values: { count: total } };
      if (chip.filter === 'recent') return { key: 'recent', values: {}, sideKey: 'newestFirst' };
      return { key: 'all', values: { count: total } };
    case 'cookbook':
    case 'category':
      return { key: 'inGroup', values: { count: total, group: chip.name } };
    case 'local':
      if (chip.filter === 'all') return { key: 'all', values: { count: total } };
      if (chip.filter === 'favorites') return { key: 'favorites', values: { count: total } };
      return { key: 'inGroup', values: { count: total, group: groupLabel } };
  }
}
