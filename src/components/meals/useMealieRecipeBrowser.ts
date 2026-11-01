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
  /** Show a shortcut, leaving the search box empty. */
  choose: (choice: RecipeShortcutChoice) => void;
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
  { courseKind = null, enabled = true, withCookbooks = true }: { courseKind?: MealCourseKind | null; enabled?: boolean; withCookbooks?: boolean } = {},
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
  const cookbooks = useMealieCookbooks(fetcher, enabled && withCookbooks);

  const typed = query.trim();
  const search = useMealieRecipeSearch(fetcher, {
    search: query,
    filter: chosen.filter,
    category: typed ? undefined : chosen.category,
    cookbook: typed ? undefined : chosen.cookbook,
    enabled: enabled && ready,
  });

  const choose = useCallback((choice: RecipeShortcutChoice) => {
    setQuery('');
    if (typeof choice === 'string') setChosen({ filter: choice });
    else if ('category' in choice) setChosen({ filter: 'all', category: choice.category });
    else setChosen({ filter: 'all', cookbook: choice.cookbook });
  }, []);

  let shortcut: RecipeShortcut;
  if (typed) shortcut = { kind: 'search', query: typed };
  else if (chosen.cookbook) shortcut = { kind: 'cookbook', slug: chosen.cookbook, name: cookbooks.find((c) => c.slug === chosen.cookbook)?.name ?? '' };
  else if (chosen.category) shortcut = { kind: 'category', slug: chosen.category, name: courseCategory?.slug === chosen.category ? courseCategory.name : null };
  else shortcut = { kind: chosen.filter };

  return { query, setQuery, shortcut, choose, courseCategory, cookbooks, search, ready };
}
