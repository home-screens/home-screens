// @vitest-environment jsdom

/**
 * The library heartbeat and a card showing a slideshow list, together: an
 * upload reaches the card even when the first re-read after it fails, because
 * a later beat asks again (not only the list's own 10-minute poll).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { displayCache } from '@/lib/display-cache';
import { publishRevisions, __resetHeartbeatForTests } from '@/lib/display-heartbeat';

const translate = vi.hoisted(() => (key: string) => key);
vi.mock('@/i18n', () => ({ useTranslate: () => translate }));

/** The library revision the hub is at; every list answer says it. */
let library = 'r1';
let failNext = 0;
let reads = 0;
vi.mock('@/lib/display-fetch', () => ({
  displayFetch: async (url: string) => {
    reads++;
    if (failNext > 0) {
      failNext--;
      throw new Error('offline');
    }
    const body = JSON.stringify([`${url}@${library}`]);
    return { ok: true, text: async () => body, headers: new Headers({ 'X-Library-Revision': library }) };
  },
}));

import { useFetchData } from '../useFetchData';
import { useLibraryRefresh } from '../useRevisionRefresh';

const LIST = '/api/photo-source/media?kind=library&folder=Favorites';

function beats(count: number) {
  act(() => {
    for (let i = 0; i < count; i++) publishRevisions({ library });
  });
}

beforeEach(() => {
  library = 'r1';
  failNext = 0;
  reads = 0;
  displayCache.clear();
  __resetHeartbeatForTests();
});
afterEach(() => cleanup());

describe('useLibraryRefresh with a card showing the list', () => {
  it('asks again on later beats after the first re-read failed, and the card catches up', async () => {
    const { result } = renderHook(() => {
      useLibraryRefresh();
      return useFetchData<string[]>(LIST, 600_000);
    });
    await waitFor(() => expect(result.current[0]).toEqual([`${LIST}@r1`]));

    // An upload moves the library on, and the wall's first re-read fails.
    library = 'r2';
    failNext = 1;
    beats(2);
    await waitFor(() => expect(reads).toBe(2));
    await waitFor(() => expect(result.current[1]).not.toBeNull());
    expect(result.current[0]).toEqual([`${LIST}@r1`]);

    beats(2);
    await waitFor(() => expect(result.current[0]).toEqual([`${LIST}@r2`]));
    expect(reads).toBe(3);
  });
});
