import { describe, it, expect } from 'vitest';
import {
  addMinute,
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

describe('subtractMinute', () => {
  it('shrinks the step by a minute and leaves its start alone', () => {
    const s = subtractMinute(quick(300), T0 + 40_000);
    expect(s.stepStartedAt).toBe(T0);
    expect(s.steps[0].durationSec).toBe(240);
  });

  it('does nothing with a minute or less left: a press that arrives late never ends the timer', () => {
    // Pressed at 1:00.3 on the wall, handled by the hub at 0:59.9.
    const s = quick(300);
    const late = T0 + 300_000 - 59_900;
    expect(subtractMinute(s, late)).toBe(s);
    expect(subtractMinute(s, T0 + 240_000)).toBe(s);
    expect(materializeSession(subtractMinute(s, late), late)!.status).toBe('running');
  });

  it('never leaves a step with no length', () => {
    // A 61 second step pressed at once keeps a second, not zero.
    const s = subtractMinute(quick(61), T0);
    expect(s.steps[0].durationSec).toBe(1);
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
