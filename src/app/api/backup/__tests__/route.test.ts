import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Auth is the only dependency we stub — every other lib runs for real against
// the per-worker sandbox `data/` (see vitest.setup.ts), so the export→restore
// path is exercised end to end through the real json-store atomic writes.
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET, POST } from '@/app/api/backup/route';
import { readConfig, writeConfig } from '@/lib/config';
import { readChoreData, writeChoreData } from '@/lib/chore-data';
import { readBackupState, writeBackupState } from '@/lib/backup-state';
import { getLatestSchemaVersion } from '@/lib/migrations';
import type { ScreenConfiguration } from '@/types/config';
import type { ChoreData } from '@/lib/chore-data';

const cleanConfig = {
  version: getLatestSchemaVersion(),
  screens: [{ id: 'default', name: 'Screen 1', modules: [] }],
  settings: { rotationIntervalMs: 30000, displayWidth: 1080, displayHeight: 1920 },
} as unknown as ScreenConfiguration;

const emptyChores: ChoreData = { members: [], chores: [] };

function getReq(): NextRequest {
  return new NextRequest('http://localhost/api/backup');
}

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset the stores this suite mutates back to a known clean state so tests
  // don't leak into one another (the sandbox data/ is shared across a file).
  await writeConfig(cleanConfig);
  await writeChoreData(emptyChores);
  await writeBackupState({ lastBackupDate: null, lastDismissedDate: null });
});

describe('GET /api/backup', () => {
  it('exports a bundle with the envelope and every data section', async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const bundle = await res.json();

    expect(bundle._type).toBe('home-screens-backup');
    expect(bundle._version).toBe(1);
    expect(typeof bundle._createdAt).toBe('string');
    expect(Number.isNaN(Date.parse(bundle._createdAt))).toBe(false);

    // All five data sections are present.
    expect(bundle.config).toBeDefined();
    expect(bundle.chores).toBeDefined();
    expect(bundle.choreCompletions).toBeDefined();
    expect(bundle.meals).toBeDefined();
    expect(bundle.rewards).toBeDefined();
  });

  it('reflects the current on-disk config in the exported bundle', async () => {
    await writeConfig({
      ...cleanConfig,
      screens: [{ id: 'marker-screen', name: 'Marker', modules: [] }],
    } as unknown as ScreenConfiguration);

    const bundle = await (await GET(getReq())).json();
    expect(bundle.config.screens[0].id).toBe('marker-screen');
  });

  it('does not export raw secrets — no secrets section on the bundle', async () => {
    const bundle = await (await GET(getReq())).json();

    // The bundle deliberately omits data/secrets.json. Guard against a future
    // change that starts inlining API keys into the export.
    expect(bundle.secrets).toBeUndefined();
    expect(Object.keys(bundle).sort()).toEqual(
      [
        '_type',
        '_version',
        '_createdAt',
        'config',
        'chores',
        'choreCompletions',
        'meals',
        'rewards',
      ].sort(),
    );
    // Nothing in the serialized bundle looks like a bearer/api key value.
    expect(JSON.stringify(bundle)).not.toMatch(/api[_-]?key/i);
  });

  it('records the backup timestamp and clears any prior dismissal', async () => {
    await writeBackupState({ lastBackupDate: null, lastDismissedDate: '2020-01-01T00:00:00.000Z' });

    await GET(getReq());

    // The handler fires writeBackupState fire-and-forget, so poll for it.
    await vi.waitFor(async () => {
      const state = await readBackupState();
      expect(state.lastBackupDate).not.toBeNull();
      expect(state.lastDismissedDate).toBeNull();
    });
  });
});

