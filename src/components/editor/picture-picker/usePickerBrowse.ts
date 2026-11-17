'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import type { PickImportKind } from '@/lib/photo-source';
import type { BrowseMatch } from '@/lib/photo-sources/types';
import type { BrowseTile } from './types';

export interface PickerBrowse {
  tiles: BrowseTile[];
  /** True while the first page loads. */
  loading: boolean;
  /** True while Show more loads. */
  loadingMore: boolean;
  hasMore: boolean;
  matched: BrowseMatch[];
  /** The hub's refusal (status and body), or a network failure as status 0. */
  failure: { status: number; body: unknown } | null;
  more: () => void;
  retry: () => void;
}

/**
 * Pages of one picker grid from `/api/photo-source/browse`. A new kind,
 * collection or search starts over at page 1; Show more appends the next
 * page. `enabled` false loads nothing (a source without its key).
 */
export function usePickerBrowse({ kind, collection, query = '', orientation, enabled = true }: {
  kind: PickImportKind;
  collection: string;
  query?: string;
  orientation?: 'portrait' | 'landscape';
  enabled?: boolean;
}): PickerBrowse {
  const [tiles, setTiles] = useState<BrowseTile[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [matched, setMatched] = useState<BrowseMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<PickerBrowse['failure']>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);

  const load = useCallback(async (page: number, gen: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ kind, collection, page: String(page) });
    if (query) params.set('query', query);
    if (orientation) params.set('orientation', orientation);
    try {
      const res = await editorFetch(`/api/photo-source/browse?${params}`, { signal });
      const body = await res.json().catch(() => null) as { items?: BrowseTile[]; nextPage?: number | null; matched?: BrowseMatch[] } | null;
      if (gen !== generation.current) return;
      if (!res.ok || !body) {
        setFailure({ status: res.status, body });
        return;
      }
      setTiles((prev) => (page === 1 ? body.items ?? [] : [...prev, ...(body.items ?? []).filter((item) => !prev.some((tile) => tile.ref === item.ref))]));
      if (page === 1) setMatched(body.matched ?? []);
      setNextPage(body.nextPage ?? null);
    } catch (err) {
      if (signal?.aborted || isSessionExpired(err) || gen !== generation.current) return;
      setFailure({ status: 0, body: null });
    }
  }, [kind, collection, query, orientation]);

  useEffect(() => {
    const gen = ++generation.current;
    setTiles([]);
    setNextPage(null);
    setMatched([]);
    setFailure(null);
    setLoadingMore(false);
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void load(1, gen, controller.signal).finally(() => {
      if (gen === generation.current) setLoading(false);
    });
    return () => controller.abort();
  }, [load, enabled, attempt]);

  const more = useCallback(() => {
    if (nextPage === null || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    void load(nextPage, gen).finally(() => {
      if (gen === generation.current) setLoadingMore(false);
    });
  }, [nextPage, loadingMore, load]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { tiles, loading, loadingMore, hasMore: nextPage !== null, matched, failure, more, retry };
}
