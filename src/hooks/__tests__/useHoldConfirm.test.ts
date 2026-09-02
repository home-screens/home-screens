import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useHoldConfirm } from '@/hooks/useHoldConfirm';

/**
 * Tests for the hold-confirm timing logic.
 *
 * The test environment is `node` (no DOM / jsdom), so we cannot use
 * @testing-library/react's renderHook.  Instead we drive the hook's
 * exported `_createHoldTimer` helper, which encapsulates all the
 * timing + fire-once semantics independently of React state.
 */
describe('useHoldConfirm (timing logic)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onConfirm after a full hold', () => {
    const onConfirm = vi.fn();
    const onProgress = vi.fn();
    const timer = useHoldConfirm._createHoldTimer({ durationMs: 1000, onConfirm, onProgress });

    timer.start();
    vi.advanceTimersByTime(1000);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not fire onConfirm if released before duration', () => {
    const onConfirm = vi.fn();
    const onProgress = vi.fn();
    const timer = useHoldConfirm._createHoldTimer({ durationMs: 1000, onConfirm, onProgress });

    timer.start();
    vi.advanceTimersByTime(500);
    timer.stop();
    vi.advanceTimersByTime(600);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('resets progress to 0 after release', () => {
    const onConfirm = vi.fn();
    const progressValues: number[] = [];
    const timer = useHoldConfirm._createHoldTimer({
      durationMs: 1000,
      onConfirm,
      onProgress: (p) => progressValues.push(p),
    });

    timer.start();
    vi.advanceTimersByTime(500);
    timer.stop();

    // The last progress value emitted after stop() should be 0
    expect(progressValues.at(-1)).toBe(0);
  });

  it('treats cancel like stop (no onConfirm, progress resets)', () => {
    const onConfirm = vi.fn();
    const progressValues: number[] = [];
    const timer = useHoldConfirm._createHoldTimer({
      durationMs: 1000,
      onConfirm,
      onProgress: (p) => progressValues.push(p),
    });

    timer.start();
    vi.advanceTimersByTime(500);
    timer.cancel();
    vi.advanceTimersByTime(600);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(progressValues.at(-1)).toBe(0);
  });

  it('only fires onConfirm once per hold', () => {
    const onConfirm = vi.fn();
    const timer = useHoldConfirm._createHoldTimer({
      durationMs: 1000,
      onConfirm,
      onProgress: vi.fn(),
    });

    timer.start();
    vi.advanceTimersByTime(1500);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('stop() reports a short tap only while a hold was still in progress', () => {
    const timer = useHoldConfirm._createHoldTimer({ durationMs: 1000, onConfirm: vi.fn(), onProgress: vi.fn() });

    // Nothing running: a stray release is not a short tap.
    expect(timer.stop()).toBe(false);

    timer.start();
    vi.advanceTimersByTime(300);
    expect(timer.stop()).toBe(true);

    // A completed hold is not a short tap either.
    timer.start();
    vi.advanceTimersByTime(1000);
    expect(timer.stop()).toBe(false);
  });
});
