import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
// Imported, not read from disk: this file mocks `fs`.
import editorCopy from '@/translations/en-US/editor.json';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock child_process.spawn — returns a fake ChildProcess
const mockSpawn = vi.fn();
const mockWithDataTransaction = vi.fn();
let transactionDepth = 0;
const scriptAccess: { action: string; depth: number }[] = [];
vi.mock('@/lib/data-transaction', () => ({
  durableRemove: async (file: string) => {
    const { promises: fs } = await import('fs');
    await fs.rm(file, { force: true });
  },
  withDataTransaction: (...args: unknown[]) => mockWithDataTransaction(...args),
}));
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => {
    scriptAccess.push({ action: (args[1] as string[])[1], depth: transactionDepth });
    return mockSpawn(...args);
  },
  // readline is NOT mocked — it uses the real createInterface
}));

// Mock config read/write
const mockReadConfig = vi.fn();
const mockWriteConfig = vi.fn();
vi.mock('@/lib/config', () => ({
  readConfig: (...args: unknown[]) => mockReadConfig(...args),
  writeConfig: (...args: unknown[]) => mockWriteConfig(...args),
}));

// Mock migrations
const mockMigrateUp = vi.fn();
const mockGetLatestSchemaVersion = vi.fn();
vi.mock('@/lib/migrations', () => ({
  migrateUp: (...args: unknown[]) => mockMigrateUp(...args),
  getLatestSchemaVersion: (...args: unknown[]) => mockGetLatestSchemaVersion(...args),
}));

// Mock version
const mockHasReleaseTarball = vi.fn();
const mockFetchReleaseByTag = vi.fn();
const mockGetPackageVersion = vi.fn();
vi.mock('@/lib/version', () => ({
  hasReleaseTarball: (...args: unknown[]) => mockHasReleaseTarball(...args),
  fetchReleaseByTag: (...args: unknown[]) => mockFetchReleaseByTag(...args),
  getPackageVersion: (...args: unknown[]) => mockGetPackageVersion(...args),
  GITHUB_REPO: 'home-screens/home-screens',
}));

// Mock the family fold the migrate step settles
const mockSettleFamilyMigration = vi.fn();
vi.mock('@/lib/family-data', () => ({
  settleFamilyMigration: (...args: unknown[]) => mockSettleFamilyMigration(...args),
}));

// Mock fs (dynamic import in upgrade.ts uses `await import('fs')`)
const mockFsAccess = vi.fn();
const mockFsRename = vi.fn();
const mockFsRm = vi.fn();
const mockFsMkdir = vi.fn();
vi.mock('fs', () => ({
  // `true` stands in for a device installed the standard way, which is what
  // app-dir.ts probes for when it resolves the tree whose scripts we run.
  // These tests assert against that layout (see the process.chdir expectation
  // below), so the probe has to agree with them.
  existsSync: () => true,
  promises: {
    access: (...args: unknown[]) => mockFsAccess(...args),
    rename: (...args: unknown[]) => mockFsRename(...args),
    rm: (...args: unknown[]) => mockFsRm(...args),
    mkdir: (...args: unknown[]) => mockFsMkdir(...args),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

interface FakeChild extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
  pid: number;
}

/** Create a fake ChildProcess that completes successfully with given stdout.
 *  Uses PassThrough streams so readline's createInterface works. */
function createFakeChild(stdout = '', exitCode = 0): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.pid = 12345;
  child.kill = vi.fn((sig?: string) => {
    child.killed = true;
    // Close the streams so readline finishes
    child.stdout.end();
    child.stderr.end();
    process.nextTick(() => child.emit('close', null, sig ?? 'SIGTERM'));
    return true;
  });

  // Write stdout data and close on next tick to let readline wire up first
  process.nextTick(() => {
    if (stdout) {
      child.stdout.write(stdout + '\n');
    }
    child.stdout.end();
    child.stderr.end();
    // Emit close after a small delay so readline has time to process
    setTimeout(() => child.emit('close', exitCode, null), 5);
  });

  return child;
}

/** Create a fake child that hangs (never closes) — for cancel/concurrent tests */
function createHangingChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.pid = 12345;
  child.kill = vi.fn((sig?: string) => {
    child.killed = true;
    child.stdout.end();
    child.stderr.end();
    process.nextTick(() => child.emit('close', null, sig ?? 'SIGTERM'));
    return true;
  });
  return child;
}

/** Minimal valid config for mocking readConfig */
const MOCK_CONFIG = {
  version: 1,
  settings: {
    rotationIntervalMs: 30000,
    weather: { provider: 'weatherapi' as const, apiKey: '', latitude: 0, longitude: 0, units: 'imperial' as const },
    calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
  },
  screens: [{ id: 'default', name: 'Home', backgroundImage: '', modules: [] }],
};

/**
 * Set up mockSpawn so that every call returns a fake child producing
 * the given stdout JSON. The universal default satisfies all step checks.
 */
function setupSpawnForSuccess(overrides?: Record<string, string>) {
  mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
    const action = args?.[1] ?? 'unknown';
    const defaultResult = JSON.stringify({ ok: true, stashed: false, method: 'pm2', dirty: false });
    const result = overrides?.[action] ?? defaultResult;
    return createFakeChild(result);
  });
}

