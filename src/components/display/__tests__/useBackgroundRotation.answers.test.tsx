// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Screen } from '@/types/config';

const displayFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/display-fetch', () => ({ displayFetch }));

import { useBackgroundRotation } from '../useBackgroundRotation';
import { publishRevisions, __resetHeartbeatForTests } from '@/lib/display-heartbeat';
import { setBackgroundCaption, useBackgroundCaption } from '@/lib/background-caption-store';

const PHOTO = '/api/backgrounds/serve?file=rotation-unsplash-a.jpg';

function screen(rotating: boolean): Screen {
  return {
    id: 's',
    name: 'S',
    backgroundImage: '/starter-backgrounds/ocean.svg',
    modules: [],
    backgroundRotation: { intervalMinutes: 60, sources: rotating ? [{ kind: 'unsplash' as const, query: 'nature landscape' }] : [] },
  };
}

// Lookups stay open until the test answers them, so the wait is observable.
let open: Array<(res: Response | Error) => void> = [];

beforeEach(() => {
  __resetHeartbeatForTests();
  open = [];
  displayFetch.mockReset();
  displayFetch.mockImplementation(() => new Promise<Response>((resolve, reject) => {
    open.push((res) => (res instanceof Error ? reject(res) : resolve(res)));
  }));
});

async function answer(res: Response | Error = new Response(JSON.stringify({ path: PHOTO }))) {
  await waitFor(() => expect(open.length).toBeGreaterThan(0));
  const settle = open.shift()!;
  await act(async () => { settle(res); });
}

describe('useBackgroundRotation answers', () => {
  it('re-asks when the heartbeat says a rotation answered anew, not on the next minute', async () => {
    const { result } = renderHook(() => useBackgroundRotation([screen(true)]));
    await answer();
    expect(result.current.s).toBe(PHOTO);
    expect(open).toHaveLength(0);

    // The first beat only says where the hub is.
    act(() => { publishRevisions({ rotation: 'r1' }); });
    expect(open).toHaveLength(0);
    act(() => { publishRevisions({ rotation: 'r1' }); });
    expect(open).toHaveLength(0);

    // A moved revision is a new picture somewhere: ask again.
    act(() => { publishRevisions({ rotation: 'r2' }); });
    const next = '/api/backgrounds/serve?file=rotation-unsplash-b.jpg';
    await answer(new Response(JSON.stringify({ path: next })));
    expect(result.current.s).toBe(next);
  });

  it('has no answer for a rotating screen until its lookup comes back', async () => {
    const { result } = renderHook(() => useBackgroundRotation([screen(true)]));
    expect(result.current.s).toBeUndefined();
    await answer();
    expect(result.current.s).toBe(PHOTO);
  });

  it('keeps the own picture up when rotation is switched on, until the photo arrives', async () => {
    const { result, rerender } = renderHook(({ screens }) => useBackgroundRotation(screens), {
      initialProps: { screens: [screen(false)] },
    });
    await waitFor(() => expect(result.current.s).toBeNull());

    rerender({ screens: [screen(true)] });
    expect(result.current.s).toBeNull();
    await answer();
    expect(result.current.s).toBe(PHOTO);
  });

  /**
   * With the hub away each lookup takes the whole request timeout, so a
   * poll can outlast its interval. A second poll on top would double the
   * dead requests; it waits for the first to finish instead.
   */
  it('starts no second poll while the first is still waiting on the hub', async () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useBackgroundRotation([screen(true)]));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(displayFetch).toHaveBeenCalledTimes(1);

      // Two poll intervals pass with the first lookup still open.
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(displayFetch).toHaveBeenCalledTimes(1);

      // The lookup fails; the next interval polls again.
      await act(async () => { open.shift()!(new Error('offline')); });
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(displayFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles on the own picture when the first lookup fails', async () => {
    const { result } = renderHook(() => useBackgroundRotation([screen(true)]));
    await answer(new Error('offline'));
    expect(result.current.s).toBeNull();
  });

  it('keeps the caption an answer carries, and drops it when a later answer has none', async () => {
    const caption = { name: 'Irises, Vincent van Gogh, 1889', source: 'Cleveland Museum of Art' };
    renderHook(() => useBackgroundRotation([screen(true)]));
    const shown = renderHook(() => useBackgroundCaption('s'));
    await answer(new Response(JSON.stringify({ path: PHOTO, credit: caption })));
    expect(shown.result.current).toEqual(caption);

    act(() => { publishRevisions({ rotation: 'r1' }); });
    act(() => { publishRevisions({ rotation: 'r2' }); });
    await answer(new Response(JSON.stringify({ path: PHOTO })));
    expect(shown.result.current).toBeUndefined();
    setBackgroundCaption('s', null);
    __resetHeartbeatForTests();
  });
});
