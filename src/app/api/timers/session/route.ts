import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import {
  MAX_STEP_SEC,
  MIN_STEP_SEC,
  addMinute,
  subtractMinute,
  toggleSound,
  advanceStep,
  cancelSession,
  isValidTargets,
  materializeSession,
  pauseSession,
  pressIsForSession,
  readRoutinesFile,
  readSessionCached,
  resumeSession,
  startSession,
  updateSessionAtomic,
} from '@/lib/timer-data';
import { TimerError } from '@/lib/timer-logic';
import { TIMER_VIEWS, type TimerSession, type TimerView } from '@/types/timers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/timers/session — the active session, lazily materialized (elapsed
 * auto-steps advanced, waitForTap holds surfaced, expiry applied). Displays
 * poll this every few seconds and derive the live countdown locally from the
 * returned timestamps, so poll latency only affects start latency — never
 * countdown accuracy. Returns `{ session: null }` when nothing is running.
 */
export const GET = withDisplayAuth(async () => {
  const { session } = await readSessionCached();
  return NextResponse.json({ session: materializeSession(session, Date.now()) });
}, 'Failed to read timer session');

interface SessionActionBody {
  action?: string;
  /** start */
  kind?: 'routine' | 'quick';
  routineId?: string;
  durationSec?: number;
  targets?: unknown;
  view?: TimerView;
  sound?: boolean;
  /** start, quick only: false keeps the timer out of the full-screen takeover */
  fullScreen?: boolean;
  /** control: the session the press was made looking at */
  sessionId?: unknown;
  /** control: the step it was made looking at (the wall's "Done!" tap) */
  stepIndex?: unknown;
}

/**
 * POST /api/timers/session — start a session or control the running one.
 *
 * Actions: `start`, `pause`, `resume`, `skip`, `step-done`, `add-minute`, `subtract-minute`, `toggle-sound`,
 * `cancel`. `skip` and `step-done` are the same transition (advance now);
 * both names exist because remotes skip and touch displays tap Done.
 * Starting while a session is running replaces it — one active session at a
 * time is the intended family-display behavior. A control may name the
 * `sessionId` it was pressed on and the `stepIndex` it saw; when the hub's
 * timer is another one by then, or on another step, the press is refused as
 * "no timer is running" and nothing changes.
 *
 * Display-auth (not editor-auth) on purpose: touch kiosks post `step-done`.
 * Every mutation runs inside the store's atomic queue so overlapping taps
 * from multiple displays can't interleave. A refusal is a `TimerError` the
 * route wrapper answers with its code.
 */
export const POST = withDisplayAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<SessionActionBody>(request);
  if (body instanceof NextResponse) return body;
  const now = Date.now();

  if (body.action === 'start') {
    const started = await handleStart(body, now);
    return NextResponse.json({ session: materializeSession(started, now) });
  }

  const CONTROL_ACTIONS: Record<string, (s: TimerSession, now: number) => TimerSession> = {
    pause: pauseSession,
    resume: resumeSession,
    skip: advanceStep,
    'step-done': advanceStep,
    'add-minute': addMinute,
    'subtract-minute': subtractMinute,
    'toggle-sound': (session) => toggleSound(session),
    cancel: cancelSession,
  };
  const op = body.action ? CONTROL_ACTIONS[body.action] : undefined;
  if (!op) throw new TimerError(400, 'timers.badRequest', 'Unknown action');

  const updated = await updateSessionAtomic((current) => {
    // Materialize first so controls act on the step the user is looking at,
    // not a step that silently elapsed since the last write.
    const live = materializeSession(current.session, now);
    // Stop also ends a finished timer, so "Time's up!" can be cleared
    // everywhere; every other control needs it still running.
    const stoppable = live && (live.status === 'running' || (live.status === 'done' && body.action === 'cancel'));
    if (!live || !stoppable) throw new TimerError(404, 'timers.notRunning', 'No timer is running');
    // Checked here, inside the queue, so two taps on one step cannot both
    // find it waiting: the timer that press was for is not running any more.
    if (!pressIsForSession(live, body)) throw new TimerError(404, 'timers.notRunning', 'No timer is running');
    const { awaitingTap, ...session } = live;
    void awaitingTap;
    return { session: op(session, now) };
  });

  return NextResponse.json({ session: materializeSession(updated.session, now) });
}, 'Failed to update timer session');

async function handleStart(
  body: SessionActionBody,
  now: number,
): Promise<TimerSession> {
  if (!isValidTargets(body.targets)) throw new TimerError(400, 'timers.badRequest', 'Invalid targets');
  if (body.view !== undefined && !TIMER_VIEWS.includes(body.view)) throw new TimerError(400, 'timers.badRequest', 'Invalid view');
  if (body.sound !== undefined && typeof body.sound !== 'boolean') throw new TimerError(400, 'timers.badRequest', 'Invalid sound');
  if (body.fullScreen !== undefined && typeof body.fullScreen !== 'boolean') throw new TimerError(400, 'timers.badRequest', 'Invalid fullScreen');

  if (body.kind === 'routine') {
    if (typeof body.routineId !== 'string' || !body.routineId) throw new TimerError(400, 'timers.badRequest', 'Missing routineId');
    const { routines } = await readRoutinesFile();
    const routine = routines.find((r) => r.id === body.routineId);
    if (!routine) throw new TimerError(404, 'timers.routineGone', 'Routine not found');
    const { session } = await updateSessionAtomic(() => ({
      session: startSession(
        { kind: 'routine', routine, targets: body.targets as 'all' | string[], view: body.view, sound: body.sound },
        now,
      ),
    }));
    return session!;
  }

  if (body.kind === 'quick') {
    if (
      typeof body.durationSec !== 'number' ||
      !Number.isInteger(body.durationSec) ||
      body.durationSec < MIN_STEP_SEC ||
      body.durationSec > MAX_STEP_SEC
    ) {
      throw new TimerError(400, 'timers.badRequest', 'Invalid duration');
    }
    const { session } = await updateSessionAtomic(() => ({
      session: startSession(
        {
          kind: 'quick',
          durationSec: body.durationSec,
          targets: body.targets as 'all' | string[],
          view: body.view,
          sound: body.sound,
          fullScreen: body.fullScreen,
        },
        now,
      ),
    }));
    return session!;
  }

  throw new TimerError(400, 'timers.badRequest', 'Invalid kind');
}
