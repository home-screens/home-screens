// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBootWarmup, BOOT_WARMUP_STAGGER_MS } from '../useBootWarmup';
import { prefetchScreen } from '@/lib/prefetch';
import type { Screen } from '@/types/config';

vi.mock('@/lib/prefetch', () => ({ prefetchScreen: vi.fn() }));

const screens = [
  { id: 's1', name: 'One', modules: [] },
  { id: 's2', name: 'Two', modules: [] },
  { id: 's3', name: 'Three', modules: [] },
] as unknown as Screen[];

describe('useBootWarmup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(prefetchScreen).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('warms every other screen in rotation order, one every 400ms, starting after the current one', () => {
    renderHook(() => useBootWarmup(screens, 's1,s2,s3', 1, undefined, true));
    expect(prefetchScreen).not.toHaveBeenCalled();

    vi.advanceTimersByTime(BOOT_WARMUP_STAGGER_MS);
    expect(prefetchScreen).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prefetchScreen).mock.calls[0][0]).toBe(screens[2]);

    vi.advanceTimersByTime(BOOT_WARMUP_STAGGER_MS);
    expect(prefetchScreen).toHaveBeenCalledTimes(2);
    expect(vi.mocked(prefetchScreen).mock.calls[1][0]).toBe(screens[0]);

    // The current screen fetches for its own render; it is not in the pass.
    vi.advanceTimersByTime(10 * BOOT_WARMUP_STAGGER_MS);
    expect(prefetchScreen).toHaveBeenCalledTimes(2);
  });

  it('runs once: a later screen-set change does not warm again', () => {
    const { rerender } = renderHook(
      ({ key }: { key: string }) => useBootWarmup(screens, key, 0, undefined, true),
      { initialProps: { key: 's1,s2,s3' } },
    );
    vi.advanceTimersByTime(3 * BOOT_WARMUP_STAGGER_MS);
    expect(prefetchScreen).toHaveBeenCalledTimes(2);

    rerender({ key: 's1,s2' });
    vi.advanceTimersByTime(3 * BOOT_WARMUP_STAGGER_MS);
    expect(prefetchScreen).toHaveBeenCalledTimes(2);
  });

  it('starts over when cleaned up before the first fetch fired (Strict Mode double mount)', () => {
    const { rerender } = renderHook(
      ({ key }: { key: string }) => useBootWarmup(screens, key, 0, undefined, true),
      { initialProps: { key: 's1,s2,s3' } },
    );
    rerender({ key: 's1,s2,s3,x' });
    vi.advanceTimersByTime(3 * BOOT_WARMUP_STAGGER_MS);
    expect(prefetchScreen).toHaveBeenCalledTimes(2);
  });

  it('does nothing with a single screen or when disabled (preview)', () => {
    renderHook(() => useBootWarmup([screens[0]], 's1', 0, undefined, true));
    renderHook(() => useBootWarmup(screens, 's1,s2,s3', 0, undefined, false));
    vi.advanceTimersByTime(10 * BOOT_WARMUP_STAGGER_MS);
    expect(prefetchScreen).not.toHaveBeenCalled();
  });
});
