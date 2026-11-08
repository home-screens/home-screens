'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedMeal } from '@/types/config';
import { mealieClientProblem, searchMealieRecipes, type MealFetch, type MealieClientProblem, type MealieRecipePage } from '@/lib/meal-client';
import type { MealieRecipeFilter } from '@/lib/mealie';
import { spellingFallbacks } from '@/lib/meal-recipe-book';
import { noteMealsLoaded } from './useMealFavorite';

/** Long enough that typing "lasagne" asks Mealie once, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;

export interface MealieRecipeSearch {
  items: SavedMeal[];
  /** True while the first page for the current words is on its way. */
  loading: boolean;
  /**
   * The items on hand were asked for with other words or another chip, and
   * the answer for these is still on its way: a surface marks them as old
   * rather than letting the new heading sit over them.
   */
  outdated: boolean;
  /** Mealie's plain refusal, or null. */
  error: string | null;
  /** Why it failed, for the message a surface shows: not connected, token refused, unreachable, or this device not reaching the hub. */
  problem: MealieClientProblem | null;
  /** How many recipes match in all, across pages. */
  total: number;
  hasMore: boolean;
  /** Fetch the next page and add it to `items`. Does nothing after `moreFailed` until `retryMore`. */
  loadMore: () => void;
  /** The next page is on its way. */
  loadingMore: boolean;
  /**
   * The next page did not come; the list keeps what it has, and scrolling
   * near the end no longer asks (a list whose end changes size would ask
   * again every frame, hammering a Mealie that is down). `retryMore` asks.
   */
  moreFailed: boolean;
  /** Ask again for the page that did not come (a Try again button). */
  retryMore: () => void;
  /** Ask again (after Mealie failed). */
  retry: () => void;
  /**
   * Read the first page for the same words or chip again, keeping the list on
   * screen until the answer is in (no loading state, no skeleton), for a list
   * Mealie may have changed under: a recipe added, deleted, renamed or
   * hearted elsewhere. Pages read further down are dropped, so the next ones
   * are read against the book as it is now.
   */
  refresh: () => void;
  /**
   * Goes up each time `refresh` changed what is listed: a list scrolled down
   * goes back to the top.
   */
  refreshed: number;
  /** The shorter words searched instead, when `widen` is on and the typed ones found nothing. */
  widenedTo: string | null;
  /**
   * Goes up each time Mealie answers after failing. What a surface asked
   * Mealie for beside the recipes (cookbooks, categories, the count) failed
   * along with them, and asks again when this changes.
   */
  recovered: number;
}

/** The same recipes, as a list draws them. */
function samePage(a: readonly SavedMeal[], b: readonly SavedMeal[]): boolean {
  return a.length === b.length && a.every((meal, i) => JSON.stringify(meal) === JSON.stringify(b[i]));
}

/** `next` after `prev`, without the ones already listed. */
function appendNew(prev: SavedMeal[], next: readonly SavedMeal[]): SavedMeal[] {
  const seen = new Set(prev.map((m) => m.id));
  return [...prev, ...next.filter((m) => !seen.has(m.id))];
}

