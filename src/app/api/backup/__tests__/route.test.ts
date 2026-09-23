import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';

// Auth is the only dependency we stub — every other lib runs for real against
// the per-worker sandbox `data/` (see vitest.setup.ts), so the export→restore
// path is exercised end to end through the real json-store atomic writes.
// importActual so readAuthState/writeAuthStateRaw stay real — the credential
// restore path writes data/auth.json through them, in the sandbox.
vi.mock('@/lib/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/auth')>()),
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET, POST } from '@/app/api/backup/route';
import { POST as POST_CREDENTIALS } from '@/app/api/backup/credentials/route';
import { readConfig, writeConfig } from '@/lib/config';
import { readFamilyData, writeFamilyData } from '@/lib/family-data';
import { writeChoreData } from '@/lib/chore-data';
import { readBackupState, writeBackupState } from '@/lib/backup-state';
import { readAuthState, writeAuthStateRaw, isAuthEnabled } from '@/lib/auth';
import { readSecrets, writeSecrets } from '@/lib/secrets';
import { readTimetables, replaceTimetables } from '@/lib/timetable-data';
import { encryptCredentials } from '@/lib/backup-crypto';
import { getLatestSchemaVersion } from '@/lib/migrations';
import type { ScreenConfiguration } from '@/types/config';
import type { ChoreData } from '@/lib/chore-data';
import { withDataTransaction } from '@/lib/data-transaction';
import { INVALID_CONFIGS } from '@/lib/__tests__/invalid-config-matrix';

const cleanConfig = {
  version: getLatestSchemaVersion(),
  screens: [{ id: 'default', name: 'Screen 1', modules: [] }],
  settings: { rotationIntervalMs: 30000, displayWidth: 1080, displayHeight: 1920 },
} as unknown as ScreenConfiguration;

const emptyChores: ChoreData = { chores: [] };

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
  await writeFamilyData({ members: [], migrated: true });
  await writeBackupState({ lastBackupDate: null, lastDismissedDate: null });
  await writeSecrets({});
  // The timetables store has no "write empty" that means "never saved": the
  // file existing at all is what makes the export carry a timetables section,
  // so the reset has to remove it.
  await fs.rm(path.join(process.cwd(), 'data', 'timetables.json'), { force: true });
  await writeAuthStateRaw({ passwordHash: null, salt: null, cookieSecret: null });
});

