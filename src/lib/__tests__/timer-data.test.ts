import { describe, it, expect } from 'vitest';
import {
  HOLD_AUTO_ADVANCE_MS,
  SESSION_LINGER_MS,
  addMinute,
  advanceStep,
  cancelSession,
  isValidTargets,
  materializeSession,
  pauseSession,
  resumeSession,
  startSession,
  validateRoutines,
} from '../timer-data';
import type { Routine, TimerSession } from '@/types/timers';

const T0 = 1_700_000_000_000;

const routine: Routine = {
  id: 'morning',
  name: 'Morning routine',
  icon: '🚀',
  view: 'ring',
  steps: [
    { id: 's1', label: 'Get dressed', icon: '👕', durationSec: 300 },
    { id: 's2', label: 'Brush teeth', icon: '🪥', durationSec: 120, waitForTap: true },
    { id: 's3', label: 'Make bed', icon: '🛏️', durationSec: 180 },
  ],
};

function start(overrides?: Partial<TimerSession>): TimerSession {
  return { ...startSession({ kind: 'routine', routine, targets: 'all' }, T0), ...overrides };
}

describe('startSession', () => {
  it('snapshots routine steps so later routine edits cannot touch the session', () => {
    const s = start();
    expect(s.steps).toHaveLength(3);
    expect(s.steps[0]).not.toBe(routine.steps[0]);
    expect(s.view).toBe('ring');
    expect(s.sound).toBe(true);
  });

  it('honors a routine-level sound preference', () => {
    const muted = startSession(
      { kind: 'routine', routine: { ...routine, sound: false }, targets: 'all' },
      T0,
    );
    expect(muted.sound).toBe(false);
  });

  it('builds a single synthetic step for quick timers, sound off by default', () => {
    const s = startSession({ kind: 'quick', durationSec: 300, targets: ['kitchen'] }, T0);
    expect(s.steps).toEqual([{ id: 'quick', label: '', icon: '⏱️', durationSec: 300 }]);
    expect(s.view).toBe('face');
    expect(s.sound).toBe(false);
  });
});

describe('materializeSession', () => {
  it('returns the session unchanged mid-step', () => {
    const m = materializeSession(start(), T0 + 60_000)!;
    expect(m.stepIndex).toBe(0);
    expect(m.awaitingTap).toBe(false);
  });

  it('advances across multiple elapsed steps, anchoring to exact boundaries', () => {
    // 300s step 1 done; 40s into step 2.
    const m = materializeSession(start(), T0 + 340_000)!;
    expect(m.stepIndex).toBe(1);
    expect(m.stepStartedAt).toBe(T0 + 300_000);
  });

  it('holds at an elapsed waitForTap step instead of advancing', () => {
    // Step 2 (120s, waitForTap) elapsed 2 min ago; step 3 must NOT start.
    const m = materializeSession(start(), T0 + 540_000)!;
    expect(m.stepIndex).toBe(1);
    expect(m.awaitingTap).toBe(true);
    expect(m.status).toBe('running');
  });

  it('auto-advances a hold once it exceeds the unattended cap', () => {
    // Step 2's hold started at T0+420s (300s step 1 + 120s step 2). One ms
    // past the cap, the routine moves on so a takeover can't sit forever.
    const holdStart = T0 + 420_000;
    const past = materializeSession(start(), holdStart + HOLD_AUTO_ADVANCE_MS + 1)!;
    expect(past.stepIndex).toBe(2);
    expect(past.stepStartedAt).toBe(holdStart + HOLD_AUTO_ADVANCE_MS);
    expect(past.awaitingTap).toBe(false);
  });

  it('completes (and later expires) a session abandoned on a final-step hold', () => {
    const s = start({
      steps: [{ id: 'only', label: 'x', icon: '⏱️', durationSec: 60, waitForTap: true }],
    });
    const capEnd = T0 + 60_000 + HOLD_AUTO_ADVANCE_MS;
    const done = materializeSession(s, capEnd + 1)!;
    expect(done.status).toBe('done');
    expect(done.completedAt).toBe(capEnd);
    expect(materializeSession(s, capEnd + SESSION_LINGER_MS + 1)).toBeNull();
  });

  it('completes when past the last step and expires after the linger window', () => {
    const s = start({
      steps: [{ id: 'only', label: 'x', icon: '⏱️', durationSec: 60 }],
    });
    const done = materializeSession(s, T0 + 61_000)!;
    expect(done.status).toBe('done');
    expect(done.completedAt).toBe(T0 + 60_000);

    expect(materializeSession(s, T0 + 60_000 + SESSION_LINGER_MS + 1)).toBeNull();
  });

  it('freezes the countdown while paused but still advances pre-pause elapsed steps', () => {
    // Paused 10s into step 2 — much later, still 10s into step 2.
    const paused = pauseSession(start(), T0 + 310_000);
    const m = materializeSession(paused, T0 + 999_000)!;
    expect(m.stepIndex).toBe(1);
    expect(m.stepStartedAt).toBe(T0 + 300_000);
    expect(m.pausedAt).toBe(T0 + 310_000);
  });

  it('returns null for null input', () => {
    expect(materializeSession(null, T0)).toBeNull();
  });
});

