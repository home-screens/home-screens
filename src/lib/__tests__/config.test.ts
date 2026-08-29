import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fsModule from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { readConfig, writeConfig, updateConfigAtomic } from '../config';
import { getLatestSchemaVersion } from '../migrations';
import { createWeatherProvider } from '../weather';

// Override process.cwd to use a temp directory for tests
let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('readConfig', () => {
  it('returns default config when file does not exist', async () => {
    const config = await readConfig();
    // Default tracks the latest schema version so fresh installs don't
    // trigger an unnecessary migrate-on-boot write.
    expect(config.version).toBe(getLatestSchemaVersion());
    expect(config.screens).toHaveLength(1);
    expect(config.screens[0].id).toBe('default');
    expect(config.settings.weather.provider).toBe('open-meteo');
  });

  it('seeds a weather provider that works without an API key', async () => {
    // A fresh install has no secrets.json, so the shipped default must be a
    // keyless provider or the very first thing a new user sees is a weather
    // error. Every keyed provider throws from its constructor when handed no
    // key, so building the seeded default through the real factory is the
    // ratchet: swapping the seed to a keyed provider fails here, not on a Pi.
    const config = await readConfig();
    expect(() => createWeatherProvider(config.settings.weather.provider)).not.toThrow();
  });

  it('reads existing config file', async () => {
    const configDir = path.join(tmpDir, 'data');
    await fs.mkdir(configDir, { recursive: true });
    const custom = {
      // Use the current schema version so readConfig doesn't auto-migrate.
      // (When this is older than the latest, readConfig bumps it transparently.)
      version: getLatestSchemaVersion(),
      settings: { rotationIntervalMs: 5000, weather: {}, calendar: {} },
      screens: [{ id: 'custom', name: 'My Screen', backgroundImage: '', modules: [] }],
    };
    await fs.writeFile(path.join(configDir, 'config.json'), JSON.stringify(custom));

    const config = await readConfig();
    expect(config.version).toBe(getLatestSchemaVersion());
    expect(config.screens[0].id).toBe('custom');
  });

  // Fail-closed regression: see code-review-remediation.md item 1.
  // The previous bare catch returned DEFAULT_CONFIG on any error, which
  // caused read-mutate-write callers (e.g. profile change) to overwrite
  // real config with defaults. readConfig must now THROW on corruption.
  it('throws when the config file contains invalid JSON', async () => {
    const configDir = path.join(tmpDir, 'data');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, 'config.json'), 'this is not json {{{');

    await expect(readConfig()).rejects.toThrow();
  });

  it('does not write fallback defaults when read fails', async () => {
    // Seed corrupt config
    const configDir = path.join(tmpDir, 'data');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, 'config.json'), '{ truncated');

    // Simulate a read-mutate-write caller (like the profile-change route).
    // After the readConfig throws, the caller should NOT proceed to write.
    let didWrite = false;
    try {
      await readConfig();
      // If we reach here the bug is back — caller would clobber the file.
      await writeConfig({} as never);
      didWrite = true;
    } catch {
      // Expected: fail closed.
    }

    expect(didWrite).toBe(false);

    // Verify the corrupt content is still on disk untouched
    const raw = await fs.readFile(path.join(configDir, 'config.json'), 'utf-8');
    expect(raw).toBe('{ truncated');
  });
});