/**
 * The family's Mealie recipes for a picker: searched live in Mealie as the
 * words change, or the household's favorites or recently made recipes when
 * nothing is typed. Shared by the phone's and the editor's pickers and the
 * wall's recipe book, which draw it their own way.
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
  const [refreshed, setRefreshed] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const failedRef = useRef(false);
  const query = search.trim();
  // What is asked for, and that again with the attempt (a retry asks again for the same).
  const asking = `${filter}|${category ?? ''}|${cookbook ?? ''}|${query}`;
  const key = `${asking}|${attempt}`;
  const keyRef = useRef(key);
  keyRef.current = key;
  // What the items on hand were asked for.
  const [itemsFor, setItemsFor] = useState<string | null>(null);
  // Goes up whenever the list is read afresh (a first page or a refresh), so
  // a later page asked for before it is not added to the new list.
  const generationRef = useRef(0);
  // The furthest page asked for under these words. A list near its end fires
  // a scroll event every frame, and `page` only moves once the answer has
  // re-rendered, so without this each event asked for the same page again.
  const askedRef = useRef({ key, page: 1 });
  const listRef = useRef({ items, page, total, widenedTo, loading });
  listRef.current = { items, page, total, widenedTo, loading };
  const refreshingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /** The first page for the current words, tried shorter when they find nothing and `widen` is on. */
  const readFirstPage = useCallback(async (signal?: AbortSignal) => {
    const ask = (words: string) => searchMealieRecipes(fetcher, { search: words, filter: words ? 'all' : filter, category, cookbook, page: 1 }, signal);
    const result = await ask(query);
    let shown: MealieRecipePage = result;
    let widened: string | null = null;
    for (const part of widen && query && result.total === 0 ? spellingFallbacks(query) : []) {
      const wider = await ask(part);
      if (wider.total > 0) { shown = wider; widened = part; break; }
    }
    return { shown, widened };
  }, [fetcher, query, filter, category, cookbook, widen]);

  /** Show a first page read for `startedFor` (asked for at `askedAt`) as the whole list. */
  const showFirstPage = useCallback((shown: MealieRecipePage, widened: string | null, startedFor: string, askedFor: string, askedAt: number) => {
    if (failedRef.current) {
      failedRef.current = false;
      setRecovered((n) => n + 1);
    }
    generationRef.current += 1;
    noteMealsLoaded(shown.items, askedAt);
    setWidenedTo(widened);
    setItems(shown.items);
    setItemsFor(askedFor);
    setPage(1);
    askedRef.current = { key: startedFor, page: 1 };
    setTotalPages(shown.totalPages);
    setTotal(shown.total);
    setMoreFailed(false);
    setLoadingMore(false);
    setError(null);
    setProblem(null);
  }, []);

  // First page for these words, after a short pause in the typing.
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const startedFor = keyRef.current;
    setLoading(true);
    setError(null);
    setProblem(null);
    setMoreFailed(false);
    const timer = setTimeout(() => {
      const askedAt = Date.now();
      readFirstPage(controller.signal)
        .then(({ shown, widened }) => showFirstPage(shown, widened, startedFor, asking, askedAt))
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          failedRef.current = true;
          setItems([]);
          setItemsFor(asking);
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
  }, [readFirstPage, showFirstPage, asking, query, enabled, attempt]);

  const refresh = useCallback(() => {
    if (!enabled || listRef.current.loading || refreshingRef.current) return;
    const startedFor = keyRef.current;
    const askedFor = asking;
    const askedAt = Date.now();
    refreshingRef.current = true;
    readFirstPage()
      .then(({ shown, widened }) => {
        if (!mountedRef.current || keyRef.current !== startedFor) return;
        const before = listRef.current;
        const changed = before.page > 1 || before.total !== shown.total || before.widenedTo !== widened
          || !samePage(before.items, shown.items);
        // Read again even when nothing moved, so a heart changed here is
        // checked against what Mealie says now (`noteMealsLoaded`).
        showFirstPage(shown, widened, startedFor, askedFor, askedAt);
        if (changed) setRefreshed((n) => n + 1);
      })
      // The list keeps what it has; the next refresh asks again.
      .catch(() => {})
      .finally(() => { refreshingRef.current = false; });
  }, [enabled, asking, readFirstPage, showFirstPage]);

  const askNext = useCallback((again: boolean) => {
    if (!enabled || loading || page >= totalPages || (moreFailed && !again)) return;
    const startedFor = keyRef.current;
    const generation = generationRef.current;
    const next = page + 1;
    const asked = askedRef.current;
    if (asked.key === startedFor && asked.page >= next) return;
    askedRef.current = { key: startedFor, page: next };
    const words = widenedTo ?? query;
    const ask = (n: number) => searchMealieRecipes(fetcher, { search: words, filter: words ? 'all' : filter, category, cookbook, page: n });
    const askedAt = Date.now();
    const current = (): boolean => mountedRef.current && keyRef.current === startedFor && generationRef.current === generation;
    setLoadingMore(true);
    setMoreFailed(false);
    ask(next)
      .then(async (result) => {
        let found = result.items;
        // The book changed since the pages before were read: Mealie's pages
        // are windows by position, so a recipe deleted above moved the first
        // one of this page onto the last page read, where nobody would see
        // it. The page before is read again and what it holds now that is
        // not listed goes first. One added just lists its neighbour twice,
        // which `appendNew` drops.
        if (result.total !== listRef.current.total && next > 1) {
          const before = await ask(next - 1).catch(() => null);
          if (before) found = [...before.items, ...found];
        }
        // The words changed, or the list was read afresh, while this page was out.
        if (!current()) return;
        noteMealsLoaded(found, askedAt);
        setItems((prev) => appendNew(prev, found));
        setPage(next);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setLoadingMore(false);
      })
      .catch(() => {
        // The list keeps what it has; Try again (`retryMore`) asks for this page again.
        const now = askedRef.current;
        if (now.key === startedFor && now.page === next) askedRef.current = { key: startedFor, page: next - 1 };
        if (!current()) return;
        setLoadingMore(false);
        setMoreFailed(true);
      });
  }, [enabled, loading, page, totalPages, moreFailed, fetcher, query, widenedTo, filter, category, cookbook]);
  const loadMore = useCallback(() => askNext(false), [askNext]);
  const retryMore = useCallback(() => askNext(true), [askNext]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    items,
    loading,
    outdated: items.length > 0 && itemsFor !== asking,
    error,
    problem,
    total,
    hasMore: page < totalPages,
    loadMore,
    loadingMore,
    moreFailed,
    retryMore,
    retry,
    refresh,
    refreshed,
    widenedTo,
    recovered,
  };
}