describe('POST /api/backup — restore', () => {
  it('round-trips a bundle: export, wipe, restore recovers the data', async () => {
    const seededConfig = {
      ...cleanConfig,
      screens: [{ id: 'roundtrip-screen', name: 'RT', modules: [] }],
    } as unknown as ScreenConfiguration;
    const seededChores = {
      members: [{ id: 'm1', name: 'Alex' }],
      chores: [{ id: 'c1', name: 'Dishes' }],
    } as unknown as ChoreData;

    await writeConfig(seededConfig);
    await writeChoreData(seededChores);

    const bundle = await (await GET(getReq())).json();

    // Wipe both stores.
    await writeConfig(cleanConfig);
    await writeChoreData(emptyChores);
    expect((await readConfig()).screens[0].id).toBe('default');
    expect((await readChoreData()).members).toHaveLength(0);

    // Restore from the exported bundle.
    const res = await POST(postReq(bundle));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.restored).toEqual({
      config: true,
      chores: true,
      choreCompletions: true,
      meals: true,
      rewards: true,
    });

    expect((await readConfig()).screens[0].id).toBe('roundtrip-screen');
    const restoredChores = await readChoreData();
    expect(restoredChores.members).toHaveLength(1);
    expect(restoredChores.members[0].id).toBe('m1');
  });

  it('only restores the sections present in a partial bundle', async () => {
    await writeChoreData({ members: [{ id: 'keep' }], chores: [] } as unknown as ChoreData);

    const res = await POST(
      postReq({
        _type: 'home-screens-backup',
        config: cleanConfig,
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.restored.config).toBe(true);
    expect(json.restored.chores).toBe(false);

    // Chores were not in the bundle, so they must be untouched.
    expect((await readChoreData()).members[0].id).toBe('keep');
  });

  it('restores a legacy config-only file (no envelope)', async () => {
    const legacy = {
      ...cleanConfig,
      screens: [{ id: 'legacy-screen', name: 'Legacy', modules: [] }],
    } as unknown as ScreenConfiguration;

    const res = await POST(postReq(legacy));
    expect(res.status).toBe(200);
    expect((await res.json()).restored).toEqual({ config: true });
    expect((await readConfig()).screens[0].id).toBe('legacy-screen');
  });

  it('rejects a malformed bundle whose config is missing screens', async () => {
    const res = await POST(
      postReq({
        _type: 'home-screens-backup',
        config: { settings: {} },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/screens/);
    // The bad config must not have been written.
    expect((await readConfig()).screens[0].id).toBe('default');
  });

  it('rejects a bundle whose config is missing settings', async () => {
    const res = await POST(
      postReq({
        _type: 'home-screens-backup',
        config: { screens: [] },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/settings/);
  });

  it('rejects a tampered bundle with duplicate display ids', async () => {
    const res = await POST(
      postReq({
        _type: 'home-screens-backup',
        config: {
          ...cleanConfig,
          displays: [
            { id: 'kitchen', screens: [], displayWidth: 1080, displayHeight: 1920 },
            { id: 'kitchen', screens: [], displayWidth: 1080, displayHeight: 1920 },
          ],
        },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Duplicate display id/);
  });

  it('rejects a tampered bundle with a non-URL-safe display id', async () => {
    const res = await POST(
      postReq({
        _type: 'home-screens-backup',
        config: {
          ...cleanConfig,
          displays: [
            { id: 'Kitchen TV!', screens: [], displayWidth: 1080, displayHeight: 1920 },
          ],
        },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid display id/);
  });

  it('rejects an unrecognized backup format', async () => {
    const res = await POST(postReq({ some: 'garbage' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unrecognized backup format/);
  });

  it('rejects a malformed JSON body', async () => {
    const res = await POST(postReq('not json at all'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid JSON/);
  });

  it('rejects an oversized body with 413 and writes nothing to disk', async () => {
    // Build a syntactically valid but oversized (>25 MB) JSON body. The size
    // cap must trip before the body is parsed or any write is attempted.
    const oversized =
      '{"_type":"home-screens-backup","junk":"' +
      'x'.repeat(26 * 1024 * 1024) +
      '"}';

    const res = await POST(postReq(oversized));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/too large/i);

    // Nothing may have been written — the seeded clean config is intact.
    expect((await readConfig()).screens[0].id).toBe('default');
  });
});
