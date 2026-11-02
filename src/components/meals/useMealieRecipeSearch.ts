'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedMeal } from '@/types/config';
import { mealieClientProblem, searchMealieRecipes, type MealFetch, type MealieClientProblem } from '@/lib/meal-client';
import type { MealieRecipeFilter } from '@/lib/mealie';
import { spellingFallbacks } from '@/lib/meal-recipe-book';

/** Long enough that typing "lasagne" asks Mealie once, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;

export interface MealieRecipeSearch {
  items: SavedMeal[];
  /** True while the first page for the current words is on its way. */
  loading: boolean;
  /** Mealie's plain refusal, or null. */
  error: string | null;
  /** Why it failed, for the message a surface shows: not connected, token refused, unreachable, or this device not reaching the hub. */
  problem: MealieClientProblem | null;
  /** How many recipes match in all, across pages. */
  total: number;
  hasMore: boolean;
  /** Fetch the next page and add it to `items`. */
  loadMore: () => void;
  /** Ask again (after Mealie failed). */
  retry: () => void;
  /** The shorter words searched instead, when `widen` is on and the typed ones found nothing. */
  widenedTo: string | null;
  /**
   * Goes up each time Mealie answers after failing. What a surface asked
   * Mealie for beside the recipes (cookbooks, categories, the count) failed
   * along with them, and asks again when this changes.
   */
  recovered: number;
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
  { search, filter, category, cookbook, enabled, widen = false }: {
    search: string;
    filter: MealieRecipeFilter;
    /** Only this Mealie category (by slug), with the filter `all`. */
    category?: string;
    /** Only this Mealie cookbook (by slug), with the filter `all`. */
    cookbook?: string;
    enabled: boolean;
    /**
     * Words that find nothing are tried again shorter (`spellingFallbacks`),
     * for the wall's recipe book, where a child spells "choclate". Off for
     * pickers, where a shorter search under the typed words would mislead.
     */
    widen?: boolean;
  },
): MealieRecipeSearch {
  const [items, setItems] = useState<SavedMeal[]>([]);
  // Loading from the first render: an empty list before the first answer
  // read as "no favorites yet".
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<MealieClientProblem | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [widenedTo, setWidenedTo] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(0);
  const failedRef = useRef(false);
  const query = search.trim();
  const key = `${filter}|${category ?? ''}|${cookbook ?? ''}|${query}|${attempt}`;
  const keyRef = useRef(key);
  keyRef.current = key;
  // The furthest page asked for under these words. A list near its end fires
  // a scroll event every frame, and `page` only moves once the answer has
  // re-rendered, so without this each event asked for the same page again.
  const askedRef = useRef({ key, page: 1 });

  // First page for these words, after a short pause in the typing.
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const startedFor = keyRef.current;
    setLoading(true);
    setError(null);
    setProblem(null);
    const timer = setTimeout(() => {
      const ask = (words: string) => searchMealieRecipes(fetcher, { search: words, filter: words ? 'all' : filter, category, cookbook, page: 1 }, controller.signal);
      ask(query)
        .then(async (result) => {
          let shown = result;
          let widened: string | null = null;
          for (const part of widen && query && result.total === 0 ? spellingFallbacks(query) : []) {
            const wider = await ask(part);
            if (wider.total > 0) { shown = wider; widened = part; break; }
          }
          if (failedRef.current) {
            failedRef.current = false;
            setRecovered((n) => n + 1);
          }
          setWidenedTo(widened);
          setItems(shown.items);
          setPage(1);
          askedRef.current = { key: startedFor, page: 1 };
          setTotalPages(shown.totalPages);
          setTotal(shown.total);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          failedRef.current = true;
          setItems([]);
          setError(err instanceof Error ? err.message : String(err));
          setProblem(mealieClientProblem(err));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, query ? SEARCH_DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetcher, query, filter, category, cookbook, enabled, attempt, widen]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || page >= totalPages) return;
    const startedFor = keyRef.current;
    const next = page + 1;
    const asked = askedRef.current;
    if (asked.key === startedFor && asked.page >= next) return;
    askedRef.current = { key: startedFor, page: next };
    const words = widenedTo ?? query;
    searchMealieRecipes(fetcher, { search: words, filter: words ? 'all' : filter, category, cookbook, page: next })
      .then((result) => {
        // The words changed while this page was out: it belongs to old results.
        if (keyRef.current !== startedFor) return;
        setItems((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...result.items.filter((m) => !seen.has(m.id))];
        });
        setPage(next);
      })
      .catch(() => {
        // The list keeps what it has; scrolling again asks for this page again.
        const now = askedRef.current;
        if (now.key === startedFor && now.page === next) askedRef.current = { key: startedFor, page: next - 1 };
      });
  }, [enabled, loading, page, totalPages, fetcher, query, widenedTo, filter, category, cookbook]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { items, loading, error, problem, total, hasMore: page < totalPages, loadMore, retry, widenedTo, recovered };
}