function resetMockDefaults() {
  transactionDepth = 0;
  scriptAccess.length = 0;
  mockWithDataTransaction.mockImplementation(async (operation: () => Promise<unknown>) => {
    transactionDepth++;
    try { return await operation(); } finally { transactionDepth--; }
  });
  mockReadConfig.mockResolvedValue(structuredClone(MOCK_CONFIG));
  mockWriteConfig.mockResolvedValue(undefined);
  mockGetLatestSchemaVersion.mockReturnValue(1);
  mockMigrateUp.mockReturnValue({ config: structuredClone(MOCK_CONFIG), migrationsRun: [] });
  mockHasReleaseTarball.mockResolvedValue(false);
  // No release body to read by default: the path guard lets the tag through.
  mockFetchReleaseByTag.mockResolvedValue(null);
  mockGetPackageVersion.mockResolvedValue('1.0.0');
  mockSettleFamilyMigration.mockResolvedValue(undefined);
  mockFsAccess.mockResolvedValue(undefined); // .git exists by default
  mockFsRename.mockResolvedValue(undefined);
  mockFsRm.mockResolvedValue(undefined);
  mockFsMkdir.mockResolvedValue(undefined);
}

// ── Tests ──────────────────────────────────────────────────────────────────

// upgrade.ts keeps its one-at-a-time state (currentUpgrade) on globalThis so
// every copy of the module in the process shares it. Drop it and re-import
// the module each time to get a fresh singleton.
let upgradeModule: typeof import('../upgrade');

beforeEach(async () => {
  vi.resetAllMocks();
  vi.spyOn(process, 'chdir').mockImplementation(() => {
    expect(transactionDepth).toBeGreaterThan(0);
  });
  resetMockDefaults();

  // Re-import to get fresh singleton state
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('home-screens.upgrade-state.v1')];
  vi.resetModules();
  upgradeModule = await import('../upgrade');

  // resetModules clears mock implementations, so re-apply defaults
  resetMockDefaults();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── isUpgradeRunning / isDeploying ─────────────────────────────────────────

describe('isUpgradeRunning', () => {
  it('returns false when no upgrade has been started', () => {
    expect(upgradeModule.isUpgradeRunning()).toBe(false);
  });

  it('returns true while an upgrade is running', async () => {
    mockSpawn.mockReturnValue(createHangingChild());

    const upgradePromise = upgradeModule.runUpgrade('v1.0.0').catch(() => {});
    // Give the async pipeline time to start (hasReleaseTarball, fs.access, then first spawn)
    await new Promise((r) => setTimeout(r, 100));

    expect(upgradeModule.isUpgradeRunning()).toBe(true);

    // Cancel to unblock
    upgradeModule.cancelUpgrade();
    await upgradePromise;
  });

  it('returns false after upgrade completes successfully', async () => {
    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v1.0.0');
    expect(upgradeModule.isUpgradeRunning()).toBe(false);
  });

  it('returns false after upgrade fails', async () => {
    mockSpawn.mockReturnValue(createFakeChild('', 1));
    await upgradeModule.runUpgrade('v1.0.0').catch(() => {});
    expect(upgradeModule.isUpgradeRunning()).toBe(false);
  });
});

describe('isDeploying', () => {
  it('returns false when no upgrade is running', () => {
    expect(upgradeModule.isDeploying()).toBe(false);
  });

  it('returns false after upgrade completes', async () => {
    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v1.0.0');
    expect(upgradeModule.isDeploying()).toBe(false);
  });
});

// ── subscribeToEvents ──────────────────────────────────────────────────────

describe('subscribeToEvents', () => {
  it('immediately sends current state on subscribe', () => {
    const events: unknown[] = [];
    upgradeModule.subscribeToEvents((e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'progress', step: 'idle', progress: 0 });
  });

  it('returns an unsubscribe function that removes the listener', async () => {
    const events: unknown[] = [];
    const unsub = upgradeModule.subscribeToEvents((e) => events.push(e));

    // Should have received the initial state
    expect(events).toHaveLength(1);
    unsub();

    // Run an upgrade — the unsubscribed listener should NOT receive more events
    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v1.0.0');

    // Still just the one initial event
    expect(events).toHaveLength(1);
  });

  it('emits progress events to all active listeners during an upgrade', async () => {
    const listener1: unknown[] = [];
    const listener2: unknown[] = [];
    upgradeModule.subscribeToEvents((e) => listener1.push(e));
    upgradeModule.subscribeToEvents((e) => listener2.push(e));

    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v1.0.0');

    // Both listeners should have received the same events beyond the initial one
    expect(listener1.length).toBeGreaterThan(1);
    expect(listener1.length).toBe(listener2.length);
  });

  it('silently catches errors thrown by listeners without breaking other listeners', async () => {
    const goodEvents: unknown[] = [];
    // Subscribe the bad listener first, then the good one — but only throw
    // during emit (progress events from the pipeline), not the initial subscribe call.
    let throwOnEvent = false;
    upgradeModule.subscribeToEvents(() => {
      if (throwOnEvent) throw new Error('listener exploded');
    });
    upgradeModule.subscribeToEvents((e) => goodEvents.push(e));
    throwOnEvent = true;

    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v1.0.0');

    // Good listener received events despite the bad one throwing
    // (initial subscribe event + pipeline progress events)
    expect(goodEvents.length).toBeGreaterThan(2);
  });

  it('emits output events with step and line data', async () => {
    const outputEvents: Array<{ type: string; step: string; line: string }> = [];
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'output') outputEvents.push(e as { type: string; step: string; line: string });
    });

    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v1.0.0');

    // At minimum, the migrate step emits "Schema is up to date" output
    expect(outputEvents.length).toBeGreaterThan(0);
    expect(outputEvents[0]).toHaveProperty('step');
    expect(outputEvents[0]).toHaveProperty('line');
  });
});

