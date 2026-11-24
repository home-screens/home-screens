import { displayFetch } from './display-fetch';
import type { TimerSession, TimerTargets, TimerView } from '@/types/timers';

/**
 * The timer session as a wall touches it.
 *
 * Both surfaces a finger can reach on a display — the full-screen takeover
 * and the Quick Timer module — speak to `/api/timers/session` through here,
 * so the action names and the display-auth fetch are written once. The phone
 * has its own path to the same route (`useTimersData`), which carries the
 * remote's session cookie instead of a display token.
 */

/** Controls a running session accepts. `step-done` ends a wait-for-tap hold. */
export type TimerControlAction =
  | 'pause'
  | 'resume'
  | 'add-minute'
  | 'subtract-minute'
  | 'step-done'
  | 'toggle-sound'
  | 'cancel';

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

/**
 * A press on a running timer. It names the timer it was made looking at and,
 * for "Done!", the step: the hub's timer can be another one by now (started
 * from a phone inside the last heartbeat), and a second "Done!" tap must not
 * skip the next step. The hub turns a press for anything else down.
 */
export function postTimerControl(
  action: TimerControlAction,
  on: Pick<TimerSession, 'id' | 'stepIndex'>,
): Promise<boolean> {
  return post({
    action,
    sessionId: on.id,
    ...(action === 'step-done' ? { stepIndex: on.stepIndex } : {}),
  });
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
