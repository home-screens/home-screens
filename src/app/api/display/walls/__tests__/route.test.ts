import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  isAuthEnabled: vi.fn(async () => true),
  getIpAllowlistConfig: vi.fn(async () => ({ allowlist: [] as string[], bypassAuth: false, restrictAccess: false })),
}));

import { GET } from '../route';
import { getIpAllowlistConfig, requireSession } from '@/lib/auth';
import type { WallAdmission } from '@/lib/display-admission';
import { __resetWallsForTests, createWall, touchWall } from '@/lib/display-walls';
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
  vi.mocked(getIpAllowlistConfig).mockImplementation(async () => ({ allowlist: [], bypassAuth: false, restrictAccess: false }));
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

  it('says which walls Remove cannot keep out: the hub\'s own screen and an allowed network', async () => {
    vi.mocked(getIpAllowlistConfig).mockImplementation(async () => ({ allowlist: ['192.168.1.0/24'], bypassAuth: true, restrictAccess: false }));
    const hub = await letIn('hub-screen', '127.0.0.1');
    const onNetwork = await letIn('let-in', '192.168.1.60');
    const fromWindow = await letIn('window', '192.168.1.61');
    const elsewhere = await letIn('let-in', '10.0.0.5');

    const byId = new Map((await readList()).walls.map((w) => [w.id, w.comesBack]));
    expect(byId.get(hub)).toBe(true);
    expect(byId.get(onNetwork)).toBe(true);
    // However it first came in, it is the address that brings it back.
    expect(byId.get(fromWindow)).toBe(true);
    expect(byId.get(elsewhere)).toBe(false);
  });

  it('counts a screen kept from before the password as the hub\'s own once it is seen as one', async () => {
    // The hub's screen was showing when the first password was set, so it was
    // let in as `no-password`; it comes back from the hub itself all the same.
    const made = (await createWall({ status: 'in', admittedBy: 'no-password', displayId: 'kitchen', address: '127.0.0.1', userAgent: 'Chromium on a Pi', passwordSet: false }))!;
    await touchWall(made.entry, { hubScreen: true });
    const other = await letIn('let-in', '192.168.1.60');

    const byId = new Map((await readList()).walls.map((w) => [w.id, w]));
    expect(byId.get(made.entry.id)).toMatchObject({ hubScreen: true, comesBack: true });
    expect(byId.get(other)).toMatchObject({ hubScreen: false, comesBack: false });
  });

  it('keeps an allowed network\'s walls out once that switch is off', async () => {
    // The networks are listed, but they no longer let displays in without asking.
    vi.mocked(getIpAllowlistConfig).mockImplementation(async () => ({ allowlist: ['192.168.1.0/24'], bypassAuth: false, restrictAccess: true }));
    const hub = await letIn('hub-screen', '127.0.0.1');
    const onNetwork = await letIn('allowed-network', '192.168.1.60');

    const byId = new Map((await readList()).walls.map((w) => [w.id, w.comesBack]));
    expect(byId.get(hub)).toBe(true);
    expect(byId.get(onNetwork)).toBe(false);
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
