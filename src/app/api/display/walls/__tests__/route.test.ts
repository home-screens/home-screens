import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  isAuthEnabled: vi.fn(async () => true),
}));

import { GET } from '../route';
import { requireSession } from '@/lib/auth';
import type { WallAdmission } from '@/lib/display-admission';
import { __resetWallsForTests, createWall } from '@/lib/display-walls';
import { wallsLetInByThemselves, type WallsApiResponse } from '@/lib/walls-api-types';

/**
 * What the editor is told about each wall. The flag a grown-up sees ("Let in
 * by itself") and the count under "Make a new key" both come from here, so
 * this is where the changeover is told apart from every other way in.
 */

const origCwd = process.cwd();
let tmpCwd: string;

beforeEach(async () => {
  tmpCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-walls-route-'));
  await fs.mkdir(path.join(tmpCwd, 'data'), { recursive: true });
  process.chdir(tmpCwd);
  __resetWallsForTests();
  vi.mocked(requireSession).mockImplementation(async () => {});
});

afterEach(async () => {
  process.chdir(origCwd);
  await fs.rm(tmpCwd, { recursive: true, force: true });
});

async function letIn(admittedBy: WallAdmission, address: string) {
  const made = await createWall({ status: 'in', admittedBy, displayId: 'kitchen', address, userAgent: 'Chromium on a Pi', passwordSet: true });
  return made!.entry.id;
}

async function readList(): Promise<WallsApiResponse> {
  const res = await GET(new NextRequest('http://localhost/api/display/walls'));
  expect(res.status).toBe(200);
  return res.json();
}

describe('GET /api/display/walls', () => {
  it('flags only the walls the changeover let in by themselves', async () => {
    const byWindow = [await letIn('window', '192.168.1.60'), await letIn('window', '192.168.1.61')];
    // Every other way in, including the ones that needed no click.
    for (const [i, via] of (['old-key', 'hub-screen', 'allowed-network', 'let-in', 'added', 'kept'] as const).entries()) {
      await letIn(via, `192.168.1.${70 + i}`);
    }
    await createWall({ status: 'waiting', displayId: 'kitchen', address: '192.168.1.90', userAgent: 'Firefox', passwordSet: true });

    const { walls } = await readList();
    expect(walls).toHaveLength(9);
    expect(walls.filter((w) => w.letInByItself).map((w) => w.id).sort()).toEqual([...byWindow].sort());
    expect(wallsLetInByThemselves(walls)).toHaveLength(2);
  });

  it('is for a signed-in grown-up only', async () => {
    await letIn('window', '192.168.1.60');
    vi.mocked(requireSession).mockImplementation(async () => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });

    const res = await GET(new NextRequest('http://localhost/api/display/walls'));
    expect(res.status).toBe(401);
  });
});
