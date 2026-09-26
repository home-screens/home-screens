// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Screen } from '@/types/config';

const displayFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/display-fetch', () => ({ displayFetch }));

import { useBackgroundRotation } from '../useBackgroundRotation';

const PHOTO = '/api/backgrounds/serve?file=rotation-unsplash-a.jpg';

function screen(rotating: boolean): Screen {
  return {
    id: 's',
    name: 'S',
    backgroundImage: '/starter-backgrounds/ocean.svg',
    modules: [],
    backgroundRotation: { enabled: rotating, source: 'unsplash', query: 'nature landscape', intervalMinutes: 60 },
  };
}

// Lookups stay open until the test answers them, so the wait is observable.
let open: Array<(res: Response | Error) => void> = [];

beforeEach(() => {
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

  it('settles on the own picture when the first lookup fails', async () => {
    const { result } = renderHook(() => useBackgroundRotation([screen(true)]));
    await answer(new Error('offline'));
    expect(result.current.s).toBeNull();
  });
});