// ── cancelUpgrade ──────────────────────────────────────────────────────────

describe('cancelUpgrade', () => {
  it('returns false when no upgrade is running', () => {
    expect(upgradeModule.cancelUpgrade()).toBe(false);
  });

  it('returns true and sends SIGTERM to the child process when upgrade is running', async () => {
    const hangingChild = createHangingChild();
    mockSpawn.mockReturnValue(hangingChild);

    const upgradePromise = upgradeModule.runUpgrade('v1.0.0').catch(() => {});
    await new Promise((r) => setTimeout(r, 100));

    const result = upgradeModule.cancelUpgrade();

    expect(result).toBe(true);
    expect(hangingChild.kill).toHaveBeenCalledWith('SIGTERM');

    await upgradePromise;
  });

  it('emits a cancellation error event', async () => {
    mockSpawn.mockReturnValue(createHangingChild());
    const events: Array<{ type: string; message?: string; error?: string }> = [];
    upgradeModule.subscribeToEvents((e) => events.push(e as { type: string; message?: string; error?: string }));

    const upgradePromise = upgradeModule.runUpgrade('v1.0.0').catch(() => {});
    await new Promise((r) => setTimeout(r, 100));

    upgradeModule.cancelUpgrade();
    await upgradePromise;

    const cancelEvent = events.find(
      (e) => e.type === 'progress' && e.message === 'Upgrade cancelled by user',
    );
    expect(cancelEvent).toBeDefined();
    expect(cancelEvent?.error).toBe('Upgrade cancelled by user');
  });

  it('running state is reset after cancel completes (via pipeline finally block)', async () => {
    mockSpawn.mockReturnValue(createHangingChild());

    const upgradePromise = upgradeModule.runUpgrade('v1.0.0').catch(() => {});
    await new Promise((r) => setTimeout(r, 100));

    upgradeModule.cancelUpgrade();
    await upgradePromise;

    expect(upgradeModule.isUpgradeRunning()).toBe(false);
  });
});

// ── runUpgrade: pipeline guard (concurrent upgrade prevention) ─────────────

describe('runUpgrade — pipeline guard', () => {
  it('throws when an upgrade is already running', async () => {
    mockSpawn.mockReturnValue(createHangingChild());

    const first = upgradeModule.runUpgrade('v1.0.0').catch(() => {});
    await new Promise((r) => setTimeout(r, 100));

    await expect(upgradeModule.runUpgrade('v2.0.0')).rejects.toThrow(
      'An upgrade is already in progress',
    );

    upgradeModule.cancelUpgrade();
    await first;
  });

  it('allows a new upgrade after the previous one completes', async () => {
    setupSpawnForSuccess();

    await upgradeModule.runUpgrade('v1.0.0');
    await upgradeModule.runUpgrade('v1.1.0');

    expect(upgradeModule.isUpgradeRunning()).toBe(false);
  });

  it('allows a new upgrade after the previous one fails', async () => {
    mockSpawn.mockReturnValue(createFakeChild('', 1));
    await upgradeModule.runUpgrade('v1.0.0').catch(() => {});

    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v1.1.0');

    expect(upgradeModule.isUpgradeRunning()).toBe(false);
  });
});

// ── runUpgrade: git-based upgrade path ─────────────────────────────────────