describe('POST /api/backup with malformed to-do lists', () => {
  it('refuses the bundle before writing anything', async () => {
    const res = await POST(postReq({ _type: 'home-screens-backup', _version: 2, todos: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/lists array/);
    // The store still serves reads afterwards.
    const { readTodoData } = await import('@/lib/todo-data');
    expect((await readTodoData()).lists).toEqual([]);
  });
});

describe('POST /api/backup with malformed timetables', () => {
  it('refuses the bundle before writing anything', async () => {
    const res = await POST(postReq({ _type: 'home-screens-backup', _version: 2, timetables: { schools: [], subjects: [], timetables: [{ schoolId: 'school' }] } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/person it belongs to/);
    // The store still serves reads afterwards.
    const { readTimetables } = await import('@/lib/timetable-data');
    expect((await readTimetables()).data.timetables).toEqual([]);
  });
});

describe('GET /api/backup', () => {
  it('exports a bundle with the envelope and every data section', async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const bundle = await res.json();

    expect(bundle._type).toBe('home-screens-backup');
    expect(bundle._version).toBe(2);
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
        'routines',
        'todos',
        'family',
      ].sort(),
    );
    // A household that has never saved a timetable exports no timetables
    // section at all. The starting subjects a read hands out are named in that
    // household's own language, so exporting them would carry one household's
    // language into another household's restore.
    expect(bundle.timetables).toBeUndefined();
    // Nothing in the serialized bundle looks like a bearer/api key value.
    expect(JSON.stringify(bundle)).not.toMatch(/api[_-]?key/i);
  });

  it('exports the timetables section once a household has saved one', async () => {
    const stamp = '2026-01-01T00:00:00.000Z';
    await writeFamilyData({ members: [{ id: 'kid', name: 'Robin', color: '#60a5fa', createdAt: stamp, updatedAt: stamp }], migrated: true });
    const { revision } = await readTimetables();
    await replaceTimetables({
      data: {
        schools: [{ id: 's1', name: 'Lindenweg', slots: [{ kind: 'period', n: 1, start: '08:15', end: '09:00' }], weekCycle: { mode: 'off' }, specialDays: [] }],
        subjects: [{ id: 'ma', code: 'Ma', name: 'Maths', color: '#4f8ef7', icon: 'triangle' }],
        timetables: [{ memberId: 'kid', schoolId: 's1', weeks: { A: { mon: { 1: { subjectId: 'ma' } } } } }],
      },
      revision,
    });

    const bundle = await (await GET(getReq())).json();
    expect(bundle.timetables.timetables).toHaveLength(1);
    expect(bundle.timetables.timetables[0].memberId).toBe('kid');
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
      chores: [{ id: 'c1', name: 'Dishes', assigneeIds: ['m1'] }],
    } as unknown as ChoreData;

    await writeConfig(seededConfig);
    await writeChoreData(seededChores);

    const bundle = await (await GET(getReq())).json();

    // Wipe both stores.
    await writeConfig(cleanConfig);
    await writeChoreData(emptyChores);
  await writeFamilyData({ members: [], migrated: true });
    expect((await readConfig()).screens[0].id).toBe('default');
    expect((await readFamilyData()).members).toHaveLength(0);

    // Restore from the exported bundle.
    const res = await POST(postReq(bundle));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.restored).toEqual({
      config: true,
      family: true,
      todos: true,
      chores: true,
      choreCompletions: true,
      meals: true,
      rewards: true,
      routines: true,
      timetables: false,
      customIcons: false,
    });
    expect(json.missingIcons).toBe(0);

    expect((await readConfig()).screens[0].id).toBe('roundtrip-screen');
    const restoredChores = await readFamilyData();
    expect(restoredChores.members).toHaveLength(1);
    expect(restoredChores.members[0].id).toBe('m1');
  });

  it('only restores the sections present in a partial bundle', async () => {
    await writeChoreData({ members: [{ id: 'keep', name: 'Keep' }], chores: [] } as unknown as ChoreData);

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
    expect(json.restored.timetables).toBe(false);

    // Chores were not in the bundle, so they must be untouched.
    expect((await readFamilyData()).members[0].id).toBe('keep');
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

  for (const { name, config, error } of INVALID_CONFIGS) {
    it(`refuses a bundle carrying ${name}, exactly as the editor save does`, async () => {
      const res = await POST(postReq({ _type: 'home-screens-backup', config }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(error);
      expect((await readConfig()).screens[0].id).toBe('default');
    });
  }

  it('does not hold the data lock while the bundle is still uploading', async () => {
    let release!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        release = () => {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ _type: 'home-screens-backup', config: cleanConfig })));
          controller.close();
        };
      },
    });
    const request = new NextRequest('http://localhost/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      ...({ duplex: 'half' } as object),
    });
    const post = POST(request);

    // Let the route run up to its body read before contending for the lock.
    await new Promise((resolve) => setTimeout(resolve, 20));
    let unrelated = 'blocked';
    const read = withDataTransaction(async () => { unrelated = 'done'; });
    await Promise.race([read, new Promise((resolve) => setTimeout(resolve, 500))]);
    expect(unrelated).toBe('done');

    release();
    expect((await post).status).toBe(200);
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
    // Build a syntactically valid but oversized (>100 MB) JSON body. The size
    // cap must trip before the body is parsed or any write is attempted.
    const oversized =
      '{"_type":"home-screens-backup","junk":"' +
      'x'.repeat(101 * 1024 * 1024) +
      '"}';

    const res = await POST(postReq(oversized));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/too large/i);

    // Nothing may have been written — the seeded clean config is intact.
    expect((await readConfig()).screens[0].id).toBe('default');
  });
});

