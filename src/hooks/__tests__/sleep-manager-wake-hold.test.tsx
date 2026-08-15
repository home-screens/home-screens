// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSleepManager, RULE_WAKE_HOLD_MS } from '../useSleepManager';
import { DEFAULT_WAKE_HOLD_MINUTES } from '@/lib/sleep-timeline';
import type { SleepSettings } from '@/types/config';

/**
 * A rule-initiated wake must survive a scheduled sleep window for
 * RULE_WAKE_HOLD_MS before the schedule re-asserts, so a rule (doorbell,
 * alarm) doesn't flash the screen and black out ~10s later. Explicit wakes
 * (touch, remote wake, remote navigation, remote brightness) get their own
 * configurable hold — `wakeHoldMinutes`, default DEFAULT_WAKE_HOLD_MINUTES —
 * armed only when the wake lands inside a schedule window (issue #26:
 * without it, the remote wake button "only lasts a couple seconds"
 * overnight). Holds are monotonic: a shorter wake never truncates a standing
 * longer hold; only an explicit sleep cancels.
 */

// An always-active sleep window, so `inSleepWindow` is true regardless of the
// (mocked) wall clock, isolating the hold behavior from schedule edges.
const ALWAYS_ASLEEP: SleepSettings = {
  enabled: true,
  dimAfterMinutes: 5,
  sleepAfterMinutes: 5,
  dimBrightness: 20,
  schedule: { startTime: '00:00', endTime: '23:59' },
};

