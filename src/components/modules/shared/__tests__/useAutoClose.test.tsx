// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useAutoClose } from '../useAutoClose';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useAutoClose', () => {
  it('closes once the time is up', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    renderHook(() => useAutoClose(onClose, 1_000));
    act(() => { vi.advanceTimersByTime(999); });
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a parent re-render with a new onClose neither restarts the clock nor calls the old one', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ onClose }) => useAutoClose(onClose, 1_000), { initialProps: { onClose: first } });
    act(() => { vi.advanceTimersByTime(600); });
    rerender({ onClose: second });
    act(() => { vi.advanceTimersByTime(400); });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('the returned restart starts the wait over', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { result } = renderHook(() => useAutoClose(onClose, 1_000));
    act(() => { vi.advanceTimersByTime(800); });
    act(() => { result.current(); });
    act(() => { vi.advanceTimersByTime(800); });
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a new restartKey starts the wait over', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { rerender } = renderHook(({ key }) => useAutoClose(onClose, 1_000, { restartKey: key }), { initialProps: { key: 'a' } });
    act(() => { vi.advanceTimersByTime(800); });
    rerender({ key: 'b' });
    act(() => { vi.advanceTimersByTime(800); });
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pausing stops the clock, and it starts again in full afterwards', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { rerender } = renderHook(({ paused }) => useAutoClose(onClose, 1_000, { paused }), { initialProps: { paused: false } });
    act(() => { vi.advanceTimersByTime(800); });
    rerender({ paused: true });
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(onClose).not.toHaveBeenCalled();
    rerender({ paused: false });
    act(() => { vi.advanceTimersByTime(999); });
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a longer wait (cooking mode) replaces the shorter one', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { rerender } = renderHook(({ ms }) => useAutoClose(onClose, ms), { initialProps: { ms: 1_000 } });
    act(() => { vi.advanceTimersByTime(900); });
    rerender({ ms: 10_000 });
    act(() => { vi.advanceTimersByTime(9_000); });
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('never fires after unmount', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useAutoClose(onClose, 1_000));
    unmount();
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(onClose).not.toHaveBeenCalled();
  });
});