describe('POST /api/backup — credential section', () => {
  const PASSWORD = 'a good long password';

  function bundleWith(credentials: unknown, extra: Record<string, unknown> = {}) {
    return { _type: 'home-screens-backup', config: cleanConfig, credentials, ...extra };
  }

  it('ignores a v1 bundle with no credentials field', async () => {
    await writeSecrets({ openweathermap_key: 'untouched' });
    const res = await POST(postReq({ _type: 'home-screens-backup', config: cleanConfig }));
    expect(res.status).toBe(200);
    expect((await res.json()).credentials).toBeUndefined();
    expect(await readSecrets()).toEqual({ openweathermap_key: 'untouched' });
  });

  it('applies a plaintext credential section', async () => {
    const res = await POST(
      postReq(bundleWith({ encrypted: false, data: { secrets: { openweathermap_key: 'from-backup' } } })),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).credentials.applied).toEqual(['secrets']);
    expect(await readSecrets()).toEqual({ openweathermap_key: 'from-backup' });
  });

  it('asks for a password when the section is locked, writing nothing', async () => {
    const envelope = await encryptCredentials({ secrets: { openweathermap_key: 'locked' } }, PASSWORD);
    const res = await POST(postReq(bundleWith(envelope)));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('passphrase_required');
    // A generic consumer prints `error`, so it must be a sentence.
    expect(body.error).toMatch(/ /);
    // A missing password must cost nothing — not even the config write.
    expect(await readSecrets()).toEqual({});
    expect((await readConfig()).screens[0].id).toBe('default');
  });

  it('rejects the wrong password without writing anything', async () => {
    const envelope = await encryptCredentials({ secrets: { openweathermap_key: 'locked' } }, PASSWORD);
    const res = await POST(postReq(bundleWith(envelope, { _passphrase: 'wrong password here' })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('bad_passphrase');
    // A generic consumer prints `error`, so it must be a sentence.
    expect(body.error).toMatch(/ /);
    expect(await readSecrets()).toEqual({});
  });

  it('applies an encrypted section given the right password', async () => {
    const envelope = await encryptCredentials(
      { secrets: { openweathermap_key: 'unlocked' }, auth: { passwordHash: 'h', salt: 's', cookieSecret: 'c' } },
      PASSWORD,
    );
    const res = await POST(postReq(bundleWith(envelope, { _passphrase: PASSWORD })));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.credentials.applied.sort()).toEqual(['auth', 'secrets']);
    expect(await readSecrets()).toEqual({ openweathermap_key: 'unlocked' });
    expect((await readAuthState()).passwordHash).toBe('h');
  });

  it('rejects a credentials field that is not a recognizable envelope', async () => {
    const res = await POST(postReq(bundleWith({ secrets: { openweathermap_key: 'raw' } })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('invalid_credentials');
    // A generic consumer prints `error`, so it must be a sentence.
    expect(body.error).toMatch(/ /);
    expect(await readSecrets()).toEqual({});
  });

  it('reports a damaged locked section rather than a wrong password', async () => {
    const envelope = await encryptCredentials({ secrets: {} }, PASSWORD);
    const damaged = { ...envelope, kdfParams: { ...envelope.kdfParams, N: 1000 } };
    const res = await POST(postReq(bundleWith(damaged, { _passphrase: PASSWORD })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('invalid_credentials');
    // A generic consumer prints `error`, so it must be a sentence.
    expect(body.error).toMatch(/ /);
  });

  // The client's fallback when the user cannot supply the password: re-post
  // the same bundle without the credential section.
  it('restores everything else when the credential section is dropped', async () => {
    const res = await POST(
      postReq({
        _type: 'home-screens-backup',
        config: { ...cleanConfig, screens: [{ id: 'from-backup', name: 'S', modules: [] }] },
      }),
    );
    expect(res.status).toBe(200);
    expect((await readConfig()).screens[0].id).toBe('from-backup');
  });

  it('holds back IP restrictions that would lock this device out', async () => {
    const res = await POST(
      postReq(
        bundleWith({
          encrypted: false,
          data: {
            auth: {
              passwordHash: 'h',
              salt: 's',
              cookieSecret: 'c',
              ipAllowlist: ['10.0.0.0/24'],
              ipRestrictAccess: true,
            },
          },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.credentials.applied).toContain('auth');
    expect(json.credentials.skipped).toContain('auth.ipRestrictAccess');

    const state = await readAuthState();
    expect(state.ipRestrictAccess).toBe(false);
    expect(state.ipAllowlist).toEqual(['10.0.0.0/24']);
  });

  it('round-trips a real export through GET then POST', async () => {
    // The credentials route refuses to run without an editor password — that
    // is the whole point of its gate — so give this device one.
    await writeAuthStateRaw({ passwordHash: 'h', salt: 's', cookieSecret: 'c' });
    vi.mocked(isAuthEnabled).mockResolvedValue(true);
    await writeSecrets({ openweathermap_key: 'round-trip' });
    const bundle = await (await GET(getReq())).json();
    const credRes = await POST_CREDENTIALS(
      new NextRequest('http://localhost/api/backup/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: PASSWORD }),
      }),
    );
    bundle.credentials = await credRes.json();

    await writeSecrets({});
  // The timetables store has no "write empty" that means "never saved": the
  // file existing at all is what makes the export carry a timetables section,
  // so the reset has to remove it.
  await fs.rm(path.join(process.cwd(), 'data', 'timetables.json'), { force: true });
    const res = await POST(postReq({ ...bundle, _passphrase: PASSWORD }));
    expect(res.status).toBe(200);
    expect(await readSecrets()).toEqual({ openweathermap_key: 'round-trip' });
  });
});
