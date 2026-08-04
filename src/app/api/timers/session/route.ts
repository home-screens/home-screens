import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import {
  MAX_STEP_SEC,
  MIN_STEP_SEC,
  addMinute,
  advanceStep,
  cancelSession,
  isValidTargets,
  materializeSession,
  pauseSession,
  readRoutinesFile,
  readSessionCached,
  resumeSession,
  startSession,
  updateSessionAtomic,
} from '@/lib/timer-data';
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
}

/**
 * POST /api/timers/session — start a session or control the running one.
 *
 * Actions: `start`, `pause`, `resume`, `skip`, `step-done`, `add-minute`,
 * `cancel`. `skip` and `step-done` are the same transition (advance now);
 * both names exist because remotes skip and touch displays tap Done.
 * Starting while a session is running replaces it — one active session at a
 * time is the intended family-display behavior.
 *
 * Display-auth (not editor-auth) on purpose: touch kiosks post `step-done`.
 * Every mutation runs inside the store's atomic queue so overlapping taps
 * from multiple displays can't interleave.
 */
export const POST = withDisplayAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<SessionActionBody>(request);
  if (body instanceof NextResponse) return body;
  const now = Date.now();

  if (body.action === 'start') {
    const started = await handleStart(body, now);
    if (started instanceof NextResponse) return started;
    return NextResponse.json({ session: materializeSession(started, now) });
  }

  const CONTROL_ACTIONS: Record<string, (s: TimerSession, now: number) => TimerSession> = {
    pause: pauseSession,
    resume: resumeSession,
    skip: advanceStep,
    'step-done': advanceStep,
    'add-minute': addMinute,
    cancel: cancelSession,
  };
  const op = body.action ? CONTROL_ACTIONS[body.action] : undefined;
  if (!op) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const updated = await updateSessionAtomic((current) => {
    // Materialize first so controls act on the step the user is looking at,
    // not a step that silently elapsed since the last write.
    const live = materializeSession(current.session, now);
    if (!live || live.status !== 'running') {
      throw NextResponse.json({ error: 'No timer is running' }, { status: 404 });
    }
    const { awaitingTap, ...session } = live;
    void awaitingTap;
    return { session: op(session, now) };
  });

  return NextResponse.json({ session: materializeSession(updated.session, now) });
}, 'Failed to update timer session');

async function handleStart(
  body: SessionActionBody,
  now: number,
): Promise<TimerSession | NextResponse> {
  if (!isValidTargets(body.targets)) {
    return NextResponse.json({ error: 'Invalid targets' }, { status: 400 });
  }
  if (body.view !== undefined && !TIMER_VIEWS.includes(body.view)) {
    return NextResponse.json({ error: 'Invalid view' }, { status: 400 });
  }
  if (body.sound !== undefined && typeof body.sound !== 'boolean') {
    return NextResponse.json({ error: 'Invalid sound' }, { status: 400 });
  }

  if (body.kind === 'routine') {
    if (typeof body.routineId !== 'string' || !body.routineId) {
      return NextResponse.json({ error: 'Missing routineId' }, { status: 400 });
    }
    const { routines } = await readRoutinesFile();
    const routine = routines.find((r) => r.id === body.routineId);
    if (!routine) {
      return NextResponse.json({ error: 'Routine not found' }, { status: 404 });
    }
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
      return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });
    }
    const { session } = await updateSessionAtomic(() => ({
      session: startSession(
        { kind: 'quick', durationSec: body.durationSec, targets: body.targets as 'all' | string[], view: body.view, sound: body.sound },
        now,
      ),
    }));
    return session!;
  }

  return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
}