describe('writeConfig', () => {
  it('writes config atomically (via temp file rename)', async () => {
    const config = {
      version: 1,
      settings: {
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        latitude: 0,
        longitude: 0,
        weather: { provider: 'weatherapi' as const, apiKey: '', latitude: 0, longitude: 0, units: 'imperial' as const },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
      },
      screens: [{ id: 'test', name: 'Test', backgroundImage: '', modules: [] }],
    };
    await writeConfig(config);

    const filePath = path.join(tmpDir, 'data', 'config.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.screens[0].id).toBe('test');

    // Verify no leftover .tmp file
    const files = await fs.readdir(path.join(tmpDir, 'data'));
    expect(files).not.toContain('config.json.tmp');
  });

  it('creates data directory if it does not exist', async () => {
    const config = {
      version: 1,
      settings: {
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        latitude: 0,
        longitude: 0,
        weather: { provider: 'weatherapi' as const, apiKey: '', latitude: 0, longitude: 0, units: 'imperial' as const },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
      },
      screens: [],
    };
    await writeConfig(config);

    const stat = await fs.stat(path.join(tmpDir, 'data'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('round-trips: write then read returns same data', async () => {
    const config = {
      // Pin to the current latest schema version so readConfig doesn't apply
      // a migration on the way back out and bump the value past what we wrote.
      version: getLatestSchemaVersion(),
      settings: {
        rotationIntervalMs: 15000,
        displayWidth: 1080,
        displayHeight: 1920,
        latitude: 40.7,
        longitude: -74.0,
        weather: { provider: 'openweathermap' as const, apiKey: 'abc', latitude: 40.7, longitude: -74.0, units: 'metric' as const },
        calendar: { googleCalendarId: 'cal1', googleCalendarIds: ['cal1', 'cal2'], icalSources: [], daysAhead: 14 },
      },
      screens: [
        { id: 's1', name: 'Living Room', backgroundImage: '/bg.jpg', modules: [] },
        { id: 's2', name: 'Kitchen', backgroundImage: '', modules: [] },
      ],
    };
    await writeConfig(config);
    const result = await readConfig();

    expect(result).toEqual(config);
  });
});

// ---------------------------------------------------------------------------
// Helper: build a minimal valid ScreenConfiguration
// ---------------------------------------------------------------------------
function makeConfig(id: string) {
  return {
    version: 1,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 0,
      longitude: 0,
      weather: { provider: 'weatherapi' as const, apiKey: '', latitude: 0, longitude: 0, units: 'imperial' as const },
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
    },
    screens: [{ id, name: id, backgroundImage: '', modules: [] }],
  };
}

// ---------------------------------------------------------------------------
// Write queue behavior
// ---------------------------------------------------------------------------
describe('writeConfig — write queue serialization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('two concurrent writeConfig() calls are serialized (second waits for first)', async () => {
    const order: string[] = [];

    // Use a deferred promise to control when the first writeFile resolves
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const origWriteFile = fsModule.promises.writeFile.bind(fsModule.promises);
    let callCount = 0;

    vi.spyOn(fsModule.promises, 'writeFile').mockImplementation(async (...args: Parameters<typeof fsModule.promises.writeFile>) => {
      callCount++;
      if (callCount === 1) {
        order.push('first-start');
        await firstGate;
        const result = await origWriteFile(...args);
        order.push('first-end');
        return result;
      }
      order.push('second-start');
      const result = await origWriteFile(...args);
      order.push('second-end');
      return result;
    });

    const p1 = writeConfig(makeConfig('first'));
    const p2 = writeConfig(makeConfig('second'));

    // Let the event loop tick — first write should have started, second should not
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toContain('first-start');
    expect(order).not.toContain('second-start');

    // Release the first write
    releaseFirst();
    await p1;
    await p2;

    // The second write must have started only after the first completed
    expect(order.indexOf('first-end')).toBeLessThan(order.indexOf('second-start'));
  });

  it('if first write fails, second write still executes', async () => {
    const origWriteFile = fsModule.promises.writeFile.bind(fsModule.promises);
    let callCount = 0;

    vi.spyOn(fsModule.promises, 'writeFile').mockImplementation(async (...args: Parameters<typeof fsModule.promises.writeFile>) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Simulated disk failure');
      }
      return origWriteFile(...args);
    });

    const p1 = writeConfig(makeConfig('first'));
    const p2 = writeConfig(makeConfig('second'));

    await expect(p1).rejects.toThrow('Simulated disk failure');
    await expect(p2).resolves.toBeUndefined();

    // The second write should have persisted successfully
    const filePath = path.join(tmpDir, 'data', 'config.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.screens[0].id).toBe('second');
  });

  it('write queue does not lose writes under rapid successive calls', async () => {
    const configs = Array.from({ length: 10 }, (_, i) => makeConfig(`rapid-${i}`));
    const promises = configs.map((c) => writeConfig(c));
    await Promise.all(promises);

    // The last write wins on disk
    const filePath = path.join(tmpDir, 'data', 'config.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.screens[0].id).toBe('rapid-9');

    // No leftover .tmp files
    const files = await fs.readdir(path.join(tmpDir, 'data'));
    expect(files).not.toContain('config.json.tmp');
  });
});

// ---------------------------------------------------------------------------
// Migration race conditions
// ---------------------------------------------------------------------------
describe('readConfig — migration race conditions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('multiple concurrent readConfig() calls during migration trigger at most one write', async () => {
    // Seed a config with version 0 so migration will fire
    const configDir = path.join(tmpDir, 'data');
    await fs.mkdir(configDir, { recursive: true });
    const outdated = {
      version: 0,
      settings: { rotationIntervalMs: 5000, weather: {}, calendar: {} },
      screens: [{ id: 'old', name: 'Old', backgroundImage: '', modules: [] }],
    };
    await fs.writeFile(path.join(configDir, 'config.json'), JSON.stringify(outdated));

    // Track how many times writeFile is called (one call per writeConfig invocation)
    const origWriteFile = fsModule.promises.writeFile.bind(fsModule.promises);
    let writeFileCount = 0;
    vi.spyOn(fsModule.promises, 'writeFile').mockImplementation(async (...args: Parameters<typeof fsModule.promises.writeFile>) => {
      writeFileCount++;
      return origWriteFile(...args);
    });

    // Fire several concurrent reads — all should see the outdated config and want to migrate
    const results = await Promise.all([readConfig(), readConfig(), readConfig()]);

    // All reads should return a valid migrated config (version >= 1)
    for (const cfg of results) {
      expect(cfg.version).toBeGreaterThanOrEqual(1);
      expect(cfg.screens[0].id).toBe('old');
    }

    // The migration guard should have limited the fire-and-forget writes to at most one
    // Give the fire-and-forget write time to complete
    await new Promise((r) => setTimeout(r, 50));
    expect(writeFileCount).toBeLessThanOrEqual(1);
  });

  it('migrate-on-boot persist cannot clobber a concurrent editor save', async () => {
    // Regression: the old code fired a bare writeConfig(migrated) from a
    // snapshot read OUTSIDE the write queue. If an editor PUT landed between
    // that read and the queued write, the migration write overwrote the
    // editor's save with pre-save data. The persist now goes through
    // updateConfigAtomic, which re-reads inside the queue and no-ops when
    // the on-disk config is already at the latest version.
    const configDir = path.join(tmpDir, 'data');
    await fs.mkdir(configDir, { recursive: true });
    const outdated = {
      version: 0,
      settings: { rotationIntervalMs: 5000, weather: {}, calendar: {} },
      screens: [{ id: 'stale', name: 'Stale', backgroundImage: '', modules: [] }],
    };
    await fs.writeFile(path.join(configDir, 'config.json'), JSON.stringify(outdated));

    // Pause readConfig's (unqueued) file read AFTER it has captured the
    // stale v0 content, so the editor save deterministically lands inside
    // the exact race window.
    const origReadFile = fsModule.promises.readFile.bind(fsModule.promises);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    let firstRead = true;
    vi.spyOn(fsModule.promises, 'readFile').mockImplementation(
      async (...args: Parameters<typeof fsModule.promises.readFile>) => {
        const result = await origReadFile(...args);
        if (firstRead) {
          firstRead = false;
          await gate;
        }
        return result;
      },
    );

    const readPromise = readConfig(); // holding the stale v0 snapshot
    const editorSave = {
      ...outdated,
      version: getLatestSchemaVersion(),
      screens: [{ id: 'editor-save', name: 'Saved', backgroundImage: '', modules: [] }],
    };
    await writeConfig(editorSave as never); // lands while the read is paused
    release();
    const migrated = await readPromise; // enqueues the migration persist
    expect(migrated.version).toBe(getLatestSchemaVersion());

    // Drain the queue behind the migration persist, then confirm the
    // editor's save survived on disk.
    await updateConfigAtomic((c) => c);
    vi.restoreAllMocks();
    const onDisk = JSON.parse(
      await fs.readFile(path.join(configDir, 'config.json'), 'utf-8'),
    );
    expect(onDisk.screens[0].id).toBe('editor-save');
    expect(onDisk.version).toBe(getLatestSchemaVersion());
  });

  it('migration failure does not corrupt the config state', async () => {
    // Seed a config with version 0
    const configDir = path.join(tmpDir, 'data');
    await fs.mkdir(configDir, { recursive: true });
    const outdated = {
      version: 0,
      settings: { rotationIntervalMs: 5000, weather: { provider: 'weatherapi' }, calendar: {} },
      screens: [{ id: 'stable', name: 'Stable', backgroundImage: '', modules: [] }],
    };
    await fs.writeFile(path.join(configDir, 'config.json'), JSON.stringify(outdated));

    // Make the migration write fail
    vi.spyOn(fsModule.promises, 'writeFile').mockImplementationOnce(async () => {
      throw new Error('Disk full');
    });

    const config = await readConfig();

    // Should still return the migrated config (migration succeeded in memory,
    // only the persist-to-disk part failed)
    expect(config.version).toBeGreaterThanOrEqual(1);
    expect(config.screens[0].id).toBe('stable');

    // Restore mocks and verify the original file on disk is untouched
    vi.restoreAllMocks();
    const raw = await fs.readFile(path.join(configDir, 'config.json'), 'utf-8');
    const onDisk = JSON.parse(raw);
    expect(onDisk.version).toBe(0); // Original file preserved
  });
});