describe('runUpgrade — git path', () => {
  beforeEach(() => {
    mockHasReleaseTarball.mockResolvedValue(false);
    mockFsAccess.mockResolvedValue(undefined);
  });

  it('runs all git pipeline steps in order', async () => {
    setupSpawnForSuccess();

    // Skip the initial idle event — only track steps from pipeline start
    const steps: string[] = [];
    let pipelineStarted = false;
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress') {
        if (e.step === 'preflight') pipelineStarted = true;
        if (pipelineStarted && !steps.includes(e.step)) {
          steps.push(e.step);
        }
      }
    });

    await upgradeModule.runUpgrade('v1.2.0');

    expect(steps).toContain('preflight');
    expect(steps).toContain('backup');
    expect(steps).toContain('fetch');
    expect(steps).toContain('checkout');
    expect(steps).toContain('install');
    expect(steps).toContain('build');
    expect(steps).toContain('migrate');
    expect(steps).toContain('complete');

    // Verify ordering: preflight before build before complete
    expect(steps.indexOf('preflight')).toBeLessThan(steps.indexOf('build'));
    expect(steps.indexOf('build')).toBeLessThan(steps.indexOf('complete'));
  });

  it('emits error event when a step fails mid-pipeline', async () => {
    let callCount = 0;
    mockSpawn.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createFakeChild(JSON.stringify({ ok: true, dirty: false }));
      }
      return createFakeChild('backup disk full', 1);
    });

    const events: Array<{ type: string; step?: string; error?: string }> = [];
    upgradeModule.subscribeToEvents((e) => events.push(e as { type: string; step?: string; error?: string }));

    await upgradeModule.runUpgrade('v1.2.0').catch(() => {});

    const errorEvent = events.find((e) => e.type === 'progress' && e.step === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.error).toBeTruthy();
  });

  it('throws descriptive error when no .git directory and no tarball', async () => {
    mockHasReleaseTarball.mockResolvedValue(false);
    mockFsAccess.mockRejectedValue(new Error('ENOENT'));

    await expect(upgradeModule.runUpgrade('v1.2.0')).rejects.toThrow(
      'No release tarball found for this version and no git repository is available',
    );
  });

  it('runs migration when config version is behind latest schema', async () => {
    mockGetLatestSchemaVersion.mockReturnValue(2);
    mockReadConfig.mockResolvedValue({ ...MOCK_CONFIG, version: 1 });
    const migratedConfig = { ...MOCK_CONFIG, version: 2 };
    mockMigrateUp.mockReturnValue({ config: migratedConfig, migrationsRun: ['v2: Add profiles'] });

    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v1.2.0');

    expect(mockMigrateUp).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1 }),
      2,
    );
    expect(mockWriteConfig).toHaveBeenCalledWith(migratedConfig);
  });

  it('skips migration when config is already at latest schema version', async () => {
    mockGetLatestSchemaVersion.mockReturnValue(1);
    mockReadConfig.mockResolvedValue({ ...MOCK_CONFIG, version: 1 });

    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v1.2.0');

    expect(mockMigrateUp).not.toHaveBeenCalled();
    expect(mockWriteConfig).not.toHaveBeenCalled();
  });

  it('passes target tag to the checkout script action', async () => {
    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v2.5.0');

    const checkoutCall = mockSpawn.mock.calls.find(
      (call: unknown[]) => (call[1] as string[])?.[1] === 'checkout',
    );
    expect(checkoutCall).toBeDefined();
    expect((checkoutCall![1] as string[])[2]).toBe('v2.5.0');
  });

  it('preflight failure prevents subsequent steps from running', async () => {
    mockSpawn.mockReturnValue(
      createFakeChild(JSON.stringify({ ok: false, error: 'Not enough disk space' })),
    );

    await expect(upgradeModule.runUpgrade('v1.2.0')).rejects.toThrow('Not enough disk space');

    // Only one spawn call — the preflight step
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it('carries needsSudoPassword from a failed preflight into the error event', async () => {
    mockSpawn.mockReturnValue(
      createFakeChild(
        JSON.stringify({ ok: false, error: 'No passwordless sudo', needsSudoPassword: true }),
      ),
    );
    const errors: Array<Record<string, unknown>> = [];
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress' && e.step === 'error') errors.push(e as unknown as Record<string, unknown>);
    });

    await expect(upgradeModule.runUpgrade('v1.2.0')).rejects.toThrow('No passwordless sudo');

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ error: 'No passwordless sudo', needsSudoPassword: true });
  });

  it('omits needsSudoPassword when a preflight fails for another reason', async () => {
    mockSpawn.mockReturnValue(
      createFakeChild(JSON.stringify({ ok: false, error: 'Not enough disk space', needsSudoPassword: false })),
    );
    const errors: Array<Record<string, unknown>> = [];
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress' && e.step === 'error') errors.push(e as unknown as Record<string, unknown>);
    });

    await expect(upgradeModule.runUpgrade('v1.2.0')).rejects.toThrow('Not enough disk space');

    expect(errors[0]).not.toHaveProperty('needsSudoPassword');
  });

  it('emits preflight warning as output event when warning is present', async () => {
    setupSpawnForSuccess({
      preflight: JSON.stringify({ ok: true, dirty: false, warning: 'Low disk space' }),
    });

    const outputs: Array<{ step: string; line: string }> = [];
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'output') outputs.push(e as { step: string; line: string });
    });

    await upgradeModule.runUpgrade('v1.2.0');

    const warningOutput = outputs.find(
      (o) => o.step === 'preflight' && o.line.includes('Low disk space'),
    );
    expect(warningOutput).toBeDefined();
  });
});

// ── runUpgrade: tarball-based upgrade path ─────────────────────────────────

