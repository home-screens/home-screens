// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSleepManager } from '../useSleepManager';
import type { SleepSettings } from '@/types/config';

/**
 * `sleep.enabled` governs the *automatic* idle/schedule machinery only. A
 * display can still be put to sleep explicitly — by a rule's `sleep` action,
 * the remote sleep command, or a display-control module — and every recovery
 * path has to keep working when the setting is off.
 *
 * The regression: with sleep disabled, `forceSleep()` set displayState to
 * 'asleep' (which stops screen rotation) while `dimOpacity` short-circuited to
 * 0 and the activity listeners were never bound. The display sat frozen on one
 * screen at full brightness, ignoring touch, until a remote wake or a reload.
 */
const SLEEP_OFF: SleepSettings = {
  enabled: false,
  dimAfterMinutes: 5,
  sleepAfterMinutes: 5,
  dimBrightness: 20,
};

describe('useSleepManager with sleep settings disabled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('actually darkens the screen when forceSleep is called', () => {
    const { result } = renderHook(() => useSleepManager(SLEEP_OFF, undefined));

    expect(result.current.displayState).toBe('active');
    expect(result.current.dimOpacity).toBe(0);

    act(() => { result.current.forceSleep(); });

    expect(result.current.displayState).toBe('asleep');
    // Was 0 before the fix: asleep but fully transparent.
    expect(result.current.dimOpacity).toBe(1);
  });

  it('wakes on touch after an explicit sleep', () => {
    const { result } = renderHook(() => useSleepManager(SLEEP_OFF, undefined));

    act(() => { result.current.forceSleep(); });
    expect(result.current.displayState).toBe('asleep');

    // The only input a kiosk has. Before the fix no listener was bound, so this
    // did nothing and the display stayed asleep forever.
    act(() => { window.dispatchEvent(new Event('touchstart')); });

    expect(result.current.displayState).toBe('active');
    expect(result.current.dimOpacity).toBe(0);
  });

  it('darkens for a remote brightness-zero command too', () => {
    const { result } = renderHook(() => useSleepManager(SLEEP_OFF, undefined));

    // /remote and the display-control module route through setRemoteBrightness,
    // which lands on the same 'asleep' state with brightnessOverride cleared.
    act(() => { result.current.setRemoteBrightness(0); });

    expect(result.current.displayState).toBe('asleep');
    expect(result.current.dimOpacity).toBe(1);
  });

  it('still does not sleep on its own when the setting is off', async () => {
    const { result } = renderHook(() => useSleepManager(SLEEP_OFF, undefined));

    // Well past dimAfterMinutes + sleepAfterMinutes. The automatic machinery
    // must stay disabled — that is what `enabled: false` is actually for.
    await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60_000); });

    expect(result.current.displayState).toBe('active');
    expect(result.current.dimOpacity).toBe(0);
  });
});

/**
 * The other half of the same contract: `sleep.enabled` is live-pushed by
 * `useLiveConfig`, so turning sleep off in the editor is a prop change with no
 * remount. Removing the `!enabled` short-circuit in `dimOpacity` fixed the
 * explicit-sleep path but removed the only recovery from this transition, which
 * would have left an already-sleeping display dark with the setting switched
 * off — and many of these panels have no touchscreen to wake them.
 */
describe('useSleepManager when sleep is switched off while asleep', () => {
  const SLEEP_ON: SleepSettings = {
    enabled: true,
    dimAfterMinutes: 5,
    sleepAfterMinutes: 5,
    dimBrightness: 20,
    schedule: { startTime: '00:00', endTime: '23:59' },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('brightens the display when the setting is turned off', async () => {
    const { result, rerender } = renderHook(
      ({ s }: { s: SleepSettings }) => useSleepManager(s, undefined),
      { initialProps: { s: SLEEP_ON } },
    );

    // The schedule puts it to sleep on the first tick.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');
    expect(result.current.dimOpacity).toBe(1);

    // User turns sleep off to keep the display on. No remount — just new props.
    await act(async () => { rerender({ s: SLEEP_OFF }); });

    expect(result.current.displayState).toBe('active');
    expect(result.current.dimOpacity).toBe(0);
  });

  it('stays bright afterwards rather than re-sleeping on a later tick', async () => {
    const { result, rerender } = renderHook(
      ({ s }: { s: SleepSettings }) => useSleepManager(s, undefined),
      { initialProps: { s: SLEEP_ON } },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    await act(async () => { rerender({ s: SLEEP_OFF }); });

    await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60_000); });
    expect(result.current.displayState).toBe('active');
    expect(result.current.dimOpacity).toBe(0);
  });

  it('still lets an explicit sleep work after the setting was turned off', () => {
    const { result, rerender } = renderHook(
      ({ s }: { s: SleepSettings }) => useSleepManager(s, undefined),
      { initialProps: { s: SLEEP_ON } },
    );
    act(() => { rerender({ s: SLEEP_OFF }); });

    // The disable-transition reset must not defeat a later deliberate sleep —
    // it keys off `enabled` changing, which does not happen here.
    act(() => { result.current.forceSleep(); });
    expect(result.current.displayState).toBe('asleep');
    expect(result.current.dimOpacity).toBe(1);
  });
});
