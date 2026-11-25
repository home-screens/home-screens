import { displayFetch } from './display-fetch';
import type { TimerSession, TimerTargets, TimerView } from '@/types/timers';

/**
 * The timer session as a finger touches it.
 *
 * Both surfaces a finger can reach on a display (the full-screen takeover
 * and the Quick Timer module) speak to `/api/timers/session` through here,
 * so the action names and the wall's fetch are written once. The phone's
 * Timers tab (`useTimersData`) sends the same press (`timerControlBody`)
 * through its own fetch, which carries the phone's sign-in and says when the
 * hub is out of reach.
 */

/**
 * Controls a running session accepts. `step-done` ends a wait-for-tap hold;
 * `skip` is the phone's name for the same move to the next step.
 */
export type TimerControlAction =
  | 'pause'
  | 'resume'
  | 'add-minute'
  | 'subtract-minute'
  | 'step-done'
  | 'skip'
  | 'toggle-sound'
  | 'cancel';

/**
 * What a press on a running timer sends. It names the timer it was made
 * looking at and, for a press that moves to the next step ("Done!", Skip),
 * the step: the hub's timer can be another one by now (started from a phone
 * or another wall inside the last read), and a second quick tap must not move
 * on a step further. The hub turns a press for anything else down with
 * `timers.notRunning`.
 */
export function timerControlBody(
  action: TimerControlAction,
  on: Pick<TimerSession, 'id' | 'stepIndex'>,
): Record<string, unknown> {
  return {
    action,
    sessionId: on.id,
    ...(action === 'step-done' || action === 'skip' ? { stepIndex: on.stepIndex } : {}),
  };
}

async function post(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await displayFetch('/api/timers/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    // The caller refreshes either way, and the heartbeat reconciles after
    // that: a wall that lost the hub for a moment must not show a control
    // that looks broken.
    return false;
  }
}

/** A press on a running timer from the wall (`timerControlBody`). */
export function postTimerControl(
  action: TimerControlAction,
  on: Pick<TimerSession, 'id' | 'stepIndex'>,
): Promise<boolean> {
  return post(timerControlBody(action, on));
}

export function startQuickTimer(input: {
  durationSec: number;
  view: TimerView;
  sound: boolean;
  targets: TimerTargets;
  /** False leaves the timer in the module's box instead of covering the screen. */
  fullScreen: boolean;
}): Promise<boolean> {
  return post({ action: 'start', kind: 'quick', ...input });
}