describe('runUpgrade — tarball path', () => {
  beforeEach(() => {
    mockHasReleaseTarball.mockResolvedValue(true);
  });

  it('runs tarball pipeline steps (not git steps) in order', async () => {
    setupSpawnForSuccess();

    const steps: string[] = [];
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress' && !steps.includes(e.step)) {
        steps.push(e.step);
      }
    });

    await upgradeModule.runUpgrade('v1.2.0');

    // Tarball-specific steps
    expect(steps).toContain('preflight');
    expect(steps).toContain('backup');
    expect(steps).toContain('download');
    expect(steps).toContain('migrate');
    expect(steps).toContain('deploy');
    expect(steps).toContain('setup-system');
    expect(steps).toContain('restart');
    expect(steps).toContain('complete');

    // Cleanup is intentionally NOT a separate pipeline step on the tarball
    // path. See code-review-remediation.md item 2: cleanup-rollback used to
    // run before the new release proved it could boot, leaving nothing to
    // recover from on startup failure. The `restart` action now spawns a
    // detached background job that health-checks the new server and only
    // then removes the rollback dir.
    expect(steps).not.toContain('cleanup');

    // Git-only steps should be absent
    expect(steps).not.toContain('fetch');
    expect(steps).not.toContain('checkout');
    // Tarball path doesn't have separate install/build
    expect(steps).not.toContain('install');
    expect(steps).not.toContain('build');
  });

  it('passes target tag and GITHUB_REPO to the download script action', async () => {
    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v2.0.0');

    const downloadCall = mockSpawn.mock.calls.find(
      (call: unknown[]) => (call[1] as string[])?.[1] === 'download',
    );
    expect(downloadCall).toBeDefined();
    expect((downloadCall![1] as string[])[2]).toBe('v2.0.0');
    expect((downloadCall![1] as string[])[3]).toBe('home-screens/home-screens');
  });

  it('cleans up staging directory on pipeline failure', async () => {
    let callCount = 0;
    mockSpawn.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createFakeChild(JSON.stringify({ ok: true }));
      }
      return createFakeChild('', 1);
    });

    await upgradeModule.runUpgrade('v1.2.0').catch(() => {});

    expect(mockFsRm).toHaveBeenCalledWith(
      expect.stringContaining('.staging'),
      { recursive: true, force: true },
    );
  });

  it('recovers from interrupted deploy (missing APP_DIR) before starting', async () => {
    // First access check (recovery) fails — APP_DIR missing
    mockFsAccess.mockRejectedValueOnce(new Error('ENOENT'));
    // Subsequent checks succeed
    mockFsAccess.mockResolvedValue(undefined);

    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v1.2.0');

    // Should have attempted rename(rollbackDir, APP_DIR) for recovery
    expect(mockFsRename).toHaveBeenCalled();
  });

  it('recovers from interrupted deploy (stale staging dir) by reconciling stranded data', async () => {
    // Scenario 2: APP_DIR is fine, but a stale .staging dir exists from
    // a previous deploy that was interrupted before the swap. The new
    // recoverFromInterruptedDeploy logic should:
    //   1. Detect the staging dir
    //   2. Find stranded `data/` inside it (since old code did mv, not cp)
    //   3. Move it back to APP_DIR/data because dst is missing
    //   4. Remove the staging dir
    //
    // We mock fs.access by inspecting the path argument and returning the
    // appropriate result for each scenario branch.
    mockFsAccess.mockImplementation(async (p: string) => {
      // APP_DIR exists (scenario 1 doesn't apply)
      if (p.endsWith('/current')) return undefined;
      // staging dir exists (triggers scenario 2)
      if (p.endsWith('/current.staging')) return undefined;
      // staging has a stranded data subdir
      if (p.endsWith('/current.staging/data')) return undefined;
      // dst (APP_DIR/data) is missing → restore from staging
      if (p.endsWith('/current/data')) throw new Error('ENOENT');
      // staging does NOT have public/backgrounds
      if (p.endsWith('/current.staging/public/backgrounds')) throw new Error('ENOENT');
      // Anything else: assume present
      return undefined;
    });

    setupSpawnForSuccess();
    await upgradeModule.runUpgrade('v1.2.0');

    // Should have renamed the stranded data back to APP_DIR
    expect(mockFsRename).toHaveBeenCalledWith(
      expect.stringContaining('.staging/data'),
      expect.stringContaining('/current/data'),
    );
    // Should have removed the staging dir during recovery
    expect(mockFsRm).toHaveBeenCalledWith(
      expect.stringContaining('.staging'),
      { recursive: true, force: true },
    );
  });

  it('completes with correct message including the target tag', async () => {
    setupSpawnForSuccess();

    const events: Array<{ type: string; step?: string; message?: string }> = [];
    upgradeModule.subscribeToEvents((e) => events.push(e as { type: string; step?: string; message?: string }));

    await upgradeModule.runUpgrade('v3.0.0');

    const completeEvent = events.findLast(
      (e) => e.type === 'progress' && e.step === 'complete',
    );
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.message).toBe('Upgrade to v3.0.0 complete!');
  });

  it('migrate step runs BEFORE deploy step', async () => {
    const stepOrder: string[] = [];
    setupSpawnForSuccess();

    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress' && !stepOrder.includes(e.step)) {
        stepOrder.push(e.step);
      }
    });

    await upgradeModule.runUpgrade('v1.0.0');

    const migrateIdx = stepOrder.indexOf('migrate');
    const deployIdx = stepOrder.indexOf('deploy');
    expect(migrateIdx).toBeGreaterThan(-1);
    expect(deployIdx).toBeGreaterThan(-1);
    expect(migrateIdx).toBeLessThan(deployIdx);
  });
});

// ── runRollback ────────────────────────────────────────────────────────────

