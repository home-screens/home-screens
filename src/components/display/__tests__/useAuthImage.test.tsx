// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: vi.fn(),
}));

import { displayFetch } from '@/lib/display-fetch';
import {
  useAuthImage,
  useAuthImageState,
  preloadAuthImage,
  __resetAuthImageCacheForTests,
} from '../useAuthImage';

const mockDisplayFetch = vi.mocked(displayFetch);

let blobCounter = 0;

/** A 200 answer. `etag: null` is a route that sends no tag (Immich and OneDrive previews). */
function okResponse(etag: string | null = 'W/"1-1"', bytes = 'x') {
  return {
    ok: true,
    status: 200,
    headers: new Headers(etag ? { etag } : {}),
    blob: async () => new Blob([bytes]),
    body: { cancel: vi.fn(async () => {}) },
  };
}

/** Queue the next displayFetch call as a deferred response; returns its resolver. */
function deferredResponse(etag?: string) {
  let resolveFetch!: (value: unknown) => void;
  const promise = new Promise((resolve) => { resolveFetch = resolve; });
  mockDisplayFetch.mockReturnValueOnce(promise as never);
  return () => resolveFetch(okResponse(etag));
}

/** Let a released picture's eviction pass (a 0 ms timer) run. */
async function runEviction() {
  await act(async () => { vi.advanceTimersByTime(1); });
}

beforeEach(() => {
  // Before the fresh mocks, so the previous test's URLs are not counted.
  __resetAuthImageCacheForTests();
  blobCounter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++blobCounter}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  // Answers a test queued but never used must not reach the next test.
  mockDisplayFetch.mockReset();
});

describe('useAuthImage', () => {
  it('holdPrevious false returns undefined while a changed src loads, never the stale blob', async () => {
    // Regression: the incoming slide layer becomes active the moment its src
    // changes — serving the PREVIOUS src's blob during the fetch made every
    // rotation briefly flash the photo from two advances back.
    const resolveA = deferredResponse();
    const { result, rerender } = renderHook(
      ({ src }) => useAuthImage(src, { holdPrevious: false }),
      { initialProps: { src: '/api/onedrive/serve?itemId=a' } },
    );

    expect(result.current).toBeUndefined();
    await act(async () => { resolveA(); });
    expect(result.current).toBe('blob:mock-1');

    const resolveB = deferredResponse();
    rerender({ src: '/api/onedrive/serve?itemId=b' });
    expect(result.current).toBeUndefined();

    await act(async () => { resolveB(); });
    expect(result.current).toBe('blob:mock-2');
  });

  it('holds the previous image by default while a changed src loads', async () => {
    // The screen background is a lone <img> its caller unmounts when this
    // returns nothing — dropping to undefined mid-swap flashed the screen
    // black on every background rotation.
    const resolveA = deferredResponse();
    const { result, rerender } = renderHook(
      ({ src }) => useAuthImage(src),
      { initialProps: { src: '/api/backgrounds/serve?file=a.jpg' } },
    );

    await act(async () => { resolveA(); });
    expect(result.current).toBe('blob:mock-1');

    const resolveB = deferredResponse();
    rerender({ src: '/api/backgrounds/serve?file=b.jpg' });
    expect(result.current).toBe('blob:mock-1');

    await act(async () => { resolveB(); });
    expect(result.current).toBe('blob:mock-2');
  });

  it('reports a failed fetch for the current src, and recovers on the next src', async () => {
    mockDisplayFetch.mockResolvedValueOnce({ ok: false, status: 404 } as never);
    const { result, rerender } = renderHook(
      ({ src }) => useAuthImageState(src, { holdPrevious: false }),
      { initialProps: { src: '/api/onedrive/serve?itemId=dead' } },
    );
    expect(result.current.status).toBe('loading');
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toEqual({ url: undefined, status: 'failed' });

    const resolveB = deferredResponse();
    rerender({ src: '/api/onedrive/serve?itemId=b' });
    expect(result.current.status).toBe('loading');
    await act(async () => { resolveB(); });
    expect(result.current).toEqual({ url: 'blob:mock-1', status: 'ready' });
  });

  it('reports a network error as failed', async () => {
    mockDisplayFetch.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useAuthImageState('/api/immich/serve?assetId=x'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.status).toBe('failed');
  });

  it('returns static paths directly without fetching', () => {
    const { result } = renderHook(({ src }) => useAuthImage(src), {
      initialProps: { src: '/backgrounds/vacation/sunset.jpg' },
    });

    expect(result.current).toBe('/backgrounds/vacation/sunset.jpg');
    expect(mockDisplayFetch).not.toHaveBeenCalled();
  });

  it('keeps the loaded blob across re-renders with the same src', async () => {
    const resolveA = deferredResponse();
    const { result, rerender } = renderHook(
      ({ src }) => useAuthImage(src),
      { initialProps: { src: '/api/onedrive/serve?itemId=a' } },
    );

    await act(async () => { resolveA(); });
    rerender({ src: '/api/onedrive/serve?itemId=a' });
    expect(result.current).toBe('blob:mock-1');
    expect(mockDisplayFetch).toHaveBeenCalledTimes(1);
  });
});

