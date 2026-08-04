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

import { PUT as putRoutines } from '@/app/api/timers/routines/route';
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
  const res = await putRoutines(req({ routines }));
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

  it('add-minute extends the current step', async () => {
    await postSession(req({ action: 'start', kind: 'quick', durationSec: 60, targets: 'all' }));
    const { session } = await (await postSession(req({ action: 'add-minute' }))).json();
    expect(session.stepStartedAt).toBe(T0 + 60_000);
  });

  it('cancel ends the session and a later GET expires it', async () => {
    await postSession(req({ action: 'start', kind: 'quick', durationSec: 300, targets: 'all' }));
    const { session } = await (await postSession(req({ action: 'cancel' }))).json();
    expect(session.status).toBe('cancelled');

    nowSpy.mockReturnValue(T0 + 60_000);
    expect(await (await getSession(req())).json()).toEqual({ session: null });
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
