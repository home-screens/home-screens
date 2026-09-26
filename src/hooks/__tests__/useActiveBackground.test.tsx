// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const editorFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editor-fetch', () => ({ editorFetch }));

import { useActiveBackground } from '../useActiveBackground';

const PHOTO: Record<string, string> = {
  a: '/api/backgrounds/serve?file=rotation-unsplash-a.jpg',
  b: '/api/backgrounds/serve?file=rotation-unsplash-b.jpg',
};

// Lookups stay open until the test answers them, so the wait is observable.
let open: Array<{ id: string; settle: (res: Response | Error) => void }> = [];

beforeEach(() => {
  open = [];
  editorFetch.mockReset();
  editorFetch.mockImplementation((url: string) => new Promise<Response>((resolve, reject) => {
    const id = new URL(url, 'http://hub').searchParams.get('screenId')!;
    open.push({ id, settle: (res) => (res instanceof Error ? reject(res) : resolve(res)) });
  }));
});

async function answer(id: string, res: Response | Error = new Response(JSON.stringify({ path: PHOTO[id] }))) {
  await waitFor(() => expect(open.some((o) => o.id === id)).toBe(true));
  const lookup = open.splice(open.findIndex((o) => o.id === id), 1)[0];
  await act(async () => { lookup.settle(res); });
}

function mount(id: string, on: boolean) {
  return renderHook(({ id, on }) => useActiveBackground(id, on), { initialProps: { id, on } });
}

describe('useActiveBackground', () => {
  it('has no answer for a rotating screen until its lookup comes back', async () => {
    const { result } = mount('a', true);
    expect(result.current).toBeUndefined();
    await answer('a');
    expect(result.current).toBe(PHOTO.a);
  });

  it('never hands a screen the photo of the screen selected before it', async () => {
    const { result, rerender } = mount('a', true);
    await answer('a');

    rerender({ id: 'b', on: true });
    expect(result.current).toBeUndefined();
    await answer('b');
    expect(result.current).toBe(PHOTO.b);

    // Going back shows the first screen's photo at once, and a failed
    // lookup on the way does not take it away.
    rerender({ id: 'a', on: true });
    expect(result.current).toBe(PHOTO.a);
    await answer('a', new Error('offline'));
    expect(result.current).toBe(PHOTO.a);
  });

  it('keeps the own picture up when rotation is switched on, until the photo arrives', async () => {
    const { result, rerender } = mount('a', false);
    expect(result.current).toBeNull();

    rerender({ id: 'a', on: true });
    expect(result.current).toBeNull();
    await answer('a');
    expect(result.current).toBe(PHOTO.a);
  });

  it('settles on the own picture when the first lookup fails', async () => {
    const { result } = mount('a', true);
    await answer('a', new Error('offline'));
    expect(result.current).toBeNull();
  });

  it('settles on the own picture when the hub has no photo', async () => {
    const { result } = mount('a', true);
    await answer('a', new Response(JSON.stringify({ path: null })));
    expect(result.current).toBeNull();
  });
});