describe('the shared picture cache', () => {
  const BG = '/api/backgrounds/serve?file=home.jpg';

  it('shows a picture shown before on the first render of the next mount, with no new download', async () => {
    // Regression: every mount made its own blob URL, so each return of a
    // screen downloaded and decoded its background again and faded in over
    // the previous screen's picture.
    mockDisplayFetch.mockResolvedValueOnce(okResponse() as never);
    const first = renderHook(() => useAuthImageState(BG));
    await act(async () => {});
    expect(first.result.current).toEqual({ url: 'blob:mock-1', status: 'ready' });
    first.unmount();

    const again = renderHook(() => useAuthImageState(BG));
    expect(again.result.current).toEqual({ url: 'blob:mock-1', status: 'ready' });
    expect(mockDisplayFetch).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('shares one download between two hooks showing the same picture', async () => {
    const resolve = deferredResponse();
    const a = renderHook(() => useAuthImage(BG));
    const b = renderHook(() => useAuthImage(BG));
    await act(async () => { resolve(); });
    expect(a.result.current).toBe('blob:mock-1');
    expect(b.result.current).toBe('blob:mock-1');
    expect(mockDisplayFetch).toHaveBeenCalledTimes(1);
  });

  it('checks a returning picture with the hub and keeps it when unchanged', async () => {
    vi.useFakeTimers();
    mockDisplayFetch.mockResolvedValueOnce(okResponse('W/"1-1"') as never);
    const first = renderHook(() => useAuthImage(BG));
    await act(async () => {});
    first.unmount();

    await act(async () => { vi.advanceTimersByTime(60_000); });
    const unchanged = okResponse('W/"1-1"');
    mockDisplayFetch.mockResolvedValueOnce(unchanged as never);
    const again = renderHook(() => useAuthImage(BG));
    await act(async () => {});
    expect(mockDisplayFetch).toHaveBeenCalledTimes(2);
    expect(again.result.current).toBe('blob:mock-1');
    expect(unchanged.body.cancel).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('swaps in a replaced file when a returning picture is checked', async () => {
    vi.useFakeTimers();
    mockDisplayFetch.mockResolvedValueOnce(okResponse('W/"1-1"') as never);
    const first = renderHook(() => useAuthImage(BG));
    await act(async () => {});
    first.unmount();

    await act(async () => { vi.advanceTimersByTime(60_000); });
    mockDisplayFetch.mockResolvedValueOnce(okResponse('W/"9-9"') as never);
    const again = renderHook(() => useAuthImage(BG));
    // The kept picture shows at once; the replacement follows.
    expect(again.result.current).toBe('blob:mock-1');
    await act(async () => {});
    expect(again.result.current).toBe('blob:mock-2');
    // The old URL outlives the swap for any <img> still loading it.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
  });

  it('fails a returning picture whose file was deleted', async () => {
    vi.useFakeTimers();
    mockDisplayFetch.mockResolvedValueOnce(okResponse() as never);
    const first = renderHook(() => useAuthImageState(BG));
    await act(async () => {});
    first.unmount();

    await act(async () => { vi.advanceTimersByTime(60_000); });
    mockDisplayFetch.mockResolvedValueOnce({ ok: false, status: 404, headers: new Headers() } as never);
    const again = renderHook(() => useAuthImageState(BG));
    await act(async () => {});
    expect(again.result.current).toEqual({ url: undefined, status: 'failed' });
  });

  it('swaps in new bytes for a returning picture whose route sends no ETag', async () => {
    // Immich and OneDrive previews send no tag; once the browser's copy
    // expires, a changed photo comes back as fresh bytes.
    vi.useFakeTimers();
    const PREVIEW = '/api/onedrive/serve?itemId=a&size=preview';
    mockDisplayFetch.mockResolvedValueOnce(okResponse(null, 'old photo') as never);
    const first = renderHook(() => useAuthImage(PREVIEW));
    await act(async () => {});
    first.unmount();

    await act(async () => { vi.advanceTimersByTime(60_000); });
    mockDisplayFetch.mockResolvedValueOnce(okResponse(null, 'edited photo') as never);
    const again = renderHook(() => useAuthImage(PREVIEW));
    await act(async () => {});
    expect(again.result.current).toBe('blob:mock-2');
  });

  it('keeps the URL of a returning untagged picture whose bytes did not change', async () => {
    vi.useFakeTimers();
    const PREVIEW = '/api/immich/serve?assetId=x&size=preview';
    mockDisplayFetch.mockResolvedValueOnce(okResponse(null, 'same photo') as never);
    const first = renderHook(() => useAuthImage(PREVIEW));
    await act(async () => {});
    first.unmount();

    await act(async () => { vi.advanceTimersByTime(60_000); });
    mockDisplayFetch.mockResolvedValueOnce(okResponse(null, 'same photo') as never);
    const again = renderHook(() => useAuthImage(PREVIEW));
    await act(async () => {});
    expect(mockDisplayFetch).toHaveBeenCalledTimes(2);
    expect(again.result.current).toBe('blob:mock-1');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('fetches again on the next mount when a picture vanished while nobody showed it', async () => {
    vi.useFakeTimers();
    mockDisplayFetch.mockResolvedValueOnce(okResponse() as never);
    const first = renderHook(() => useAuthImageState(BG));
    await act(async () => {});
    first.unmount();
    await act(async () => { vi.advanceTimersByTime(60_000); });

    // The screen comes back, the recheck goes out, and the screen leaves
    // again before the hub answers that the file is gone.
    let answer!: (value: unknown) => void;
    mockDisplayFetch.mockReturnValueOnce(new Promise((r) => { answer = r; }) as never);
    const second = renderHook(() => useAuthImageState(BG));
    second.unmount();
    await act(async () => { answer({ ok: false, status: 404, headers: new Headers() }); });

    // The file is back by the next visit: that mount must ask again.
    mockDisplayFetch.mockResolvedValueOnce(okResponse() as never);
    const third = renderHook(() => useAuthImageState(BG));
    await act(async () => {});
    expect(mockDisplayFetch).toHaveBeenCalledTimes(3);
    expect(third.result.current.status).toBe('ready');
  });

  it('does not keep a failure: the next mount tries again', async () => {
    mockDisplayFetch.mockResolvedValueOnce({ ok: false, status: 503 } as never);
    const first = renderHook(() => useAuthImageState(BG));
    await act(async () => {});
    expect(first.result.current.status).toBe('failed');
    first.unmount();

    mockDisplayFetch.mockResolvedValueOnce(okResponse() as never);
    const again = renderHook(() => useAuthImageState(BG));
    expect(again.result.current.status).toBe('loading');
    await act(async () => {});
    expect(again.result.current.status).toBe('ready');
  });

  it('keeps a dozen pictures nobody shows, and lets the oldest go', async () => {
    vi.useFakeTimers();
    mockDisplayFetch.mockImplementation(async () => okResponse() as never);
    for (let i = 0; i < 14; i++) {
      const hook = renderHook(() => useAuthImage(`/api/backgrounds/serve?file=${i}.jpg`));
      await act(async () => {});
      hook.unmount();
      // Each release is older than the "just rendered" grace by the next one.
      await act(async () => { vi.advanceTimersByTime(6_000); });
    }
    await runEviction();
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.map(([url]) => url)).toEqual(['blob:mock-1', 'blob:mock-2']);
  });

  it('lets go of the pictures over the limit once their grace period ends', async () => {
    // Twenty pictures shown and let go within five seconds: every one is
    // still in its grace period at the first eviction pass.
    vi.useFakeTimers();
    mockDisplayFetch.mockImplementation(async () => okResponse() as never);
    for (let i = 0; i < 20; i++) {
      const hook = renderHook(() => useAuthImage(`/api/backgrounds/serve?file=${i}.jpg`));
      await act(async () => {});
      hook.unmount();
    }
    await runEviction();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    // Nothing else happens on the page; the cache must still come back to its limit.
    await act(async () => { vi.advanceTimersByTime(6_000); });
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(8);
  });

  it('never lets go of a picture rendered for a mount whose effect has not run yet', async () => {
    vi.useFakeTimers();
    mockDisplayFetch.mockImplementation(async () => okResponse() as never);
    // The background of a screen shown a minute ago: the oldest idle picture.
    const old = renderHook(() => useAuthImage(BG));
    await act(async () => {});
    old.unmount();
    await act(async () => { vi.advanceTimersByTime(60_000); });
    // A slideshow moves through a dozen photos, and their eviction pass is due.
    for (let i = 0; i < 12; i++) {
      const hook = renderHook(() => useAuthImage(`/api/backgrounds/serve?file=${i}.jpg`));
      await act(async () => {});
      hook.unmount();
    }
    // The screen rotates back in and renders with the kept picture, but its
    // effect (which claims it) runs after the paint. A server render is a
    // render with no effects at all.
    function Background() {
      return <img src={useAuthImage(BG)} alt="" />;
    }
    expect(renderToString(<Background />)).toContain('blob:mock-1');
    // The eviction pass that runs in between must pick another picture.
    await runEviction();
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:mock-1');
  });

  it('preloads a picture so the next mount has it on its first render', async () => {
    mockDisplayFetch.mockResolvedValueOnce(okResponse() as never);
    const decode = vi.fn(async () => {});
    const OriginalImage = globalThis.Image;
    globalThis.Image = class { src = ''; decode = decode; } as unknown as typeof Image;
    try {
      preloadAuthImage(BG);
      await act(async () => {});
      expect(decode).toHaveBeenCalledTimes(1);

      const hook = renderHook(() => useAuthImage(BG));
      expect(hook.result.current).toBe('blob:mock-1');
      expect(mockDisplayFetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.Image = OriginalImage;
    }
  });
});
