import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { _createDebouncedSaver } from '@/hooks/useDebouncedSave';

/**
 * Tests for the pure state-machine behind `useDebouncedSave`.
 *
 * The project test env is `node` (no jsdom), so we can't render the React
 * hook directly. Instead we drive the saver controller, which captures every
 * piece of timing + skip-initial logic without a DOM.
 */

interface Harness {
  saver: ReturnType<typeof _createDebouncedSaver>;
  run: ReturnType<typeof vi.fn>;
}

function makeSaver({ debounceMs = 400, skipInitial = true } = {}): Harness {
  const run = vi.fn();
  const saver = _createDebouncedSaver({
    debounceMs,
    skipInitial,
    run,
    setTimer: (cb, ms) => setTimeout(cb, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  return { saver, run };
}

describe('useDebouncedSave (state machine)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips the first onChange after enable when skipInitial=true', () => {
    const { saver, run } = makeSaver();
    saver.onChange(true);
    vi.advanceTimersByTime(500);
    expect(run).not.toHaveBeenCalled();
  });

  it('saves after the debounce window on the second onChange', () => {
    const { saver, run } = makeSaver({ debounceMs: 400 });
    saver.onChange(true); // initial — skipped
    saver.onChange(true); // change
    vi.advanceTimersByTime(399);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not skip when skipInitial=false', () => {
    const { saver, run } = makeSaver({ skipInitial: false });
    saver.onChange(true);
    vi.advanceTimersByTime(400);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('cancels and reschedules when changes coalesce', () => {
    const { saver, run } = makeSaver({ debounceMs: 400 });
    saver.onChange(true); // initial
    saver.onChange(true); // schedules at +400
    vi.advanceTimersByTime(300);
    saver.onChange(true); // resets — now schedules at current+400
    vi.advanceTimersByTime(300);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does nothing when enabled is false', () => {
    const { saver, run } = makeSaver();
    saver.onChange(false);
    saver.onChange(false);
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
  });

  it('treats false→true transition as a fresh initial', () => {
    const { saver, run } = makeSaver();
    saver.onChange(true); // initial — skipped
    saver.onChange(true); // would save…
    saver.onChange(false); // …but disabled cancels and resets
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();

    saver.onChange(true); // re-enable counts as initial again
    vi.advanceTimersByTime(400);
    expect(run).not.toHaveBeenCalled();

    saver.onChange(true);
    vi.advanceTimersByTime(400);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('flush() runs the saver synchronously and cancels any pending timer', () => {
    const { saver, run } = makeSaver();
    saver.onChange(true); // initial
    saver.onChange(true); // schedules
    saver.flush();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('hasPending() reflects timer state', () => {
    const { saver } = makeSaver();
    expect(saver.hasPending()).toBe(false);
    saver.onChange(true); // initial — no timer
    expect(saver.hasPending()).toBe(false);
    saver.onChange(true); // schedules
    expect(saver.hasPending()).toBe(true);
    vi.advanceTimersByTime(400);
    expect(saver.hasPending()).toBe(false);
  });

  it('cancel() stops a pending save without running it', () => {
    const { saver, run } = makeSaver();
    saver.onChange(true);
    saver.onChange(true);
    expect(saver.hasPending()).toBe(true);
    saver.cancel();
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
    expect(saver.hasPending()).toBe(false);
  });
});
