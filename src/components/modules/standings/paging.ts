'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { usePagedFit } from '../shared/usePagedFit';

/** Marks a team row for the fit below. */
export const STANDINGS_ROW_SELECTOR = '[data-standings-row]';

/**
 * Turns through a standings module one step at a time: the pages of the
 * group on screen first, then the next group. A group whose rows all fit is
 * one page, so a table that never clipped turns exactly as it always did.
 *
 * `rowsKey(group)` is everything that changes the rows of that group or
 * their height (see usePagedFit). `visible` is null during a measuring pass,
 * when every row must be rendered.
 */
export function useStandingsPaging(
  groupCount: number,
  rowsKey: (group: number) => string,
  intervalMs: number,
  rowSelector: string = STANDINGS_ROW_SELECTOR,
): {
  ref: RefObject<HTMLDivElement | null>;
  group: number;
  page: number;
  pages: number[][] | null;
  visible: Set<number> | null;
} {
  const [pos, setPos] = useState({ group: 0, page: 0 });
  const pageCountRef = useRef(1);

  useEffect(() => {
    setPos({ group: 0, page: 0 });
    if (groupCount <= 0) return;
    // One timer for both kinds of step. With one group on one page the tick
    // returns the same position and nothing is drawn again.
    const id = setInterval(() => {
      setPos((prev) => {
        if (prev.page + 1 < pageCountRef.current) return { group: prev.group, page: prev.page + 1 };
        if (groupCount <= 1) return prev.page === 0 ? prev : { group: 0, page: 0 };
        return { group: (prev.group + 1) % groupCount, page: 0 };
      });
    }, Math.max(500, intervalMs));
    return () => clearInterval(id);
  }, [groupCount, intervalMs]);

  const group = groupCount > 0 ? pos.group % groupCount : 0;
  const { ref, pages } = usePagedFit(rowSelector, rowsKey(group));
  const pageCount = pages?.length ?? 1;
  pageCountRef.current = pageCount;
  const page = Math.min(pos.page, pageCount - 1);
  const visible = pages ? new Set(pages[page] ?? []) : null;

  return { ref, group, page, pages, visible };
}

/** The measure key for one group's rows. */
export function standingsRowsKey(
  group: { league: string; name: string; entries: { teamAbbr: string }[] } | undefined,
  teamsToShow: number,
  fontSize: number,
): string {
  if (!group) return '';
  const entries = teamsToShow > 0 ? group.entries.slice(0, teamsToShow) : group.entries;
  return `${group.league}|${group.name}|${entries.map((e) => e.teamAbbr).join(',')}|${fontSize}`;
}
