'use client';

import { useEffect } from 'react';
import { subscribeRevisions, type DisplayRevisions } from '@/lib/display-heartbeat';
import { displayCache } from '@/lib/display-cache';
import { isCalendarReadUrl } from '@/lib/calendar-sources';
import { isLibraryListUrl, mealsDataUrl } from '@/lib/fetch-keys';

/**
 * Re-reads the wall's cached answers for one kind of data when the hub says
 * that data changed, instead of waiting for the reads' own poll.
 *
 * Each answer says which revision it was read at, and every heartbeat names
 * the current one; an answer that is behind is re-read. Comparing each answer
 * with the revision it was read at, rather than with the first beat this page
 * saw, also catches a change made while the wall was starting up. An answer
 * stays until a re-read replaces it, so one whose re-read failed is still
 * behind on the next beats and is asked for again; one no card is showing is
 * dropped instead, and read fresh when one does.
 *
 * A new revision is acted on once it has held for a whole beat. A phone
 * sending twelve photos one after another moves the library's twelve times,
 * and every re-read that comes back a different length restarts the slideshow
 * from its first picture, so the wall waits for the burst to end and re-reads
 * once.
 */
export function useRevisionRefresh(
  field: keyof Pick<DisplayRevisions, 'library' | 'calendar' | 'meals'>,
  isRead: (url: string) => boolean,
): void {
  useEffect(() => {
    let pending: string | undefined;
    return subscribeRevisions((revisions) => {
      const current = revisions[field];
      if (current === undefined) return;
      // Answers from a hub that does not say their revision are left to their poll.
      const behind = displayCache
        .revisionsWhere(isRead)
        .filter((entry) => entry.revision !== undefined && entry.revision !== current);
      if (behind.length === 0) {
        pending = undefined;
        return;
      }
      if (current !== pending) {
        pending = current;
        return;
      }
      pending = undefined;
      const stale = new Set(behind.map((entry) => entry.url));
      displayCache.refreshWhere((url) => stale.has(url));
    });
  }, [field, isRead]);
}

/** Slideshow lists, after an upload, delete, move, rename or import. */
export function useLibraryRefresh(): void {
  useRevisionRefresh('library', isLibraryListUrl);
}

/** The calendar, after a Google Calendar sign-in or disconnect. */
export function useCalendarRefresh(): void {
  useRevisionRefresh('calendar', isCalendarReadUrl);
}

const MEALS_URL = mealsDataUrl();
const isMealsReadUrl = (url: string) => url.split('?')[0] === MEALS_URL;

/** The meals, after a phone or the editor saved, planned, hearted or ticked something. */
export function useMealsRefresh(): void {
  useRevisionRefresh('meals', isMealsReadUrl);
}