describe('runUpgrade — install path guard', () => {
  function release(tag: string, body: string) {
    return { tag_name: tag, name: tag, body, draft: false, prerelease: false, published_at: '', assets: [] };
  }

  it('refuses a target whose floor is unmet before any script runs', async () => {
    mockHasReleaseTarball.mockResolvedValue(true);
    mockFetchReleaseByTag.mockResolvedValue(release('v2.0.0', '<!-- home-screens-requires: 1.43.0 -->'));
    mockGetPackageVersion.mockResolvedValue('1.32.0');
    setupSpawnForSuccess();

    const events: { step: string; error?: string }[] = [];
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress') events.push({ step: e.step, error: e.error });
    });

    await expect(upgradeModule.runUpgrade('v2.0.0')).rejects.toThrow('v2.0.0 needs v1.43.0 installed first');
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ step: 'error', error: 'v2.0.0 needs v1.43.0 installed first. Update to v1.43.0, then update again.' });
  });

  it('lets a target through once its floor is met', async () => {
    mockHasReleaseTarball.mockResolvedValue(true);
    mockFetchReleaseByTag.mockResolvedValue(release('v2.0.0', '<!-- home-screens-requires: 1.43.0 -->'));
    mockGetPackageVersion.mockResolvedValue('1.43.0');
    setupSpawnForSuccess();

    await upgradeModule.runUpgrade('v2.0.0');
    expect(scriptAccess.map((s) => s.action)).toContain('download');
  });

  it('refuses a step back that cannot read the saved settings', async () => {
    mockHasReleaseTarball.mockResolvedValue(true);
    mockFetchReleaseByTag.mockResolvedValue(release('v1.43.0', '<!-- home-screens-schema: 13 -->'));
    mockGetPackageVersion.mockResolvedValue('2.0.0');
    mockReadConfig.mockResolvedValue({ ...structuredClone(MOCK_CONFIG), version: 20 });
    setupSpawnForSuccess();

    await expect(upgradeModule.runRollback('v1.43.0')).rejects.toThrow('Going back to v1.43.0 would leave settings that version cannot read.');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('lets a step back through when the target reads the same schema', async () => {
    mockHasReleaseTarball.mockResolvedValue(true);
    mockFetchReleaseByTag.mockResolvedValue(release('v1.43.0', '<!-- home-screens-schema: 20 -->'));
    mockGetPackageVersion.mockResolvedValue('2.0.0');
    mockReadConfig.mockResolvedValue({ ...structuredClone(MOCK_CONFIG), version: 20 });
    setupSpawnForSuccess();

    await upgradeModule.runRollback('v1.43.0');
    expect(scriptAccess.map((s) => s.action)).toContain('download');
  });

  it('stops when the release information cannot be fetched at all', async () => {
    // hasReleaseTarball has already fallen back to git by now, and git fetch
    // may succeed, so an unchecked target must not go through.
    mockHasReleaseTarball.mockResolvedValue(false);
    mockFetchReleaseByTag.mockRejectedValue(new Error('GitHub API returned 500'));
    setupSpawnForSuccess();

    await expect(upgradeModule.runUpgrade('v2.0.0')).rejects.toThrow(
      'Could not check whether v2.0.0 can be installed because the release information could not be fetched. Try again in a few minutes.',
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('lets a target through when the tag simply has no release', async () => {
    mockHasReleaseTarball.mockResolvedValue(false);
    mockFetchReleaseByTag.mockResolvedValue(null);
    setupSpawnForSuccess();

    await upgradeModule.runUpgrade('v2.0.0');
    expect(scriptAccess.map((s) => s.action)).toContain('checkout');
  });

  it('guards the git path too', async () => {
    mockHasReleaseTarball.mockResolvedValue(false);
    mockFetchReleaseByTag.mockResolvedValue(release('v2.0.0', '<!-- home-screens-requires: 1.43.0 -->'));
    mockGetPackageVersion.mockResolvedValue('1.0.0');
    setupSpawnForSuccess();

    await expect(upgradeModule.runUpgrade('v2.0.0')).rejects.toThrow('needs v1.43.0 installed first');
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe('migrate step — family fold', () => {
  it('settles the family fold inside the migrate transaction', async () => {
    mockHasReleaseTarball.mockResolvedValue(true);
    setupSpawnForSuccess();
    let depthWhenSettled = -1;
    mockSettleFamilyMigration.mockImplementation(async () => { depthWhenSettled = transactionDepth; });

    const lines: string[] = [];
    upgradeModule.subscribeToEvents((e) => { if (e.type === 'output' && e.step === 'migrate') lines.push(e.line); });

    await upgradeModule.runUpgrade('v1.2.0');
    expect(mockSettleFamilyMigration).toHaveBeenCalledTimes(1);
    expect(depthWhenSettled).toBeGreaterThan(0);
    expect(lines).toContain('Family data is up to date');
  });

  it('fails the upgrade before deploy when the family fold fails', async () => {
    mockHasReleaseTarball.mockResolvedValue(true);
    setupSpawnForSuccess();
    mockSettleFamilyMigration.mockRejectedValue(new Error('The saved family sources could not be read.'));

    await expect(upgradeModule.runUpgrade('v1.2.0')).rejects.toThrow('The saved family sources could not be read.');
    expect(scriptAccess.map((s) => s.action)).not.toContain('deploy');
  });
});

describe('runRollback', () => {
  it('uses tarball pipeline when tarball is available', async () => {
    mockHasReleaseTarball.mockResolvedValue(true);
    setupSpawnForSuccess();

    const steps: string[] = [];
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress' && !steps.includes(e.step)) {
        steps.push(e.step);
      }
    });

    await upgradeModule.runRollback('v1.0.0');

    expect(steps).toContain('download');
    expect(steps).toContain('deploy');
  });

  it('uses legacy git rollback when no tarball is available', async () => {
    mockHasReleaseTarball.mockResolvedValue(false);
    setupSpawnForSuccess();

    const steps: string[] = [];
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress' && !steps.includes(e.step)) {
        steps.push(e.step);
      }
    });

    await upgradeModule.runRollback('v0.9.0');

    expect(steps).toContain('backup');
    expect(steps).toContain('checkout');
    expect(steps).toContain('install');
    expect(steps).toContain('build');
    expect(steps).toContain('restart');
    expect(steps).toContain('complete');
  });

  it('passes target tag to the rollback script action', async () => {
    mockHasReleaseTarball.mockResolvedValue(false);
    setupSpawnForSuccess();

    await upgradeModule.runRollback('v0.8.0');

    const rollbackCall = mockSpawn.mock.calls.find(
      (call: unknown[]) => (call[1] as string[])?.[1] === 'rollback',
    );
    expect(rollbackCall).toBeDefined();
    expect((rollbackCall![1] as string[])[2]).toBe('v0.8.0');
  });

  it('is blocked by a concurrent upgrade via the pipeline guard', async () => {
    mockSpawn.mockReturnValue(createHangingChild());

    const first = upgradeModule.runUpgrade('v1.0.0').catch(() => {});
    await new Promise((r) => setTimeout(r, 100));

    await expect(upgradeModule.runRollback('v0.9.0')).rejects.toThrow(
      'An upgrade is already in progress',
    );

    upgradeModule.cancelUpgrade();
    await first;
  });

  it('complete message reflects rollback wording', async () => {
    mockHasReleaseTarball.mockResolvedValue(false);
    setupSpawnForSuccess();

    const events: Array<{ type: string; step?: string; message?: string }> = [];
    upgradeModule.subscribeToEvents((e) => events.push(e as { type: string; step?: string; message?: string }));

    await upgradeModule.runRollback('v0.7.0');

    const completeEvent = events.findLast(
      (e) => e.type === 'progress' && e.step === 'complete',
    );
    expect(completeEvent?.message).toBe('Rolled back to v0.7.0 successfully!');
  });

  /**
   * The confirmation the user reads before going back a version promises "A
   * snapshot of your current setup is saved first, so you can come back". That
   * sentence is only true while both rollback pipelines run the `backup`
   * script action before anything replaces the tree: it copies
   * data/config.json into data/backups/ (see the `backup` case in
   * scripts/upgrade.sh, covered by scripts/__tests__/backup-rotation.test.ts).
   *
   * Restoring a backup is the sibling path that makes no such copy, and its
   * confirmation says so instead; see
   * src/app/api/backup/__tests__/route.restore-is-final.test.ts.
   */
  it.each([
    { tarball: true, replaces: 'deploy' },
    { tarball: false, replaces: 'rollback' },
  ])('saves a config snapshot before anything replaces the tree (tarball: $tarball)', async ({ tarball, replaces }) => {
    mockHasReleaseTarball.mockResolvedValue(tarball);
    setupSpawnForSuccess();

    await upgradeModule.runRollback('v0.9.0');

    const actions = mockSpawn.mock.calls.map((call: unknown[]) => (call[1] as string[])[1]);
    expect(actions).toContain('backup');
    expect(actions.indexOf('backup')).toBeLessThan(actions.indexOf(replaces));
    expect(editorCopy.settings.systemPage.rollbackDialog.message).toMatch(/snapshot/i);
  });

  it('does not include migrate step in git rollback pipeline', async () => {
    mockHasReleaseTarball.mockResolvedValue(false);
    setupSpawnForSuccess();

    const steps: string[] = [];
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress' && !steps.includes(e.step)) {
        steps.push(e.step);
      }
    });

    await upgradeModule.runRollback('v0.9.0');

    // Git rollback pipeline has no migrate step
    expect(steps).not.toContain('migrate');
  });
});