// ---------------------------------------------------------------------------
// Atomic write edge cases
// ---------------------------------------------------------------------------
describe('writeConfig — atomic write edge cases', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('if fs.rename() fails, future writes still succeed', async () => {
    // First write succeeds normally to set up the data directory
    await writeConfig(makeConfig('setup'));

    // Now make rename fail once
    vi.spyOn(fsModule.promises, 'rename').mockImplementationOnce(async () => {
      throw new Error('Rename failed: cross-device link');
    });

    const failedWrite = writeConfig(makeConfig('rename-fail'));
    await expect(failedWrite).rejects.toThrow('Rename failed');

    // Restore rename and verify a subsequent write works
    vi.restoreAllMocks();
    await writeConfig(makeConfig('after-rename-fail'));

    const filePath = path.join(tmpDir, 'data', 'config.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.screens[0].id).toBe('after-rename-fail');
  });

  it('partial write failure (writeFile fails) does not leave corrupt config', async () => {
    // Write a known-good config first
    await writeConfig(makeConfig('good'));

    // Make the next writeFile fail mid-write (tmp file should not replace real config)
    vi.spyOn(fsModule.promises, 'writeFile').mockImplementationOnce(async () => {
      throw new Error('Disk write error');
    });

    const failedWrite = writeConfig(makeConfig('bad'));
    await expect(failedWrite).rejects.toThrow('Disk write error');

    // The original config file should be intact
    const filePath = path.join(tmpDir, 'data', 'config.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.screens[0].id).toBe('good');
  });
});

// ---------------------------------------------------------------------------
// Error recovery
// ---------------------------------------------------------------------------
describe('writeConfig / readConfig — error recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writeConfig() after a failed write still works', async () => {
    // Make the first write fail
    vi.spyOn(fsModule.promises, 'mkdir').mockImplementationOnce(async () => {
      throw new Error('Permission denied');
    });

    const p1 = writeConfig(makeConfig('fail'));
    await expect(p1).rejects.toThrow('Permission denied');

    // Restore and try again — the write queue should not be stuck
    vi.restoreAllMocks();
    await writeConfig(makeConfig('recovery'));

    const filePath = path.join(tmpDir, 'data', 'config.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.screens[0].id).toBe('recovery');
  });

  it('readConfig() returns valid config even if last write was partial', async () => {
    // Write a good config
    await writeConfig(makeConfig('baseline'));

    // Simulate a partial write: writeFile succeeds (creates .tmp) but rename fails
    vi.spyOn(fsModule.promises, 'rename').mockImplementationOnce(async () => {
      throw new Error('Rename failed');
    });

    await expect(writeConfig(makeConfig('partial'))).rejects.toThrow('Rename failed');

    // readConfig should still return the last good config
    vi.restoreAllMocks();
    const config = await readConfig();
    expect(config.screens[0].id).toBe('baseline');
  });

  it('three sequential failures followed by a success — queue is not permanently broken', async () => {
    const origWriteFile = fsModule.promises.writeFile.bind(fsModule.promises);
    let callCount = 0;

    vi.spyOn(fsModule.promises, 'writeFile').mockImplementation(async (...args: Parameters<typeof fsModule.promises.writeFile>) => {
      callCount++;
      if (callCount <= 3) {
        throw new Error(`Failure #${callCount}`);
      }
      return origWriteFile(...args);
    });

    const failures = [
      writeConfig(makeConfig('f1')),
      writeConfig(makeConfig('f2')),
      writeConfig(makeConfig('f3')),
    ];
    const success = writeConfig(makeConfig('success'));

    // First three should fail
    for (const p of failures) {
      await expect(p).rejects.toThrow(/Failure/);
    }

    // Fourth should succeed
    await expect(success).resolves.toBeUndefined();

    const filePath = path.join(tmpDir, 'data', 'config.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.screens[0].id).toBe('success');
  });
});


// ---------------------------------------------------------------------------
// updateConfigAtomic — no-op detection
//
// The wrapper short-circuits the disk write when the user mutator returns
// its input unchanged AND migration did not run. This is the path that
// validation-error branches in API routes (e.g. POST /api/display/profile)
// rely on to bail without spurious serialize+fsync work.
// ---------------------------------------------------------------------------
describe('updateConfigAtomic — no-op detection', () => {
  // Steady-state config: latest schema version, so migration doesn't run.
  function makeSteadyStateConfig() {
    return {
      version: getLatestSchemaVersion(),
      settings: {
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        displayTransform: '90' as const,
        latitude: 0,
        longitude: 0,
        weather: { provider: 'weatherapi' as const, latitude: 0, longitude: 0, units: 'imperial' as const },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
      },
      screens: [{ id: 'default', name: 'Default', backgroundImage: '', modules: [] }],
      displays: [
        {
          id: 'main',
          name: 'Main Display',
          screens: [],
          displayWidth: 1080,
          displayHeight: 1920,
          displayTransform: '90' as const,
        },
      ],
    };
  }

  async function writeRaw(config: unknown) {
    const configDir = path.join(tmpDir, 'data');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, 'config.json'), JSON.stringify(config));
  }

  it('skips the disk write when the mutator returns its input unchanged in steady state', async () => {
    await writeRaw(makeSteadyStateConfig());

    // Spy on writeFile after the seed write so we only count writes from
    // updateConfigAtomic itself.
    const writeSpy = vi.spyOn(fs, 'writeFile');

    // Mutator returns its input unchanged — the canonical validation-error
    // signal used by POST /api/display/profile.
    await updateConfigAtomic((config) => config);
    expect(writeSpy).not.toHaveBeenCalled();

    writeSpy.mockRestore();
  });

  it('still writes when the mutator returns a new reference (happy path)', async () => {
    await writeRaw(makeSteadyStateConfig());

    const writeSpy = vi.spyOn(fs, 'writeFile');
    await updateConfigAtomic((config) => ({
      ...config,
      settings: { ...config.settings, rotationIntervalMs: 12345 },
    }));

    // The atomic write goes through the temp-file dance: writeFile(tmp)
    // then rename, so at least one writeFile call is expected.
    expect(writeSpy).toHaveBeenCalled();
    writeSpy.mockRestore();

    // And the change actually landed.
    const after = await readConfig();
    expect(after.settings.rotationIntervalMs).toBe(12345);
  });

  it('writes when migration runs even if the user mutator is a no-op', async () => {
    // Stale schema → migration must fire and persist, regardless of what
    // the user mutator does. This protects the migrate-on-read invariant.
    await writeRaw({
      // version 0 forces migration up to the latest version
      settings: {
        rotationIntervalMs: 30000,
        displayWidth: 1080,
        displayHeight: 1920,
        latitude: 0,
        longitude: 0,
        weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
        calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
      },
      screens: [{ id: 'default', name: 'Default', backgroundImage: '', modules: [] }],
    });

    const writeSpy = vi.spyOn(fs, 'writeFile');
    await updateConfigAtomic((config) => config);
    expect(writeSpy).toHaveBeenCalled();
    writeSpy.mockRestore();
  });

});

