import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET as getRoutines, PUT as putRoutines } from '@/app/api/timers/routines/route';
import { GET as getSession, POST as postSession } from '@/app/api/timers/session/route';
import type { Routine } from '@/types/timers';

let tmpDir: string;
let origCwd: () => string;

const T0 = 1_700_000_000_000;
let nowSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  nowSpy = vi.spyOn(Date, 'now').mockReturnValue(T0);
});

afterEach(async () => {
  nowSpy.mockRestore();
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

const routine: Routine = {
  id: 'morning',
  name: 'Morning routine',
  icon: '🚀',
  view: 'ring',
  steps: [
    { id: 's1', label: 'Get dressed', icon: '👕', durationSec: 300 },
    { id: 's2', label: 'Brush teeth', icon: '🪥', durationSec: 120, waitForTap: true },
  ],
};

function req(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/timers', {
    method: body ? 'POST' : 'GET',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function saveRoutines(routines: Routine[]) {
  const { revision } = await (await getRoutines(req())).json();
  const res = await putRoutines(req({ routines, revision }));
  expect(res.status).toBe(200);
}

describe('/api/timers/session', () => {
  it('GET returns null when nothing is running', async () => {
    const res = await getSession(req());
    expect(await res.json()).toEqual({ session: null });
  });

  it('start routine → 404 for unknown routine', async () => {
    const res = await postSession(
      req({ action: 'start', kind: 'routine', routineId: 'nope', targets: 'all' }),
    );
    expect(res.status).toBe(404);
  });

  it('start quick timer returns a running session with one step', async () => {
    const res = await postSession(
      req({ action: 'start', kind: 'quick', durationSec: 300, targets: ['kitchen'] }),
    );
    const { session } = await res.json();
    expect(session.kind).toBe('quick');
    expect(session.steps).toHaveLength(1);
    expect(session.status).toBe('running');
    expect(session.targets).toEqual(['kitchen']);
  });

  it('rejects bad start bodies', async () => {
    for (const body of [
      { action: 'start', kind: 'quick', durationSec: 1, targets: 'all' },
      { action: 'start', kind: 'quick', durationSec: 300, targets: [] },
      { action: 'start', kind: 'routine', targets: 'all' },
      { action: 'start', kind: 'quick', durationSec: 300, targets: 'all', view: 'spiral' },
      { action: 'nonsense' },
    ]) {
      const res = await postSession(req(body));
      expect(res.status).toBe(400);
    }
  });

  it('control actions 404 with no running session', async () => {
    const res = await postSession(req({ action: 'pause' }));
    expect(res.status).toBe(404);
  });

  it('runs a full routine lifecycle: start → pause → resume → skip → done tap', async () => {
    await saveRoutines([routine]);
    await postSession(req({ action: 'start', kind: 'routine', routineId: 'morning', targets: 'all' }));

    nowSpy.mockReturnValue(T0 + 60_000);
    let { session } = await (await postSession(req({ action: 'pause' }))).json();
    expect(session.pausedAt).toBe(T0 + 60_000);

    nowSpy.mockReturnValue(T0 + 120_000);
    ({ session } = await (await postSession(req({ action: 'resume' }))).json());
    expect(session.pausedAt).toBeUndefined();
    expect(session.stepStartedAt).toBe(T0 + 60_000);

    ({ session } = await (await postSession(req({ action: 'skip' }))).json());
    expect(session.stepIndex).toBe(1);

    // Step 2 (120s, waitForTap) elapses; GET holds it awaiting the tap.
    nowSpy.mockReturnValue(T0 + 500_000);
    ({ session } = await (await getSession(req())).json());
    expect(session.awaitingTap).toBe(true);

    ({ session } = await (await postSession(req({ action: 'step-done' }))).json());
    expect(session.status).toBe('done');
  });

  it('add-minute grows the step rather than sliding its start', async () => {
    await postSession(req({ action: 'start', kind: 'quick', durationSec: 60, targets: 'all' }));
    const { session } = await (await postSession(req({ action: 'add-minute' }))).json();
    // The anchor stays put and the step becomes two minutes, which is what
    // lets a dial drawn against the step's own length redraw at the new one.
    expect(session.stepStartedAt).toBe(T0);
    expect(session.steps[0].durationSec).toBe(120);
  });

  it('subtract-minute takes a minute back off the step', async () => {
    await postSession(req({ action: 'start', kind: 'quick', durationSec: 300, targets: 'all' }));
    const { session } = await (await postSession(req({ action: 'subtract-minute' }))).json();
    expect(session.stepStartedAt).toBe(T0);
    expect(session.steps[0].durationSec).toBe(240);
  });

  it('subtract-minute under two minutes left changes nothing, so a late press cannot run the timer down', async () => {
    const { session: started } = await (await postSession(
      req({ action: 'start', kind: 'quick', durationSec: 300, targets: 'all' }),
    )).json();
    // The wall offered the button at 2:00.2; the press reaches the hub at 1:59.
    nowSpy.mockReturnValue(T0 + 300_000 - 119_000);
    const res = await postSession(req({ action: 'subtract-minute', sessionId: started.id }));
    expect(res.status).toBe(200);
    const { session } = await res.json();
    expect(session.status).toBe('running');
    expect(session.steps[0].durationSec).toBe(300);

    // At 2:00 on the clock it still takes the minute, leaving 1:00.
    nowSpy.mockReturnValue(T0 + 300_000 - 119_500);
    const taken = (await (await postSession(req({ action: 'subtract-minute', sessionId: started.id }))).json()).session;
    expect(taken.steps[0].durationSec).toBe(240);
  });

  it('toggle-sound turns the chimes off and back on', async () => {
    await postSession(req({ action: 'start', kind: 'quick', durationSec: 300, targets: 'all', sound: true }));
    let { session } = await (await postSession(req({ action: 'toggle-sound' }))).json();
    expect(session.sound).toBe(false);
    ({ session } = await (await postSession(req({ action: 'toggle-sound' }))).json());
    expect(session.sound).toBe(true);
  });

  it('carries a quick timer\'s "stay in the box" choice onto the session, and omits it otherwise', async () => {
    let { session } = await (await postSession(
      req({ action: 'start', kind: 'quick', durationSec: 300, targets: 'all', fullScreen: false }),
    )).json();
    expect(session.fullScreen).toBe(false);

    ({ session } = await (await postSession(
      req({ action: 'start', kind: 'quick', durationSec: 300, targets: 'all' }),
    )).json());
    // Absent, not true: a session from before the setting reads the same.
    expect(session.fullScreen).toBeUndefined();
  });

  it('cancel ends the session and a later GET expires it', async () => {
    await postSession(req({ action: 'start', kind: 'quick', durationSec: 300, targets: 'all' }));
    const { session } = await (await postSession(req({ action: 'cancel' }))).json();
    expect(session.status).toBe('cancelled');

    nowSpy.mockReturnValue(T0 + 60_000);
    expect(await (await getSession(req())).json()).toEqual({ session: null });
  });

  it('Stop ends a finished timer\'s "Time\'s up!" everywhere, but nothing else acts on it', async () => {
    await postSession(req({ action: 'start', kind: 'quick', durationSec: 60, targets: 'all' }));
    nowSpy.mockReturnValue(T0 + 5 * 60_000);
    expect((await (await getSession(req())).json()).session.status).toBe('done');
    expect((await postSession(req({ action: 'pause' }))).status).toBe(404);

    const { session } = await (await postSession(req({ action: 'cancel' }))).json();
    expect(session.status).toBe('cancelled');
    nowSpy.mockReturnValue(T0 + 6 * 60_000);
    expect(await (await getSession(req())).json()).toEqual({ session: null });
  });

  it('refuses a press made looking at a timer that has since been replaced, and leaves the new one alone', async () => {
    const first = (await (await postSession(req({ action: 'start', kind: 'quick', durationSec: 300, targets: ['kitchen'] }))).json()).session;
    const second = (await (await postSession(req({ action: 'start', kind: 'quick', durationSec: 600, targets: ['kids'] }))).json()).session;

    for (const action of ['cancel', 'pause', 'add-minute']) {
      const res = await postSession(req({ action, sessionId: first.id }));
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe('timers.notRunning');
    }
    const { session: untouched } = await (await getSession(req())).json();
    expect(untouched).toMatchObject({ id: second.id, status: 'running', stepStartedAt: second.stepStartedAt });
    expect(untouched.pausedAt).toBeUndefined();

    const res = await postSession(req({ action: 'pause', sessionId: second.id }));
    expect(res.status).toBe(200);
  });

  it('counts two "Done!" taps on the same step once', async () => {
    const three: Routine = { ...routine, steps: [
      { id: 's1', label: 'Make your bed', icon: '🛏️', durationSec: 5, waitForTap: true },
      { id: 's2', label: 'Get dressed', icon: '👕', durationSec: 300 },
      { id: 's3', label: 'Brush teeth', icon: '🪥', durationSec: 120 },
    ] };
    await saveRoutines([three]);
    const { session } = await (await postSession(req({ action: 'start', kind: 'routine', routineId: 'morning', targets: 'all' }))).json();
    nowSpy.mockReturnValue(T0 + 10_000);

    const tap = { action: 'step-done', sessionId: session.id, stepIndex: 0 };
    expect((await postSession(req(tap))).status).toBe(200);
    expect((await postSession(req(tap))).status).toBe(404);
    expect((await (await getSession(req())).json()).session.stepIndex).toBe(1);
  });

  it('still takes a press that names no timer', async () => {
    await postSession(req({ action: 'start', kind: 'quick', durationSec: 300, targets: 'all' }));
    expect((await postSession(req({ action: 'pause' }))).status).toBe(200);
  });

  it('starting a new session replaces the running one', async () => {
    await postSession(req({ action: 'start', kind: 'quick', durationSec: 300, targets: 'all' }));
    const res = await postSession(
      req({ action: 'start', kind: 'quick', durationSec: 120, targets: 'all' }),
    );
    const { session } = await res.json();
    expect(session.steps[0].durationSec).toBe(120);
    const { session: current } = await (await getSession(req())).json();
    expect(current.id).toBe(session.id);
  });
});
