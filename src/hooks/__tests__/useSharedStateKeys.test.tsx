// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { sharedStateStore } from '@/lib/shared-state-store';
import { useSharedStateKeys } from '../useSharedStateKeys';

describe('useSharedStateKeys', () => {
  beforeEach(() => {
    sharedStateStore.__resetForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const KEYS = ['plugin:ha:door', 'plugin:ha:temp'];

  it('selects only the requested keys', () => {
    sharedStateStore.publish('plugin:ha:door', 'open');
    sharedStateStore.publish('plugin:other:noise', 'x');
    const { result } = renderHook(() => useSharedStateKeys(KEYS));
    expect(result.current.get('plugin:ha:door')?.value).toBe('open');
    expect(result.current.has('plugin:other:noise')).toBe(false);
    expect(result.current.size).toBe(1);
  });

  it('updates when a referenced key changes', () => {
    const { result } = renderHook(() => useSharedStateKeys(KEYS));
    expect(result.current.size).toBe(0);
    act(() => sharedStateStore.publish('plugin:ha:door', 'open'));
    expect(result.current.get('plugin:ha:door')?.value).toBe('open');
  });

  it('keeps the same reference when only unreferenced keys change', () => {
    sharedStateStore.publish('plugin:ha:door', 'open');
    const { result } = renderHook(() => useSharedStateKeys(KEYS));
    const before = result.current;
    act(() => sharedStateStore.publish('plugin:other:noise', 'x'));
    act(() => sharedStateStore.publish('plugin:other:noise', 'y'));
    expect(result.current).toBe(before);
  });

  it('returns the stable empty map and skips subscribing for zero keys', () => {
    const subscribeSpy = vi.spyOn(sharedStateStore, 'subscribe');
    const { result } = renderHook(() => useSharedStateKeys([]));
    expect(result.current.size).toBe(0);
    const before = result.current;
    act(() => sharedStateStore.publish('plugin:ha:door', 'open'));
    expect(result.current).toBe(before);
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('reflects a clear: tombstoned value survives the grace window, then goes unknown', () => {
    vi.useFakeTimers();
    try {
      sharedStateStore.publish('plugin:ha:door', 'open');
      const { result } = renderHook(() => useSharedStateKeys(KEYS));
      act(() => sharedStateStore.clearKey('plugin:ha:door'));
      // Grace window: consumers still see the last value (no blink)
      expect(result.current.get('plugin:ha:door')?.value).toBe('open');
      act(() => vi.advanceTimersByTime(15_000));
      expect(result.current.has('plugin:ha:door')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