describe('useSleepManager rule-wake hold', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Noon, comfortably inside the sleep window.
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('holds the display awake past several ticks and re-sleeps after 5 minutes', async () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    // The schedule forces sleep on the first tick.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');

    // A rule fires a wake with the 5-minute hold.
    act(() => { result.current.wake({ holdMs: RULE_WAKE_HOLD_MS }); });
    expect(result.current.displayState).toBe('active');

    // Several 10s ticks pass — the schedule does NOT re-sleep it during the hold.
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.displayState).toBe('active');
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(result.current.displayState).toBe('active');

    // Once the 5-minute hold expires, the next tick re-asserts scheduled sleep.
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(result.current.displayState).toBe('asleep');
  });

  it('a plain wake during the sleep window holds for the default, then re-sleeps', async () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');

    // The remote wake button: plain wake, no caller-chosen hold.
    act(() => { result.current.wake(); });
    expect(result.current.displayState).toBe('active');

    // The next ticks must NOT re-sleep it — this is the issue #26 fix.
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.displayState).toBe('active');

    // Just shy of the default hold: still awake.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_WAKE_HOLD_MINUTES * 60_000 - 70_000);
    });
    expect(result.current.displayState).toBe('active');

    // Past the hold, the schedule re-asserts.
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(result.current.displayState).toBe('asleep');
  });

  it('wakeHoldMinutes: 0 restores next-tick re-sleep for plain wakes', async () => {
    const { result } = renderHook(() =>
      useSleepManager({ ...ALWAYS_ASLEEP, wakeHoldMinutes: 0 }, undefined),
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { result.current.wake(); });
    expect(result.current.displayState).toBe('active');

    // No hold: the schedule re-asserts within the next 10s tick.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');
  });

  it('honors a custom wakeHoldMinutes value', async () => {
    const { result } = renderHook(() =>
      useSleepManager({ ...ALWAYS_ASLEEP, wakeHoldMinutes: 1 }, undefined),
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    act(() => { result.current.wake(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(50_000); });
    expect(result.current.displayState).toBe('active');

    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(result.current.displayState).toBe('asleep');
  });

  it('a plain wake outside any schedule window arms no hold — idle dimming is unaffected', async () => {
    // Idle-only config: dims after 1 idle minute, no schedules. If the wake
    // wrongly armed the 5-minute hold, the 1-minute idle dim would be
    // suppressed and this would stay active.
    const idleOnly: SleepSettings = {
      enabled: true,
      dimAfterMinutes: 1,
      sleepAfterMinutes: 0,
      dimBrightness: 20,
    };
    const { result } = renderHook(() => useSleepManager(idleOnly, undefined));

    act(() => { result.current.wake(); });
    expect(result.current.displayState).toBe('active');

    await act(async () => { await vi.advanceTimersByTimeAsync(70_000); });
    expect(result.current.displayState).toBe('dimmed');
  });

  it('a plain wake during a DIM schedule window also holds', async () => {
    // The wake hold covers both window kinds — the settings slider is shown
    // when either schedule is enabled.
    const dimOnly: SleepSettings = {
      ...ALWAYS_ASLEEP,
      schedule: undefined,
      dimSchedule: { startTime: '00:00', endTime: '23:59' },
    };
    const { result } = renderHook(() => useSleepManager(dimOnly, undefined));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('dimmed');

    act(() => { result.current.wake(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.displayState).toBe('active');
  });

  it('a touch on a scheduled-asleep display arms the same hold as the wake button', async () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { window.dispatchEvent(new Event('touchstart')); });
    expect(result.current.displayState).toBe('active');

    // Held through multiple ticks, not re-slept at the next one.
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.displayState).toBe('active');
  });

  it('activity extends the hold — the display sleeps wakeHoldMinutes after the LAST touch', async () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    act(() => { window.dispatchEvent(new Event('touchstart')); });
    expect(result.current.displayState).toBe('active');

    // A second touch 4 minutes in restarts the clock.
    await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60_000); });
    act(() => { window.dispatchEvent(new Event('touchstart')); });

    // 4 more minutes (8 total, past the original expiry): still awake.
    await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60_000); });
    expect(result.current.displayState).toBe('active');

    // 5 quiet minutes after the last touch: the schedule re-asserts.
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); });
    expect(result.current.displayState).toBe('asleep');
  });

  it('a touch never truncates a longer standing hold (sleep-override survives passers-by)', async () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    // "Keep the display on for an hour" (sleep-override).
    act(() => { result.current.wake({ holdMs: 60 * 60_000 }); });
    expect(result.current.displayState).toBe('active');

    // Someone touches the kiosk two minutes in. If the activity re-arm
    // assigned instead of raising, the hold would collapse to the 5-minute
    // default and the display would be asleep well before the 12-minute mark.
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); });
    act(() => { window.dispatchEvent(new Event('touchstart')); });

    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
    expect(result.current.displayState).toBe('active');

    // The full hour still stands; past it, the schedule re-asserts.
    await act(async () => { await vi.advanceTimersByTimeAsync(50 * 60_000); });
    expect(result.current.displayState).toBe('asleep');
  });

  it('brightness 100 during the sleep window arms the hold', async () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { result.current.setRemoteBrightness(100); });
    expect(result.current.displayState).toBe('active');

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.displayState).toBe('active');
  });

  it('remote partial brightness during the sleep window survives the next ticks', async () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');

    // "Brightness 40" from the remote: without the hold, the window's asleep
    // branch would wipe the override within 10s.
    act(() => { result.current.setRemoteBrightness(40); });
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.dimOpacity).toBeCloseTo(0.6);

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.dimOpacity).toBeCloseTo(0.6);

    // Hold expiry: the schedule re-asserts and clears the override.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_WAKE_HOLD_MINUTES * 60_000);
    });
    expect(result.current.displayState).toBe('asleep');
  });

  it('a hold armed while dimmed does not swallow the scheduled morning wake', async () => {
    // 05:58, two minutes before the overnight window ends. A remote partial
    // brightness arms a hold that outlives the window edge; the leave-window
    // wake must still fire (it runs before the held-wake suppression),
    // otherwise the display would sit dimmed at 40% indefinitely — nothing
    // else ever brightens it.
    vi.setSystemTime(new Date(2025, 0, 15, 5, 58, 0));
    const overnight: SleepSettings = {
      ...ALWAYS_ASLEEP,
      dimAfterMinutes: 600,
      sleepAfterMinutes: 600,
      schedule: { startTime: '23:00', endTime: '06:00' },
    };
    const { result } = renderHook(() => useSleepManager(overnight, undefined));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { result.current.setRemoteBrightness(40); });
    expect(result.current.displayState).toBe('dimmed');

    // Cross 06:00 while the hold is still standing (armed ~05:58, 5 min).
    await act(async () => { await vi.advanceTimersByTimeAsync(3 * 60_000); });
    expect(result.current.displayState).toBe('active');
    expect(result.current.dimOpacity).toBe(0);
  });

  it('the schedule window for the hold is evaluated in the display timezone', async () => {
    // Pick a zone whose wall-clock hour differs from the host's by at least
    // 3 hours, then build a 1-hour window around the ZONE's current hour.
    // The tick puts the display asleep (it already evaluates in-zone); the
    // wake must arm the hold via the same zone — if it used the naive local
    // clock it would see "outside the window", arm nothing, and the next
    // tick would re-sleep.
    const naiveHour = new Date().getHours();
    const candidates = ['Asia/Tokyo', 'America/Chicago', 'Europe/Berlin', 'Pacific/Auckland'];
    const zone = candidates.find((tz) => {
      const h = parseInt(
        new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false })
          .format(new Date()),
        10,
      ) % 24;
      const diff = Math.min((h - naiveHour + 24) % 24, (naiveHour - h + 24) % 24);
      return diff >= 3;
    });
    expect(zone).toBeDefined();
    const zoneHour = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hour12: false })
        .format(new Date()),
      10,
    ) % 24;
    const pad = (h: number) => String(h).padStart(2, '0');
    const zoned: SleepSettings = {
      ...ALWAYS_ASLEEP,
      schedule: { startTime: `${pad(zoneHour)}:00`, endTime: `${pad((zoneHour + 1) % 24)}:00` },
    };
    const { result } = renderHook(() => useSleepManager(zoned, zone));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { result.current.wake(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.displayState).toBe('active');
  });

  it('an explicit forceSleep cancels a standing hold — sleep sticks', async () => {
    // wakeHoldMinutes: 0 so the post-cancel plain wake arms nothing and the
    // "hold is really gone" assertion below sees the schedule re-assert.
    const { result } = renderHook(() =>
      useSleepManager({ ...ALWAYS_ASLEEP, wakeHoldMinutes: 0 }, undefined),
    );

    act(() => { result.current.wake({ holdMs: 60 * 60_000 }); });
    expect(result.current.displayState).toBe('active');

    // Human says "displays to sleep" mid-hold: the hold must die with it,
    // otherwise a later touch-wake would resurrect an hour-long pin-awake.
    act(() => { result.current.forceSleep(); });
    expect(result.current.displayState).toBe('asleep');

    // A plain touch-wake now behaves normally: re-slept by the next tick.
    act(() => { result.current.wake(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');
  });

  it('brightness 0 (explicit sleep) also cancels the hold', async () => {
    const { result } = renderHook(() =>
      useSleepManager({ ...ALWAYS_ASLEEP, wakeHoldMinutes: 0 }, undefined),
    );

    act(() => { result.current.wake({ holdMs: 60 * 60_000 }); });
    act(() => { result.current.setRemoteBrightness(0); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { result.current.wake(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('asleep');
  });
});

describe('useSleepManager wakeIfHidden', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('wakes a fully asleep display', () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    act(() => { result.current.forceSleep(); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { result.current.wakeIfHidden(); });
    expect(result.current.displayState).toBe('active');
  });

  it('sees a sleep issued in the same command batch (synchronous ref, not stale state)', () => {
    // The command drain runs a whole batch before React re-renders: `sleep`
    // then `goto-screen` in one 3s poll must still wake — a render-assigned
    // ref would read the pre-batch 'active' and skip the wake, navigating
    // invisibly under the opaque overlay.
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    act(() => {
      result.current.forceSleep();
      result.current.wakeIfHidden();
    });
    expect(result.current.displayState).toBe('active');
  });

  it('wakes a schedule-dimmed display (content at 20% is effectively hidden)', async () => {
    const dimOnly: SleepSettings = {
      ...ALWAYS_ASLEEP,
      schedule: undefined,
      dimSchedule: { startTime: '00:00', endTime: '23:59' },
    };
    const { result } = renderHook(() => useSleepManager(dimOnly, undefined));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.displayState).toBe('dimmed');

    act(() => { result.current.wakeIfHidden(); });
    expect(result.current.displayState).toBe('active');
    // And the wake carried the schedule hold — not re-dimmed next tick.
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.displayState).toBe('active');
  });

  it('leaves a remote-set partial brightness untouched', () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    act(() => { result.current.setRemoteBrightness(40); });
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.dimOpacity).toBeCloseTo(0.6);

    act(() => { result.current.wakeIfHidden(); });
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.dimOpacity).toBeCloseTo(0.6);
  });

  it('is a no-op on an active display', () => {
    const { result } = renderHook(() => useSleepManager(ALWAYS_ASLEEP, undefined));

    act(() => { result.current.wakeIfHidden(); });
    expect(result.current.displayState).toBe('active');
  });
});
