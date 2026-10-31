'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedMeal } from '@/types/config';
import { MealClientError, searchMealieRecipes, type MealFetch, type MealieRecipeFilter } from '@/lib/meal-client';
import type { MealieProblem } from '@/lib/meal-sources';

/** Long enough that typing "lasagne" asks Mealie once, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;

export interface MealieRecipeSearch {
  items: SavedMeal[];
  /** True while the first page for the current words is on its way. */
  loading: boolean;
  /** Mealie's plain refusal, or null. */
  error: string | null;
  /** Why it failed, for the message a surface shows: not connected, token refused, unreachable. */
  problem: MealieProblem | null;
  /** How many recipes match in all, across pages. */
  total: number;
  hasMore: boolean;
  /** Fetch the next page and add it to `items`. */
  loadMore: () => void;
  /** Ask again (after Mealie failed). */
  retry: () => void;
}

/**
 * The family's Mealie recipes for a picker: searched live in Mealie as the
 * words change, or the household's favorites or recently made recipes when
 * nothing is typed. Shared by the phone's and the editor's pickers, which
 * draw it their own way.
 *
 * `enabled` false (the plan does not live in Mealie, or the picker is closed)
 * asks nothing.
 */
export function useMealieRecipeSearch(
  fetcher: MealFetch,
  { search, filter, category, enabled }: {
    search: string;
    filter: MealieRecipeFilter;
    /** Only this Mealie category (by slug), with the filter `all`. */
    category?: string;
    enabled: boolean;
  },
): MealieRecipeSearch {
  const [items, setItems] = useState<SavedMeal[]>([]);
  // Loading from the first render: an empty list before the first answer
  // read as "no favorites yet".
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<MealieProblem | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const query = search.trim();
  const key = `${filter}|${category ?? ''}|${query}|${attempt}`;
  const keyRef = useRef(key);
  keyRef.current = key;

  // First page for these words, after a short pause in the typing.
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setProblem(null);
    const timer = setTimeout(() => {
      searchMealieRecipes(fetcher, { search: query, filter: query ? 'all' : filter, category, page: 1 }, controller.signal)
        .then((result) => {
          setItems(result.items);
          setPage(1);
          setTotalPages(result.totalPages);
          setTotal(result.total);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setItems([]);
          setError(err instanceof Error ? err.message : String(err));
          setProblem(err instanceof MealClientError && err.problem ? err.problem : 'unreachable');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, query ? SEARCH_DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetcher, query, filter, category, enabled, attempt]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || page >= totalPages) return;
    const startedFor = keyRef.current;
    const next = page + 1;
    searchMealieRecipes(fetcher, { search: query, filter: query ? 'all' : filter, category, page: next })
      .then((result) => {
        // The words changed while this page was out: it belongs to old results.
        if (keyRef.current !== startedFor) return;
        setItems((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...result.items.filter((m) => !seen.has(m.id))];
        });
        setPage(next);
      })
      .catch(() => { /* the list keeps what it has; scrolling again retries */ });
  }, [enabled, loading, page, totalPages, fetcher, query, filter, category]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { items, loading, error, problem, total, hasMore: page < totalPages, loadMore, retry };
}
