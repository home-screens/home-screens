// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { sharedStateStore } from '@/lib/shared-state-store';
import { usePublishState } from '../usePublishState';

describe('usePublishState', () => {
  beforeEach(() => {
    sharedStateStore.__resetForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('publishes the value on mount', () => {
    renderHook(() => usePublishState('sensor.temp', '72'));
    expect(sharedStateStore.get('sensor.temp')?.value).toBe('72');
  });

  it('publishes on value change and coalesces via the store', () => {
    const { rerender } = renderHook(
      ({ value }: { value: string | undefined }) => usePublishState('sensor.temp', value),
      { initialProps: { value: '72' as string | undefined } },
    );
    rerender({ value: '73' });
    expect(sharedStateStore.get('sensor.temp')?.value).toBe('73');
  });

  it('skips publishing while value is undefined without clearing an earlier value', () => {
    const { rerender } = renderHook(
      ({ value }: { value: string | undefined }) => usePublishState('sensor.temp', value),
      { initialProps: { value: '72' as string | undefined } },
    );
    rerender({ value: undefined });
    expect(sharedStateStore.get('sensor.temp')?.value).toBe('72');
  });

  it('tombstones the key when the only publisher unmounts, then deletes after the grace window', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderHook(() => usePublishState('sensor.temp', '72'));
      unmount();
      expect(sharedStateStore.get('sensor.temp')?.staleAt).toBeTypeOf('number');
      vi.advanceTimersByTime(15_000);
      expect(sharedStateStore.get('sensor.temp')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the value when one of two same-key publishers unmounts (dual-instance pattern)', () => {
    // The documented background-provider + visible-copy pattern: rotation
    // unmounting the visible copy must NOT wipe the background provider's value.
    const provider = renderHook(() => usePublishState('sensor.temp', '72'));
    const visibleCopy = renderHook(() => usePublishState('sensor.temp', '72'));

    visibleCopy.unmount();
    expect(sharedStateStore.get('sensor.temp')?.value).toBe('72');
    expect(sharedStateStore.get('sensor.temp')?.staleAt).toBeUndefined();

    provider.unmount();
    expect(sharedStateStore.get('sensor.temp')?.staleAt).toBeTypeOf('number');
  });

  it('releases the old key and claims the new one on key change', () => {
    const { rerender, unmount } = renderHook(
      ({ key }: { key: string }) => usePublishState(key, 'v'),
      { initialProps: { key: 'sensor.old' } },
    );
    rerender({ key: 'sensor.new' });
    expect(sharedStateStore.get('sensor.old')?.staleAt).toBeTypeOf('number');
    expect(sharedStateStore.get('sensor.new')?.value).toBe('v');
    expect(sharedStateStore.get('sensor.new')?.staleAt).toBeUndefined();
    unmount();
    expect(sharedStateStore.get('sensor.new')?.staleAt).toBeTypeOf('number');
  });
});
