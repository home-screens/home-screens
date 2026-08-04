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

describe('/api/timers/routines', () => {
  it('GET returns an empty list initially', async () => {
    const res = await getRoutines(req());
    expect(await res.json()).toEqual({ routines: [] });
  });

  it('PUT persists a valid list and GET returns it', async () => {
    await saveRoutines([routine]);
    const res = await getRoutines(req());
    const json = await res.json();
    expect(json.routines).toHaveLength(1);
    expect(json.routines[0].name).toBe('Morning routine');
  });

  it('PUT rejects an invalid list without writing', async () => {
    await saveRoutines([routine]);
    const res = await putRoutines(req({ routines: [{ ...routine, steps: [] }] }));
    expect(res.status).toBe(400);
    const after = await (await getRoutines(req())).json();
    expect(after.routines).toHaveLength(1);
  });

  it('PUT accepts an empty list (deleting the last routine)', async () => {
    await saveRoutines([routine]);
    await saveRoutines([]);
    expect(await (await getRoutines(req())).json()).toEqual({ routines: [] });
  });
});