// ── cancelUpgrade: deploy-phase blocking ───────────────────────────────────

describe('cancelUpgrade — deploy phase blocking', () => {
  it('returns false during the deploy step because atomic swap must not be interrupted', async () => {
    mockHasReleaseTarball.mockResolvedValue(true);

    let deployChildResolve: (() => void) | null = null;

    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      const action = args?.[1] ?? 'unknown';

      if (action === 'deploy') {
        const child = createHangingChild();
        deployChildResolve = () => {
          child.stdout.write(JSON.stringify({ ok: true }) + '\n');
          child.stdout.end();
          child.stderr.end();
          setTimeout(() => child.emit('close', 0, null), 5);
        };
        return child;
      }

      return createFakeChild(JSON.stringify({ ok: true, method: 'pm2', dirty: false, stashed: false }));
    });

    const upgradePromise = upgradeModule.runUpgrade('v1.0.0').catch(() => {});
    // Wait for pipeline to reach deploy step — the earlier steps complete quickly
    await new Promise((r) => setTimeout(r, 300));

    // Cancel should be blocked during deploy
    const cancelResult = upgradeModule.cancelUpgrade();
    expect(cancelResult).toBe(false);
    expect(upgradeModule.isDeploying()).toBe(true);

    // Let deploy finish
    deployChildResolve!();
    await upgradePromise;

    expect(upgradeModule.isDeploying()).toBe(false);
  });
});

// ── Event emission details ─────────────────────────────────────────────────

