import {
  TIMER_VIEWS,
  type MaterializedTimerSession,
  type Routine,
  type TimerSession,
  type TimerSessionStatus,
  type TimerTargets,
  type TimerView,
} from '@/types/timers';
import { uuid } from './uuid';

/**
 * Pure timer/session math shared by the server stores (timer-data.ts), the
 * display overlay, and /remote. No fs / store imports — this module must stay
 * importable from client components: displays materialize the polled session
 * locally every animation tick, so countdown and step advancement work
 * between polls with zero server round-trips.
 */

/** How long a finished/cancelled session stays readable (celebration window). */
export const SESSION_LINGER_MS = 15_000;

/**
 * How long an elapsed waitForTap step holds for its "Done!" tap before the
 * routine gives up waiting and moves on. Without a cap, an abandoned hold
 * keeps the session 'running' forever and the full-screen takeover covers
 * every targeted display until someone opens /remote — on a non-touch wall
 * display there is no on-device dismiss path at all.
 */
export const HOLD_AUTO_ADVANCE_MS = 10 * 60_000;

export const MAX_ROUTINES = 50;
export const MAX_STEPS = 20;
export const MIN_STEP_SEC = 5;
export const MAX_STEP_SEC = 4 * 60 * 60;

/**
 * Whether a newly-created timer chimes when it finishes. Quick timers used to
 * default to silence while routines defaulted to sound, so the same "Sound"
 * chip started in opposite states on two screens of the same tab.
 */
export const DEFAULT_TIMER_SOUND = true;

/**
 * Lazily materialize a session at `now`: advance past fully-elapsed
 * auto-advance steps, hold on an elapsed waitForTap step, flip to 'done'
 * past the last step, and expire finished sessions after the linger window.
 *
 * Pure — persisting the result is optional because the derivation is
 * idempotent: every reader materializing the same raw session at a later
 * `now` reaches the same (or a further-advanced) state.
 */
export function materializeSession(
  session: TimerSession | null,
  now: number,
): MaterializedTimerSession | null {
  if (!session) return null;

  if (session.status !== 'running') {
    const endedAt = session.completedAt ?? session.startedAt;
    if (now - endedAt > SESSION_LINGER_MS) return null;
    return { ...session, awaitingTap: false };
  }

  // While paused the countdown is frozen at the pause instant — but steps
  // whose time fully elapsed BEFORE the pause still advance, so pausing a
  // moment after a step ended can't resurrect it.
  const effectiveNow = session.pausedAt ?? now;

  let { stepIndex, stepStartedAt } = session;
  let status: TimerSessionStatus = session.status;
  let completedAt = session.completedAt;
  let awaitingTap = false;

  while (stepIndex < session.steps.length) {
    const step = session.steps[stepIndex];
    const durMs = step.durationSec * 1000;
    if (effectiveNow - stepStartedAt < durMs) break;
    if (step.waitForTap) {
      const heldMs = effectiveNow - (stepStartedAt + durMs);
      if (heldMs < HOLD_AUTO_ADVANCE_MS) {
        awaitingTap = true;
        break;
      }
      // Unattended past the cap — advance as if Done was tapped when the cap
      // expired, so the takeover is time-bounded even when nobody taps.
      stepStartedAt += durMs + HOLD_AUTO_ADVANCE_MS;
      stepIndex += 1;
      continue;
    }
    stepStartedAt += durMs;
    stepIndex += 1;
  }

  if (stepIndex >= session.steps.length) {
    status = 'done';
    // The session finished the moment the last step's time elapsed, not when
    // someone happened to read it — keeps the celebration window honest.
    completedAt = stepStartedAt;
    if (now - completedAt > SESSION_LINGER_MS) return null;
  }

  return { ...session, stepIndex, stepStartedAt, status, completedAt, awaitingTap };
}

export interface StartSessionInput {
  kind: 'routine' | 'quick';
  routine?: Routine;
  /** Quick timers only. */
  durationSec?: number;
  targets: TimerTargets;
  /** Overrides the routine's own view; required for quick timers. */
  view?: TimerView;
  sound?: boolean;
}

export function startSession(input: StartSessionInput, now: number): TimerSession {
  const base = {
    id: uuid(),
    stepIndex: 0,
    stepStartedAt: now,
    targets: input.targets,
    startedAt: now,
    status: 'running' as const,
  };
  if (input.kind === 'routine') {
    const routine = input.routine!;
    return {
      ...base,
      kind: 'routine',
      name: routine.name,
      icon: routine.icon,
      view: input.view ?? routine.view,
      steps: routine.steps.map((s) => ({ ...s })),
      sound: input.sound ?? routine.sound ?? true,
    };
  }
  return {
    ...base,
    kind: 'quick',
    view: input.view ?? 'face',
    steps: [{ id: 'quick', label: '', icon: '⏱️', durationSec: input.durationSec! }],
    sound: input.sound ?? false,
  };
}

