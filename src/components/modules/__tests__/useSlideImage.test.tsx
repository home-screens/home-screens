// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

vi.mock('@/lib/display-fetch', () => ({ displayFetch: vi.fn() }));

import { displayFetch } from '@/lib/display-fetch';
import { __resetAuthImageCacheForTests } from '@/components/display/useAuthImage';
import { useSlideImage, readyWhenDecoded } from '../shared/useCrossfadeLayers';

const mockDisplayFetch = vi.mocked(displayFetch);
const SLIDE_A = '/api/backgrounds/serve?file=a.jpg';
const SLIDE_B = '/api/backgrounds/serve?file=b.jpg';

/** Queue the next displayFetch call; returns its resolver. */
function deferred() {
  let resolve!: (value: unknown) => void;
  mockDisplayFetch.mockReturnValueOnce(new Promise((r) => { resolve = r; }) as never);
  return () => resolve({ ok: true, status: 200, headers: new Headers(), blob: async () => new Blob(['x']) });
}

let counter = 0;
beforeEach(() => {
  __resetAuthImageCacheForTests();
  counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++counter}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('useSlideImage', () => {
  it('asks for the photo at the size of its box', async () => {
    const done = deferred();
    renderHook(() => useSlideImage(SLIDE_A, { w: 900, h: 600 }));
    await act(async () => { done(); });
    expect(mockDisplayFetch).toHaveBeenCalledWith(`${SLIDE_A}&w=1080&h=720`);
  });

  it('never shows the previous slide while the next one loads', async () => {
    const doneA = deferred();
    const { result, rerender } = renderHook(({ src }) => useSlideImage(src, { w: 900, h: 600 }), {
      initialProps: { src: SLIDE_A },
    });
    await act(async () => { doneA(); });
    expect(result.current.url).toBe('blob:1');

    deferred();
    rerender({ src: SLIDE_B });
    expect(result.current).toEqual({ url: undefined, status: 'loading' });
  });

  it('keeps the photo up while a new size of it loads', async () => {
    // The editor: dragging the card's corner past a size step.
    const doneSmall = deferred();
    const { result, rerender } = renderHook(({ box }) => useSlideImage(SLIDE_A, box), {
      initialProps: { box: { w: 400, h: 300 } },
    });
    await act(async () => { doneSmall(); });
    expect(result.current.url).toBe('blob:1');

    const doneLarge = deferred();
    rerender({ box: { w: 1000, h: 700 } });
    expect(result.current).toEqual({ url: 'blob:1', status: 'loading' });
    await act(async () => { doneLarge(); });
    expect(result.current).toEqual({ url: 'blob:2', status: 'ready' });
  });
});

describe('readyWhenDecoded', () => {
  it('reports the layer ready only once the picture is decoded', async () => {
    let finishDecode!: () => void;
    const img = { src: 'blob:1', decode: () => new Promise<void>((r) => { finishDecode = r; }) } as HTMLImageElement;
    const onReady = vi.fn();
    readyWhenDecoded(img, onReady);
    await Promise.resolve();
    expect(onReady).not.toHaveBeenCalled();
    finishDecode();
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  });

  it('stays quiet when the layer moved on to another picture while decoding', async () => {
    let finishDecode!: () => void;
    const img = { src: 'blob:1', decode: () => new Promise<void>((r) => { finishDecode = r; }) } as HTMLImageElement;
    const onReady = vi.fn();
    readyWhenDecoded(img, onReady);
    img.src = 'blob:2';
    finishDecode();
    await new Promise((r) => setTimeout(r, 0));
    expect(onReady).not.toHaveBeenCalled();
  });
});