describe('progress event structure', () => {
  it('all progress events have valid step, progress (0-100), and message', async () => {
    setupSpawnForSuccess();

    const progressEvents: Array<{ type: string; step: string; progress: number; message: string }> = [];
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress') {
        progressEvents.push(e as { type: string; step: string; progress: number; message: string });
      }
    });

    await upgradeModule.runUpgrade('v1.0.0');

    for (const event of progressEvents) {
      expect(typeof event.step).toBe('string');
      expect(typeof event.progress).toBe('number');
      expect(event.progress).toBeGreaterThanOrEqual(0);
      expect(event.progress).toBeLessThanOrEqual(100);
      expect(typeof event.message).toBe('string');
      expect(event.message.length).toBeGreaterThan(0);
    }
  });

  it('progress increases monotonically (no backwards jumps) across pipeline steps', async () => {
    setupSpawnForSuccess();

    // Skip the initial idle state — only track pipeline progress
    const progressValues: number[] = [];
    let pipelineStarted = false;
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress') {
        if (e.step === 'preflight') pipelineStarted = true;
        if (pipelineStarted && e.step !== 'error') {
          progressValues.push(e.progress);
        }
      }
    });

    await upgradeModule.runUpgrade('v1.0.0');

    expect(progressValues.length).toBeGreaterThan(1);
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
  });

  it('reaches 100% on successful completion', async () => {
    setupSpawnForSuccess();

    let lastProgress = 0;
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress') lastProgress = e.progress;
    });

    await upgradeModule.runUpgrade('v1.0.0');
    expect(lastProgress).toBe(100);
  });
});

// ── Restart step behavior ──────────────────────────────────────────────────

describe('restart step — systemctl handling', () => {
  it('emits "Server will restart momentarily" message when method is systemctl', async () => {
    mockHasReleaseTarball.mockResolvedValue(false);
    mockFsAccess.mockResolvedValue(undefined);

    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      const action = args?.[1] ?? 'unknown';
      if (action === 'restart') {
        return createFakeChild(JSON.stringify({ ok: true, method: 'systemctl' }));
      }
      return createFakeChild(JSON.stringify({ ok: true, dirty: false, stashed: false, method: 'pm2' }));
    });

    const messages: string[] = [];
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress') messages.push(e.message);
    });

    await upgradeModule.runUpgrade('v1.0.0');

    expect(messages).toContain('Server will restart momentarily...');
  });

  it('does not emit systemctl message when method is pm2', async () => {
    setupSpawnForSuccess();

    const messages: string[] = [];
    upgradeModule.subscribeToEvents((e) => {
      if (e.type === 'progress') messages.push(e.message);
    });

    await upgradeModule.runUpgrade('v1.0.0');

    expect(messages).not.toContain('Server will restart momentarily...');
  });
});

// ── Git stash behavior ──────────────────────────────────────────────────────

describe('runUpgrade — git stash behavior', () => {
  beforeEach(() => {
    mockHasReleaseTarball.mockResolvedValue(false);
    mockFsAccess.mockResolvedValue(undefined);
  });

  it('skips stash when working directory is clean', async () => {
    setupSpawnForSuccess({
      preflight: JSON.stringify({ ok: true, dirty: false }),
    });

    await upgradeModule.runUpgrade('v1.0.0');

    // The stash action should not have been called on spawn
    const stashCall = mockSpawn.mock.calls.find(
      (call: unknown[]) => (call[1] as string[])?.[1] === 'stash',
    );
    expect(stashCall).toBeUndefined();
  });

  it('runs stash when working directory is dirty', async () => {
    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      const action = args?.[1] ?? 'unknown';
      if (action === 'preflight') {
        return createFakeChild(JSON.stringify({ ok: true, dirty: true }));
      }
      if (action === 'stash') {
        return createFakeChild(JSON.stringify({ stashed: true }));
      }
      return createFakeChild(JSON.stringify({ ok: true, method: 'pm2', dirty: false, stashed: false }));
    });

    await upgradeModule.runUpgrade('v1.0.0');

    const stashCall = mockSpawn.mock.calls.find(
      (call: unknown[]) => (call[1] as string[])?.[1] === 'stash',
    );
    expect(stashCall).toBeDefined();

    // Should also pop stash in cleanup
    const stashPopCall = mockSpawn.mock.calls.find(
      (call: unknown[]) => (call[1] as string[])?.[1] === 'stash-pop',
    );
    expect(stashPopCall).toBeDefined();
  });
});


describe('upgrade data snapshots', () => {
  it.each(['git-upgrade', 'tarball-upgrade', 'git-rollback'] as const)('%s holds the coordinator through snapshot script completion', async (kind) => {
    setupSpawnForSuccess();
    mockHasReleaseTarball.mockResolvedValue(kind === 'tarball-upgrade');
    mockReadConfig.mockImplementation(async () => {
      expect(transactionDepth).toBeGreaterThan(0);
      return structuredClone(MOCK_CONFIG);
    });
    if (kind === 'git-rollback') await upgradeModule.runRollback('v1.1.0');
    else await upgradeModule.runUpgrade('v1.2.0');
    const snapshots = scriptAccess.filter(({ action }) => action === 'backup' || action === 'deploy');
    expect(snapshots.map(({ action }) => action)).toEqual(kind === 'tarball-upgrade' ? ['backup', 'deploy'] : ['backup']);
    expect(snapshots.every(({ depth }) => depth > 0)).toBe(true);
    if (kind === 'tarball-upgrade') {
      expect(scriptAccess.find(({ action }) => action === 'prepare-deploy')).toEqual({ action: 'prepare-deploy', depth: 0 });
      expect(process.chdir).toHaveBeenCalledWith('/opt/home-screens/current');
      expect(mockSpawn.mock.calls.find((call) => (call[1] as string[])[1] === 'deploy')?.[1]).toContain('--runtime-ready');
    }
    expect(transactionDepth).toBe(0);
  });
});
