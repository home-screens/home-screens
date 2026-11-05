// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { publishRevisions, __resetHeartbeatForTests } from '@/lib/display-heartbeat';
import { displayCache } from '@/lib/display-cache';
import { useCalendarRefresh, useLibraryRefresh } from '../useRevisionRefresh';

const FAVORITES = '/api/photo-source/media?kind=library&folder=Favorites&media=both';
const HALLWAY = '/api/photo-source/media?kind=library&folder=Beach-week';
const VIDEO_FILE = '/api/backgrounds?media=videos&file=clips%2Fwalk.mp4';

/** Cache a list the way a read of it stores it: with the revision it was read at. */
function listReadAt(url: string, revision: string | undefined) {
  displayCache.storeBody(url, JSON.stringify([url]), 600_000, revision);
}

/** One heartbeat per library revision, in order. */
function beats(...library: string[]) {
  for (const revision of library) publishRevisions({ library: revision });
}

/** Every re-read asked for, in order. */
let asked: string[];
/** Lists a mounted card is showing: it takes a re-read of them on. */
let showing: Set<string>;
function track() {
  asked = [];
  showing = new Set();
  const listener = (e: Event) => {
    const url = (e as CustomEvent<string>).detail;
    asked.push(url);
    if (showing.has(url)) e.preventDefault();
  };
  window.addEventListener('displaycache:refresh', listener);
  return () => window.removeEventListener('displaycache:refresh', listener);
}

let untrack: () => void;
beforeEach(() => {
  __resetHeartbeatForTests();
  displayCache.clear();
  untrack = track();
});

afterEach(() => {
  untrack();
  cleanup();
});

describe('useLibraryRefresh', () => {
  it('leaves lists alone while they are at the revision the heartbeat names', () => {
    listReadAt(FAVORITES, 'r1');
    renderHook(() => useLibraryRefresh());
    beats('r1', 'r1', 'r1');
    expect(asked).toEqual([]);
  });

  it('re-reads a list that is behind once the new revision has held for a beat', () => {
    listReadAt(FAVORITES, 'r1');
    listReadAt(HALLWAY, 'r1');
    renderHook(() => useLibraryRefresh());
    beats('r2');
    expect(asked).toEqual([]);

    beats('r2');
    expect(asked.sort()).toEqual([HALLWAY, FAVORITES].sort());
  });

  it('catches a change made before its first beat, while the wall was starting', () => {
    // The list was read at r1; the first beat this page sees already names r2.
    listReadAt(FAVORITES, 'r1');
    renderHook(() => useLibraryRefresh());
    beats('r2', 'r2');
    expect(asked).toEqual([FAVORITES]);
  });

  it('waits out a burst of uploads and re-reads once, after the last revision holds', () => {
    listReadAt(FAVORITES, 'r0');
    renderHook(() => useLibraryRefresh());
    beats('r1', 'r2', 'r3');
    expect(asked).toEqual([]);

    beats('r3');
    expect(asked).toEqual([FAVORITES]);
  });

  it('keeps a shown list whose re-read failed, and asks again every other beat until an answer lands', () => {
    listReadAt(FAVORITES, 'r1');
    showing.add(FAVORITES);
    renderHook(() => useLibraryRefresh());
    beats('r2', 'r2');
    expect(asked).toEqual([FAVORITES]);
    // The card took it on but its read failed: the answer at r1 is still what the cache holds.
    expect(displayCache.revisionsWhere((url) => url === FAVORITES)).toEqual([{ url: FAVORITES, revision: 'r1' }]);

    beats('r2');
    expect(asked).toHaveLength(1);
    beats('r2');
    expect(asked).toEqual([FAVORITES, FAVORITES]);

    // More uploads while it keeps failing: still behind, still asked for.
    beats('r3', 'r3');
    expect(asked).toHaveLength(3);

    // A read finally lands at the current revision: nothing more to ask.
    listReadAt(FAVORITES, 'r3');
    beats('r3', 'r3', 'r3');
    expect(asked).toHaveLength(3);
  });

  it('drops a list no card is showing, so the card that next shows it reads it fresh', () => {
    listReadAt(FAVORITES, 'r1');
    renderHook(() => useLibraryRefresh());
    beats('r2', 'r2');
    expect(asked).toEqual([FAVORITES]);
    expect(displayCache.peek(FAVORITES)).toBeNull();

    beats('r2', 'r2', 'r3', 'r3');
    expect(asked).toEqual([FAVORITES]);
  });

  it('never re-reads a single-file lookup, another source\'s list, or a list that says no revision', () => {
    displayCache.storeBody(VIDEO_FILE, '[]', 600_000, 'r1');
    displayCache.storeBody('/api/photo-source/media?kind=immich&album=abc', '[]', 600_000, 'r1');
    listReadAt(HALLWAY, undefined);
    renderHook(() => useLibraryRefresh());
    beats('r2', 'r2', 'r2');
    expect(asked).toEqual([]);
  });

  it('ignores beats that name no library revision', () => {
    listReadAt(FAVORITES, 'r1');
    renderHook(() => useLibraryRefresh());
    publishRevisions({ buildId: 'b1' });
    publishRevisions({ buildId: 'b1' });
    expect(asked).toEqual([]);
  });

  it('stops listening when unmounted', () => {
    listReadAt(FAVORITES, 'r1');
    const { unmount } = renderHook(() => useLibraryRefresh());
    beats('r2');
    unmount();
    beats('r2', 'r2');
    expect(asked).toEqual([]);
  });
});