describe('pause / resume', () => {
  it('resume shifts the step anchor by the pause length', () => {
    const paused = pauseSession(start(), T0 + 100_000);
    const resumed = resumeSession(paused, T0 + 160_000);
    expect(resumed.pausedAt).toBeUndefined();
    expect(resumed.stepStartedAt).toBe(T0 + 60_000);
    // Remaining time is identical before and after the pause.
    const m = materializeSession(resumed, T0 + 160_000)!;
    expect(m.stepIndex).toBe(0);
  });

  it('double pause and stray resume are no-ops', () => {
    const s = start();
    const paused = pauseSession(s, T0 + 1000);
    expect(pauseSession(paused, T0 + 2000)).toBe(paused);
    expect(resumeSession(s, T0 + 1000)).toBe(s);
  });
});

describe('advanceStep', () => {
  it('starts the next step at now (skip and Done! are the same transition)', () => {
    const s = advanceStep(start(), T0 + 50_000);
    expect(s.stepIndex).toBe(1);
    expect(s.stepStartedAt).toBe(T0 + 50_000);
    expect(s.pausedAt).toBeUndefined();
  });

  it('completes the session when advancing past the last step', () => {
    let s = start();
    s = advanceStep(s, T0 + 1000);
    s = advanceStep(s, T0 + 2000);
    s = advanceStep(s, T0 + 3000);
    expect(s.status).toBe('done');
    expect(s.completedAt).toBe(T0 + 3000);
  });

  it('clears a pause so the skipped-to step counts immediately', () => {
    const s = advanceStep(pauseSession(start(), T0 + 1000), T0 + 5000);
    expect(s.pausedAt).toBeUndefined();
    expect(s.stepStartedAt).toBe(T0 + 5000);
  });
});

describe('addMinute', () => {
  it('extends a mid-countdown step by exactly 60s', () => {
    // 40s into the 300s first step: plain shift, no revive clamp.
    const extended = addMinute(start(), T0 + 40_000);
    expect(extended.stepStartedAt).toBe(T0 + 60_000);
  });

  it('revives an awaiting-tap hold with a full 60s regardless of overshoot', () => {
    const s = start({
      steps: [{ id: 'a', label: 'x', icon: '⏱️', durationSec: 60, waitForTap: true }],
    });
    // Held 5 minutes — a plain += 60s would leave it still held (dead button).
    const now = T0 + 360_000;
    expect(materializeSession(s, now)!.awaitingTap).toBe(true);

    const extended = addMinute(s, now);
    const m = materializeSession(extended, now)!;
    expect(m.awaitingTap).toBe(false);
    // Anchored so exactly 60s remain from now.
    expect(m.stepStartedAt).toBe(now - 60_000 + 60_000);
  });
});

describe('cancelSession', () => {
  it('marks cancelled with completedAt and expires like done', () => {
    const s = cancelSession(start(), T0 + 5000);
    expect(s.status).toBe('cancelled');
    expect(materializeSession(s, T0 + 6000)!.status).toBe('cancelled');
    expect(materializeSession(s, T0 + 5000 + SESSION_LINGER_MS + 1)).toBeNull();
  });
});

describe('validateRoutines', () => {
  it('accepts a valid list', () => {
    expect(validateRoutines([routine])).toBeNull();
  });

  it.each([
    ['not an array', 'nope', 'routines must be an array'],
    ['empty name', [{ ...routine, name: '  ' }], 'routine name must be 1-60 characters'],
    ['bad view', [{ ...routine, view: 'spiral' }], 'invalid routine view'],
    ['bad sound', [{ ...routine, sound: 'yes' }], 'invalid routine sound'],
    ['no steps', [{ ...routine, steps: [] }], 'routines need 1-20 steps'],
    [
      'short step',
      [{ ...routine, steps: [{ id: 's', label: 'x', icon: '⏱️', durationSec: 1 }] }],
      'step length must be 5s to 4h',
    ],
    [
      'duplicate ids',
      [routine, { ...routine, name: 'Copy' }],
      'duplicate routine id',
    ],
  ])('rejects %s', (_name, input, error) => {
    expect(validateRoutines(input)).toBe(error);
  });
});

describe('isValidTargets', () => {
  it.each([
    ['all', true],
    [['kitchen', 'bedroom'], true],
    [[], false],
    [[''], false],
    ['kitchen', false],
    [null, false],
  ])('%j → %s', (input, expected) => {
    expect(isValidTargets(input)).toBe(expected);
  });
});
