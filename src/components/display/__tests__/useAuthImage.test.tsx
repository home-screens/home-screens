// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: vi.fn(),
}));

import { displayFetch } from '@/lib/display-fetch';
import { useAuthImage } from '../useAuthImage';

const mockDisplayFetch = vi.mocked(displayFetch);

let blobCounter = 0;

/** Queue the next displayFetch call as a deferred response; returns its resolver. */
function deferredResponse() {
  let resolveFetch!: (value: unknown) => void;
  const promise = new Promise((resolve) => { resolveFetch = resolve; });
  mockDisplayFetch.mockReturnValueOnce(promise as never);
  return () => resolveFetch({ ok: true, blob: async () => new Blob(['x']) });
}

beforeEach(() => {
  blobCounter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++blobCounter}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useAuthImage', () => {
  it('returns undefined while a changed src is still loading, never the stale blob', async () => {
    // Regression: the incoming slide layer becomes active the moment its src
    // changes — serving the PREVIOUS src's blob during the fetch made every
    // rotation briefly flash the photo from two advances back.
    const resolveA = deferredResponse();
    const { result, rerender } = renderHook(
      ({ src }) => useAuthImage(src),
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