describe('write invalidation of the short-TTL read cache', () => {
  it('writeConfig makes the very next readConfigCached observe the save', async () => {
    const { readConfigCached, __resetConfigReadCacheForTests } = await import('../config-cache');
    __resetConfigReadCacheForTests();
    const before = await readConfigCached();
    await writeConfig({
      ...before,
      screens: [{ id: 'added', name: 'Added', backgroundImage: '', modules: [] }],
    });
    // Well inside the 1.5s TTL — without invalidation this would serve the
    // pre-write snapshot and a freshly adopted display's first hw-stats
    // POST would 403.
    const after = await readConfigCached();
    expect(after.screens.map((s) => s.id)).toEqual(['added']);
    __resetConfigReadCacheForTests();
  });

  it('updateConfigAtomic invalidates too', async () => {
    const { readConfigCached, __resetConfigReadCacheForTests } = await import('../config-cache');
    __resetConfigReadCacheForTests();
    await readConfigCached();
    await updateConfigAtomic((current) => ({
      ...current,
      screens: [{ id: 'atomic', name: 'Atomic', backgroundImage: '', modules: [] }],
    }));
    const after = await readConfigCached();
    expect(after.screens.map((s) => s.id)).toEqual(['atomic']);
    __resetConfigReadCacheForTests();
  });
});
