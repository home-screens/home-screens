/**
 * Visual timer / routine sequence types.
 *
 * Routines are family data (like meals and chores), NOT display config — they
 * live in `data/routines.json` and are managed from /remote. A running timer
 * is a `TimerSession`: a snapshot of the routine's steps plus epoch
 * timestamps, so clients derive the countdown locally and editing a routine
 * mid-run can't corrupt the session.
 */

/** Which full-screen takeover rendering a timer uses. */
export type TimerView = 'ring' | 'face' | 'cascade' | 'path';

export const TIMER_VIEWS: TimerView[] = ['ring', 'face', 'cascade', 'path'];

export interface RoutineStep {
  id: string;
  label: string;
  /** Emoji shown in the step bubble/chips. */
  icon: string;
  durationSec: number;
  /**
   * When true the step holds at 0:00 with a big "Done!" tap target instead of
   * auto-advancing — for steps a kid must actually finish (brush teeth),
   * as opposed to steps that just end (quiet reading).
   */
  waitForTap?: boolean;
}

export interface Routine {
  id: string;
  name: string;
  /** Emoji shown on the routine card and takeover header. */
  icon?: string;
  view: TimerView;
  /** Soft chimes on the display while this routine runs. Defaults to on. */
  sound?: boolean;
  steps: RoutineStep[];
}

/** Display ids the session shows on; 'all' covers every display (and legacy). */
export type TimerTargets = 'all' | string[];

export type TimerSessionStatus = 'running' | 'done' | 'cancelled';

export interface TimerSession {
  id: string;
  kind: 'routine' | 'quick';
  /** Routine name; absent for quick timers (clients localize "N minute timer"). */
  name?: string;
  icon?: string;
  view: TimerView;
  /** Snapshot of the steps at start time. Quick timers have one synthetic step. */
  steps: RoutineStep[];
  stepIndex: number;
  /**
   * Epoch ms the current step's countdown is anchored to. Resume and
   * add-a-minute shift it forward; lazy materialization advances it by
   * exactly the elapsed steps' durations so mid-run history stays exact.
   */
  stepStartedAt: number;
  /** Set while paused; countdown freezes at (pausedAt - stepStartedAt). */
  pausedAt?: number;
  targets: TimerTargets;
  startedAt: number;
  status: TimerSessionStatus;
  /** Set when status leaves 'running'; expiry lingers ~15s for the celebration. */
  completedAt?: number;
  /** Soft chimes on nudge / step change / completion. */
  sound: boolean;
}

/** A session after lazy materialization — what GET /api/timers/session returns. */
export interface MaterializedTimerSession extends TimerSession {
  /** Current step's time is up but it's a waitForTap step holding for "Done!". */
  awaitingTap: boolean;
}
