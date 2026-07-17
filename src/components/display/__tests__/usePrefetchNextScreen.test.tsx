// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePrefetchNextScreen } from '../usePrefetchNextScreen';
import { prefetchScreen } from '@/lib/prefetch';
import type { Screen } from '@/types/config';

vi.mock('@/lib/prefetch', () => ({ prefetchScreen: vi.fn() }));

const screens = [
  { id: 's1', name: 'One', modules: [] },
  { id: 's2', name: 'Two', modules: [] },
] as unknown as Screen[];

describe('usePrefetchNextScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(prefetchScreen).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function render(suspended: boolean) {
    return renderHook(
      ({ s }: { s: boolean }) =>
        usePrefetchNextScreen(screens, 's1,s2', 0, 30_000, 'active', undefined, s),
      { initialProps: { s: suspended } },
    );
  }

  it('prefetches the next screen 5s before the advance', () => {
    render(false);
    vi.advanceTimersByTime(25_000);
    expect(prefetchScreen).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prefetchScreen).mock.calls[0][0]).toBe(screens[1]);
  });

  it('does not prefetch while a takeover suspends rotation', () => {
    render(true);
    vi.advanceTimersByTime(60_000);
    expect(prefetchScreen).not.toHaveBeenCalled();
  });

  it('re-arms a fresh prefetch when the takeover releases', () => {
    const { rerender } = render(true);
    vi.advanceTimersByTime(60_000);
    expect(prefetchScreen).not.toHaveBeenCalled();

    rerender({ s: false });
    // The rotation timer restarts with a full dwell on release, so the
    // prefetch must fire duration-5s after release, not earlier.
    vi.advanceTimersByTime(24_000);
    expect(prefetchScreen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(prefetchScreen).toHaveBeenCalledTimes(1);
  });
});