describe('displayCache.revisionsWhere', () => {
  it('lists the matching cached URLs with the revision each answer is at', () => {
    listReadAt(FAVORITES, 'r7');
    displayCache.set('/api/other', { a: 1 }, 1000);
    expect(displayCache.revisionsWhere((url) => url.startsWith('/api/photo-source/media'))).toEqual([
      { url: FAVORITES, revision: 'r7' },
    ]);
  });
});

const WEEK = '/api/calendar?calendarIds=family&timeMin=2026-09-27T05%3A00%3A00.000Z';
const MONTH = '/api/calendar?calendarIds=family&timeMin=2026-08-31T05%3A00%3A00.000Z&timeMax=2026-10-12T05%3A00%3A00.000Z';

describe('useCalendarRefresh', () => {
  /** Cache a calendar answer the way a read stores it: with the calendar revision it was read at. */
  function calendarReadAt(url: string, revision: string | undefined) {
    displayCache.storeBody(url, JSON.stringify({ events: [], sourceStatus: [] }), 300_000, revision);
  }

  it('re-reads every calendar answer from before a sign-in once the new revision has held for a beat', () => {
    calendarReadAt(WEEK, 'c1');
    calendarReadAt(MONTH, 'c1');
    renderHook(() => useCalendarRefresh());
    publishRevisions({ calendar: 'c2' });
    expect(asked).toEqual([]);

    publishRevisions({ calendar: 'c2' });
    expect(asked.sort()).toEqual([WEEK, MONTH].sort());
  });

  it('leaves the calendar alone while the library moves, and the library alone while the calendar moves', () => {
    calendarReadAt(WEEK, 'c1');
    listReadAt(FAVORITES, 'r1');
    renderHook(() => useCalendarRefresh());
    renderHook(() => useLibraryRefresh());

    publishRevisions({ calendar: 'c1', library: 'r2' });
    publishRevisions({ calendar: 'c1', library: 'r2' });
    expect(asked).toEqual([FAVORITES]);

    listReadAt(FAVORITES, 'r2');
    publishRevisions({ calendar: 'c2', library: 'r2' });
    publishRevisions({ calendar: 'c2', library: 'r2' });
    expect(asked).toEqual([FAVORITES, WEEK]);
  });

  it('never re-reads the status or calendar-list routes, or an answer that says no revision', () => {
    displayCache.storeBody('/api/calendar/status', '{}', 300_000, 'c1');
    displayCache.storeBody('/api/calendars', '[]', 300_000, 'c1');
    calendarReadAt(WEEK, undefined);
    renderHook(() => useCalendarRefresh());
    publishRevisions({ calendar: 'c2' });
    publishRevisions({ calendar: 'c2' });
    expect(asked).toEqual([]);
  });
});
