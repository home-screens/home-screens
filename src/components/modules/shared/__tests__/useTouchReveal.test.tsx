// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTouchReveal } from '../useTouchReveal';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useTouchReveal', () => {
  it('stays down until poked, then goes after the idle wait; a poke starts the wait again', () => {
    const { result } = renderHook(() => useTouchReveal({ idleMs: 1000 }));
    expect(result.current.shown).toBe(false);
    act(() => result.current.poke());
    expect(result.current.shown).toBe(true);
    act(() => vi.advanceTimersByTime(800));
    act(() => result.current.poke());
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.shown).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.shown).toBe(false);
  });

  it('stays up while pinned, and waits in full once unpinned', () => {
    const { result, rerender } = renderHook(({ pinned }) => useTouchReveal({ idleMs: 1000, pinned }), { initialProps: { pinned: false } });
    act(() => result.current.poke());
    rerender({ pinned: true });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.shown).toBe(true);
    rerender({ pinned: false });
    act(() => vi.advanceTimersByTime(999));
    expect(result.current.shown).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.shown).toBe(false);
  });

  it('is shown while pinned without a poke, and gone as soon as the pin lifts', () => {
    const { result, rerender } = renderHook(({ pinned }) => useTouchReveal({ idleMs: 1000, pinned }), { initialProps: { pinned: true } });
    expect(result.current.shown).toBe(true);
    rerender({ pinned: false });
    expect(result.current.shown).toBe(false);
  });

  it('ignores pokes while off and does not pop back up when switched on again', () => {
    const { result, rerender } = renderHook(({ enabled }) => useTouchReveal({ idleMs: 1000, enabled }), { initialProps: { enabled: true } });
    act(() => result.current.poke());
    rerender({ enabled: false });
    expect(result.current.shown).toBe(false);
    act(() => result.current.poke());
    expect(result.current.shown).toBe(false);
    rerender({ enabled: true });
    expect(result.current.shown).toBe(false);
  });

  it('hide puts it away at once', () => {
    const { result } = renderHook(() => useTouchReveal({ idleMs: 1000 }));
    act(() => result.current.poke());
    act(() => result.current.hide());
    expect(result.current.shown).toBe(false);
  });
});
