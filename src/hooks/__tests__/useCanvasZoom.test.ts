import { describe, it, expect } from 'vitest';
import {
  ZOOM_STOPS,
  MIN_ZOOM,
  MAX_ZOOM,
  stepStopIndex,
  createWheelGestureState,
  wheelStepAllowed,
  type WheelGestureState,
} from '../useCanvasZoom';

// Drives wheelStepAllowed with a fake clock the way the hook does: the
// timestamp is stamped into lastStepAt only when the caller actually steps.
function fire(state: WheelGestureState, deltaY: number, now: number, steps = true): boolean {
  const allowed = wheelStepAllowed(state, deltaY, now);
  if (allowed && steps) state.lastStepAt = now;
  return allowed;
}

describe('stepStopIndex', () => {
  it('walks one index per step across the whole ladder', () => {
    for (let i = 0; i < ZOOM_STOPS.length - 1; i++) {
      expect(stepStopIndex(ZOOM_STOPS[i], 1)).toBe(i + 1);
      expect(stepStopIndex(ZOOM_STOPS[i + 1], -1)).toBe(i);
    }
  });

  it('clamps at the ladder ends', () => {
    expect(stepStopIndex(MIN_ZOOM, -1)).toBe(0);
    expect(stepStopIndex(MAX_ZOOM, 1)).toBe(ZOOM_STOPS.length - 1);
  });

  it('tolerates float drift around a stop', () => {
    expect(stepStopIndex(1.0 + 1e-9, 1)).toBe(ZOOM_STOPS.indexOf(1.25));
    expect(stepStopIndex(0.75 - 1e-9, -1)).toBe(ZOOM_STOPS.indexOf(0.5));
  });

  it('snaps off-ladder values toward the direction of travel', () => {
    // Between stops: in → stop above, out → stop below.
    expect(ZOOM_STOPS[stepStopIndex(1.1, 1)]).toBe(1.25);
    expect(ZOOM_STOPS[stepStopIndex(1.1, -1)]).toBe(1.0);
    // Outside the ladder: clamp into it regardless of direction.
    expect(ZOOM_STOPS[stepStopIndex(0.1, -1)]).toBe(MIN_ZOOM);
    expect(ZOOM_STOPS[stepStopIndex(0.1, 1)]).toBe(MIN_ZOOM);
    expect(ZOOM_STOPS[stepStopIndex(5.0, 1)]).toBe(MAX_ZOOM);
    expect(ZOOM_STOPS[stepStopIndex(5.0, -1)]).toBe(MAX_ZOOM);
  });
});

describe('wheelStepAllowed', () => {
  it('ignores deltaY of exactly 0', () => {
    const s = createWheelGestureState();
    expect(fire(s, 0, 1000)).toBe(false);
  });

  it('steps every discrete notch of a fast flick (gaps above the stream window)', () => {
    const s = createWheelGestureState();
    // Five notches 40ms apart — a fast flick a flat throttle would eat.
    for (let i = 0; i < 5; i++) {
      expect(fire(s, -100, 1000 + i * 40)).toBe(true);
    }
  });

  it('throttles a continuous stream to one step per interval', () => {
    const s = createWheelGestureState();
    // Constant-magnitude trackpad stream every 16ms for 320ms.
    let allowedCount = 0;
    for (let t = 0; t <= 320; t += 16) {
      if (fire(s, -50, 1000 + t)) allowedCount++;
    }
    // Steps at 0ms (fresh gesture), then one per elapsed 100ms window:
    // 112 and 224. 320 is only 96ms after the last step, so it is throttled.
    expect(allowedCount).toBe(3);
  });

  it('locks out a momentum tail (sustained magnitude decay) until the next gesture', () => {
    const s = createWheelGestureState();
    expect(fire(s, -90, 1000)).toBe(true);
    // Momentum: strictly decaying magnitudes streaming every 16ms. The decay
    // streak trips before the 100ms throttle window reopens, so no further
    // event in the tail is allowed — even well past the throttle interval.
    const tail = [-80, -70, -60, -50, -40, -30, -20, -10, -5, -2, -1];
    const allowed = tail.map((d, i) => fire(s, d, 1016 + i * 16));
    expect(allowed).not.toContain(true);
    // A fresh gesture after a real pause steps again immediately.
    expect(fire(s, -100, 2000)).toBe(true);
  });

  it('does not mistake a steady deliberate stream for momentum', () => {
    const s = createWheelGestureState();
    // Constant magnitude never builds a decay streak; steps keep landing at
    // the throttle rate for as long as the gesture runs. With events every
    // 16ms a step lands every 112ms (first event at or past the 100ms mark):
    // t = 0, 112, 224, …, 896 within the 992ms of events.
    let allowedCount = 0;
    for (let t = 0; t <= 1000; t += 16) {
      if (fire(s, -50, 1000 + t)) allowedCount++;
    }
    expect(allowedCount).toBe(9);
  });

  it('does not arm the throttle on suppressed steps, so reversal at a ladder end is immediate', () => {
    const s = createWheelGestureState();
    // Streamed zoom-out events at the bottom of the ladder: allowed by cadence
    // but the caller never steps (ladder end), so lastStepAt stays unset.
    expect(fire(s, 80, 1000, false)).toBe(true);
    fire(s, 80, 1016, false);
    fire(s, 80, 1032, false);
    // Reversing direction mid-stream steps immediately — the throttle was
    // never armed by the suppressed no-op steps.
    expect(fire(s, -80, 1048)).toBe(true);
  });
});