export function pauseSession(s: TimerSession, now: number): TimerSession {
  if (s.status !== 'running' || s.pausedAt !== undefined) return s;
  return { ...s, pausedAt: now };
}

export function resumeSession(s: TimerSession, now: number): TimerSession {
  if (s.status !== 'running' || s.pausedAt === undefined) return s;
  const { pausedAt, ...rest } = s;
  return { ...rest, stepStartedAt: s.stepStartedAt + (now - pausedAt) };
}

/**
 * Advance to the next step right now. Serves both the manual "skip" control
 * and the "Done!" tap on a waitForTap step — they are the same transition.
 * Resuming from pause is implied: a skipped-to step starts counting at `now`.
 */
export function advanceStep(s: TimerSession, now: number): TimerSession {
  if (s.status !== 'running') return s;
  const nextIndex = s.stepIndex + 1;
  if (nextIndex >= s.steps.length) {
    const { pausedAt, ...rest } = s;
    void pausedAt;
    return { ...rest, stepIndex: nextIndex, status: 'done', completedAt: now };
  }
  const { pausedAt, ...rest } = s;
  void pausedAt;
  return { ...rest, stepIndex: nextIndex, stepStartedAt: now };
}

/**
 * Give the current step another minute. On an awaiting-tap hold (or any
 * overshoot), the result is always a full 60s of remaining time from now —
 * a plain `+= 60_000` would silently do nothing once the overshoot exceeded
 * a minute, making the control appear dead.
 */
export function addMinute(s: TimerSession, now: number): TimerSession {
  if (s.status !== 'running') return s;
  const step = s.steps[s.stepIndex];
  if (!step) return s;
  const effectiveNow = s.pausedAt ?? now;
  const revivedStart = effectiveNow - step.durationSec * 1000 + 60_000;
  return { ...s, stepStartedAt: Math.max(s.stepStartedAt + 60_000, revivedStart) };
}

export function cancelSession(s: TimerSession, now: number): TimerSession {
  if (s.status !== 'running') return s;
  return { ...s, status: 'cancelled', completedAt: now };
}

/** Returns an error message, or null when the routine list is valid. */
export function validateRoutines(routines: unknown): string | null {
  if (!Array.isArray(routines)) return 'routines must be an array';
  if (routines.length > MAX_ROUTINES) return `too many routines (max ${MAX_ROUTINES})`;
  const seen = new Set<string>();
  for (const r of routines as Routine[]) {
    if (!r || typeof r !== 'object') return 'invalid routine';
    if (typeof r.id !== 'string' || !r.id || r.id.length > 64) return 'invalid routine id';
    if (seen.has(r.id)) return 'duplicate routine id';
    seen.add(r.id);
    if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 60) {
      return 'routine name must be 1-60 characters';
    }
    if (r.icon !== undefined && (typeof r.icon !== 'string' || r.icon.length > 16)) {
      return 'invalid routine icon';
    }
    if (!TIMER_VIEWS.includes(r.view)) return 'invalid routine view';
    if (r.sound !== undefined && typeof r.sound !== 'boolean') return 'invalid routine sound';
    if (!Array.isArray(r.steps) || r.steps.length < 1 || r.steps.length > MAX_STEPS) {
      return `routines need 1-${MAX_STEPS} steps`;
    }
    const stepIds = new Set<string>();
    for (const step of r.steps) {
      if (!step || typeof step !== 'object') return 'invalid step';
      if (typeof step.id !== 'string' || !step.id || step.id.length > 64) return 'invalid step id';
      if (stepIds.has(step.id)) return 'duplicate step id';
      stepIds.add(step.id);
      if (typeof step.label !== 'string' || !step.label.trim() || step.label.length > 60) {
        return 'step name must be 1-60 characters';
      }
      if (typeof step.icon !== 'string' || step.icon.length > 16) return 'invalid step icon';
      if (
        typeof step.durationSec !== 'number' ||
        !Number.isInteger(step.durationSec) ||
        step.durationSec < MIN_STEP_SEC ||
        step.durationSec > MAX_STEP_SEC
      ) {
        return `step length must be ${MIN_STEP_SEC}s to 4h`;
      }
      if (step.waitForTap !== undefined && typeof step.waitForTap !== 'boolean') {
        return 'invalid waitForTap';
      }
    }
  }
  return null;
}

/** Validate a targets value from a request body. */
export function isValidTargets(targets: unknown): targets is TimerTargets {
  if (targets === 'all') return true;
  return (
    Array.isArray(targets) &&
    targets.length > 0 &&
    targets.length <= 64 &&
    targets.every((t) => typeof t === 'string' && t.length > 0 && t.length <= 64)
  );
}
