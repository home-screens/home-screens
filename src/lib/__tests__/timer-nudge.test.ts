import { describe, it, expect } from 'vitest';
import {
  addMinute,
  canSubtractMinute,
  materializeSession,
  quickTimerLengthSec,
  sessionProgress,
  sessionTargetsDisplay,
  startSession,
  subtractMinute,
} from '../timer-logic';
import type { TimerSession } from '@/types/timers';

const T0 = 1_700_000_000_000;

const quick = (durationSec: number): TimerSession =>
  startSession({ kind: 'quick', durationSec, targets: 'all', view: 'ring' }, T0);

describe('canSubtractMinute', () => {
  it('offers a minute off while the clock shows 2:00 or more', () => {
    expect(canSubtractMinute(5 * 60_000)).toBe(true);
    expect(canSubtractMinute(120_000)).toBe(true);
    // The clock rounds up, so 1:59.001 left still reads 2:00.
    expect(canSubtractMinute(119_001)).toBe(true);
  });

  it('stops offering it as 2:00 turns to 1:59, so a tap always leaves at least 1:00', () => {
    expect(canSubtractMinute(119_000)).toBe(false);
    // At 1:03 a tap used to leave 0:03.
    expect(canSubtractMinute(63_000)).toBe(false);
    expect(canSubtractMinute(60_000)).toBe(false);
  });

  it('never offers one on a step with nothing left, such as one waiting for its "Done!"', () => {
    expect(canSubtractMinute(0)).toBe(false);
    expect(canSubtractMinute(-5_000)).toBe(false);
  });
});

describe('subtractMinute', () => {
  it('shrinks the step by a minute and leaves its start alone', () => {
    const s = subtractMinute(quick(300), T0 + 40_000);
    expect(s.stepStartedAt).toBe(T0);
    expect(s.steps[0].durationSec).toBe(240);
  });

  it('takes the minute at 2:00 on the clock and leaves 1:00', () => {
    const s = quick(300);
    // 1:59.5 left reads 2:00.
    const at = T0 + 300_000 - 119_500;
    const after = subtractMinute(s, at);
    expect(after.steps[0].durationSec).toBe(240);
    const left = after.steps[0].durationSec * 1000 - (at - after.stepStartedAt);
    expect(left).toBe(59_500);
  });

  it('does nothing under two minutes: a press that arrives late never runs the timer down', () => {
    // Pressed at 2:00.2 on the wall, handled by the hub at 1:59.0.
    const s = quick(300);
    const late = T0 + 300_000 - 119_000;
    expect(subtractMinute(s, late)).toBe(s);
    expect(subtractMinute(s, T0 + 300_000 - 63_000)).toBe(s);
    expect(subtractMinute(s, T0 + 240_000)).toBe(s);
    expect(materializeSession(subtractMinute(s, late), late)!.status).toBe('running');
  });

  it('does nothing on a timer shorter than two minutes, even at its start', () => {
    const s = quick(90);
    expect(subtractMinute(s, T0)).toBe(s);
  });

  it('counts from the pause, not the clock, while paused', () => {
    const paused = { ...quick(300), pausedAt: T0 + 10_000 };
    expect(subtractMinute(paused, T0 + 500_000).steps[0].durationSec).toBe(240);
  });
});

describe('a quick timer keeps the name it was started with', () => {
  it('through minutes added and taken off', () => {
    let s = quick(300);
    s = addMinute(s, T0 + 10_000);
    expect(s.steps[0].durationSec).toBe(360);
    expect(quickTimerLengthSec(s)).toBe(300);
    s = subtractMinute(subtractMinute(s, T0 + 83_000), T0 + 84_000);
    expect(quickTimerLengthSec(s)).toBe(300);
  });

  it('falls back to the step for a session saved before the length was kept', () => {
    const { quickSec, ...old } = quick(120);
    void quickSec;
    expect(quickTimerLengthSec(old)).toBe(120);
  });
});

describe('sessionProgress', () => {
  it('reports no step and no progress for a finished session', () => {
    const done = materializeSession(quick(60), T0 + 61_000)!;
    expect(done.status).toBe('done');
    expect(sessionProgress(done, T0 + 61_000)).toEqual({ step: undefined, remainingMs: 0, fraction: 0, paused: false });
  });

  it('never divides by a step with no length', () => {
    const broken = materializeSession({ ...quick(60), steps: [{ id: 'quick', label: '', icon: '', durationSec: 0, waitForTap: true }] }, T0)!;
    expect(sessionProgress(broken, T0).fraction).toBe(0);
  });
});

describe('sessionTargetsDisplay', () => {
  it('matches every display for "all", and only the named ones otherwise', () => {
    expect(sessionTargetsDisplay({ targets: 'all' }, 'hall')).toBe(true);
    expect(sessionTargetsDisplay({ targets: ['kitchen'] }, 'kitchen')).toBe(true);
    expect(sessionTargetsDisplay({ targets: ['kitchen'] }, 'hall')).toBe(false);
    // The one-display route has no id and shows every session.
    expect(sessionTargetsDisplay({ targets: ['kitchen'] }, undefined)).toBe(true);
  });
});
