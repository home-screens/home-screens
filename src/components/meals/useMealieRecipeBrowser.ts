'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MealCourseKind } from '@/types/config';
import type { MealFetch } from '@/lib/meal-client';
import type { MealieCategory, MealieCookbook, MealieRecipeFilter } from '@/lib/mealie';
import { useMealieRecipeSearch, type MealieRecipeSearch } from './useMealieRecipeSearch';
import { useMealieCookbooks } from './useMealieCookbooks';
import { useMealieCourseCategory } from './useMealieCourseCategory';

/**
 * What a list of Mealie recipes is showing: the typed words, one of the
 * shortcuts (Favorites, Recently made, All), a category or a cookbook. Each
 * surface picks its heading, its empty message and its lit chip from it.
 */
export type RecipeShortcut =
  | { kind: 'search'; query: string }
  | { kind: 'favorites' }
  | { kind: 'recent' }
  | { kind: 'all' }
  /** `name` is the course's own category's; null for another one (the phone Library's chips). */
  | { kind: 'category'; slug: string; name: string | null }
  | { kind: 'cookbook'; slug: string; name: string };

/** A shortcut chip: one of the filters, or a category or cookbook by slug. */
export type RecipeShortcutChoice = MealieRecipeFilter | { category: string } | { cookbook: string };

export interface MealieRecipeBrowser {
  query: string;
  setQuery: (query: string) => void;
  shortcut: RecipeShortcut;
  /**
   * Show a shortcut, leaving the search box empty. The one already showing,
   * with nothing typed, reads it again (`refresh`): tapping the lit chip is
   * how anyone asks for recipes just added in Mealie.
   */
  choose: (choice: RecipeShortcutChoice) => void;
  /** Read the recipes shown and the cookbooks again, keeping the list on screen meanwhile. */
  refresh: () => void;
  /**
   * Goes up on every `refresh` (the lit chip tapped included), for what a
   * surface reads beside the recipes (its categories, its count) to read
   * again too.
   */
  refreshes: number;
  /** The household's category for the course being chosen ("Side"), when it has one. */
  courseCategory: MealieCategory | null;
  /** The household's cookbooks, for chips after the shortcuts. */
  cookbooks: MealieCookbook[];
  /** The recipes for what is shown. */
  search: MealieRecipeSearch;
  /** The course's category is known; until then nothing is asked, so the list never opens on the wrong one. */
  ready: boolean;
}

/**
 * Browsing Mealie's recipes from a picker or a library: the words typed, the
 * shortcuts, and the search behind them. It opens on Favorites, or, picking
 * a course (`courseKind`), on the household's category for that kind ("Add
 * a side" opens on Side) once it is known. Typing searches everything;
 * choosing a shortcut empties the box. Shared by the phone's and the
 * editor's pickers and libraries, which say each shortcut in their own words.
 *
 * `enabled` false (the plan does not live in Mealie) asks Mealie nothing;
 * `withCookbooks` false is for a list that offers no cookbook chips.
 */
export function useMealieRecipeBrowser(
  fetcher: MealFetch,
  { courseKind = null, enabled = true, withCookbooks = true, widen = false }: {
    courseKind?: MealCourseKind | null;
    enabled?: boolean;
    withCookbooks?: boolean;
    /** Try words that find nothing again shorter (the wall's recipe book; see `useMealieRecipeSearch`). */
    widen?: boolean;
  } = {},
): MealieRecipeBrowser {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<{ filter: MealieRecipeFilter; category?: string; cookbook?: string }>({ filter: 'favorites' });
  const { category: courseCategory, ready } = useMealieCourseCategory(fetcher, enabled ? courseKind : null);
  const [categoryApplied, setCategoryApplied] = useState(false);
  useEffect(() => {
    if (!ready || categoryApplied) return;
    setCategoryApplied(true);
    if (courseCategory) setChosen({ filter: 'all', category: courseCategory.slug });
  }, [ready, categoryApplied, courseCategory]);

  const typed = query.trim();
  const search = useMealieRecipeSearch(fetcher, {
    search: query,
    filter: chosen.filter,
    category: typed ? undefined : chosen.category,
    cookbook: typed ? undefined : chosen.cookbook,
    enabled: enabled && ready,
    widen,
  });
  // Asked again when Mealie answers after an outage, or the chips stay missing,
  // and on a refresh.
  const [refreshes, setRefreshes] = useState(0);
  const cookbooks = useMealieCookbooks(fetcher, enabled && withCookbooks, search.recovered + refreshes);

  const { refresh: refreshSearch } = search;
  const refresh = useCallback(() => {
    refreshSearch();
    setRefreshes((n) => n + 1);
  }, [refreshSearch]);

  const choose = useCallback((choice: RecipeShortcutChoice) => {
    const next: { filter: MealieRecipeFilter; category?: string; cookbook?: string } = typeof choice === 'string'
      ? { filter: choice }
      : 'category' in choice ? { filter: 'all', category: choice.category } : { filter: 'all', cookbook: choice.cookbook };
    if (!typed && next.filter === chosen.filter && next.category === chosen.category && next.cookbook === chosen.cookbook) {
      refresh();
      return;
    }
    setQuery('');
    setChosen(next);
  }, [typed, chosen, refresh]);

  let shortcut: RecipeShortcut;
  if (typed) shortcut = { kind: 'search', query: typed };
  else if (chosen.cookbook) shortcut = { kind: 'cookbook', slug: chosen.cookbook, name: cookbooks.find((c) => c.slug === chosen.cookbook)?.name ?? '' };
  else if (chosen.category) shortcut = { kind: 'category', slug: chosen.category, name: courseCategory?.slug === chosen.category ? courseCategory.name : null };
  else shortcut = { kind: chosen.filter };

  return { query, setQuery, shortcut, choose, refresh, refreshes, courseCategory, cookbooks, search, ready };
}
