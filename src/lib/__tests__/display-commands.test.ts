import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  enqueueCommand,
  drainCommands,
  setDisplayStatus,
  getDisplayStatus,
  getAllDisplayStatuses,
  getUnadoptedDisplays,
  recordViewportReport,
  getViewportReports,
  recordSharedStateReport,
  getSharedStateReport,
  recordProviderHealthReport,
  getProviderHealthReport,
  markSharedStateInterest,
  hasSharedStateInterest,
  __resetForTests,
  type DisplayStatus,
} from '@/lib/display-commands';

beforeEach(() => {
  __resetForTests();
});

describe('enqueueCommand / drainCommands (legacy default queue)', () => {
  it('returns empty array when nothing queued', () => {
    expect(drainCommands()).toEqual([]);
  });

  it('enqueues a simple command with timestamp on the default queue', () => {
    enqueueCommand(undefined, 'wake');
    const commands = drainCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe('wake');
    expect(commands[0].payload).toBeUndefined();
    expect(commands[0].timestamp).toBeTypeOf('number');
  });

  it('enqueues a command with payload', () => {
    enqueueCommand(undefined, 'brightness', { value: 50 });
    const commands = drainCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe('brightness');
    expect(commands[0].payload).toEqual({ value: 50 });
  });

  it('drains all commands in FIFO order', () => {
    enqueueCommand(undefined, 'wake');
    enqueueCommand(undefined, 'next-screen');
    enqueueCommand(undefined, 'sleep');
    const commands = drainCommands();
    expect(commands).toHaveLength(3);
    expect(commands.map((c) => c.type)).toEqual(['wake', 'next-screen', 'sleep']);
  });

  it('clears the queue after drain', () => {
    enqueueCommand(undefined, 'wake');
    enqueueCommand(undefined, 'reload');
    const first = drainCommands();
    expect(first).toHaveLength(2);
    const second = drainCommands();
    expect(second).toEqual([]);
  });

  it('preserves alert payload fields', () => {
    enqueueCommand(undefined, 'alert', {
      type: 'warning',
      title: 'Test',
      message: 'Hello',
      duration: 5000,
    });
    const [cmd] = drainCommands();
    expect(cmd.payload).toEqual({
      type: 'warning',
      title: 'Test',
      message: 'Hello',
      duration: 5000,
    });
  });
});

describe('per-display queues', () => {
  it('keeps each display\'s queue isolated', () => {
    enqueueCommand('kitchen', 'wake');
    enqueueCommand('bedroom', 'sleep');
    expect(drainCommands('kitchen').map((c) => c.type)).toEqual(['wake']);
    expect(drainCommands('bedroom').map((c) => c.type)).toEqual(['sleep']);
  });

  it('does not bleed targeted commands into the default queue', () => {
    enqueueCommand('kitchen', 'wake');
    expect(drainCommands()).toEqual([]);
    expect(drainCommands('kitchen')).toHaveLength(1);
  });

  it('returns empty for an unknown display', () => {
    expect(drainCommands('never-seen')).toEqual([]);
  });
});

describe('broadcast (display=all)', () => {
  it('fans out to every display that has polled, plus the default queue', () => {
    // Discover displays via initial poll
    drainCommands('kitchen');
    drainCommands('bedroom');

    enqueueCommand('all', 'reload');

    expect(drainCommands('kitchen').map((c) => c.type)).toEqual(['reload']);
    expect(drainCommands('bedroom').map((c) => c.type)).toEqual(['reload']);
    expect(drainCommands().map((c) => c.type)).toEqual(['reload']);
  });

  it('still hits the default queue when no displays have polled', () => {
    enqueueCommand('all', 'wake');
    expect(drainCommands().map((c) => c.type)).toEqual(['wake']);
  });
});

describe('queue growth bounds', () => {
  it('caps a single queue at 32 commands, dropping the oldest', () => {
    for (let i = 0; i < 40; i++) {
      enqueueCommand('kitchen', 'brightness', { value: i });
    }
    const drained = drainCommands('kitchen');
    expect(drained).toHaveLength(32);
    // Newest-wins: the first 8 enqueues were dropped, the latest kept.
    expect(drained[0].payload).toEqual({ value: 8 });
    expect(drained[31].payload).toEqual({ value: 39 });
  });

  it('refuses to create new queues for never-polling slugs past the display cap', () => {
    for (let i = 0; i < 64; i++) {
      enqueueCommand(`slug-${i}`, 'wake');
    }
    enqueueCommand('slug-overflow', 'wake');
    expect(drainCommands('slug-overflow')).toEqual([]);
    // Queues created before the cap are intact.
    expect(drainCommands('slug-0').map((c) => c.type)).toEqual(['wake']);
  });

  it('always accepts enqueues for displays that have polled, even at the queue cap', () => {
    drainCommands('kitchen'); // registers in knownDisplays, leaves no queue
    for (let i = 0; i < 64; i++) {
      enqueueCommand(`slug-${i}`, 'wake');
    }
    enqueueCommand('kitchen', 'sleep');
    expect(drainCommands('kitchen').map((c) => c.type)).toEqual(['sleep']);
  });

  it('evicts stale queues for slugs that never polled during the unadopted sweep', () => {
    const realNow = Date.now;
    const longAgo = realNow() - 5 * 60 * 1000;
    try {
      Date.now = () => longAgo;
      enqueueCommand('ghost-display', 'wake');
    } finally {
      Date.now = realNow;
    }
    getUnadoptedDisplays([]);
    expect(drainCommands('ghost-display')).toEqual([]);
  });

  it('keeps fresh never-polled queues and stale adopted queues through the sweep', () => {
    // Fresh command to a never-polled slug: not evicted.
    enqueueCommand('fresh-slug', 'wake');
    // Stale command to an adopted display: not evicted either.
    const realNow = Date.now;
    const longAgo = realNow() - 5 * 60 * 1000;
    try {
      Date.now = () => longAgo;
      enqueueCommand('kitchen', 'sleep');
    } finally {
      Date.now = realNow;
    }
    getUnadoptedDisplays(['kitchen']);
    expect(drainCommands('fresh-slug').map((c) => c.type)).toEqual(['wake']);
    expect(drainCommands('kitchen').map((c) => c.type)).toEqual(['sleep']);
  });
});

describe('heartbeat tracking', () => {
  it('updates lastSeen when a display drains commands', () => {
    drainCommands('kitchen');
    const status = getDisplayStatus('kitchen');
    expect(status?.lastSeen).toBeTypeOf('number');
    expect(status?.lastSeen).toBeGreaterThan(0);
  });

  it('does not create a status entry when no displayId is given', () => {
    drainCommands();
    expect(getDisplayStatus('anything')).toBeNull();
  });
});

describe('setDisplayStatus / getDisplayStatus', () => {
  it('returns null when no status has been reported for a display', () => {
    expect(getDisplayStatus('unknown')).toBeNull();
  });

  it('stores and returns status for a specific display', () => {
    const status: DisplayStatus = {
      currentScreen: { index: 0, id: 'screen-1', name: 'Main' },
      screenCount: 2,
      activeProfile: 'day',
      displayState: 'active',
      timestamp: Date.now(),
    };
    setDisplayStatus(status, 'kitchen');
    const stored = getDisplayStatus('kitchen');
    expect(stored?.currentScreen).toEqual(status.currentScreen);
    expect(stored?.displayState).toBe('active');
  });

  it('falls back to the default key when no displayId is given', () => {
    const status: DisplayStatus = {
      currentScreen: { index: 0, id: 'a', name: 'A' },
      screenCount: 1,
      activeProfile: null,
      displayState: 'active',
      timestamp: 1,
    };
    setDisplayStatus(status);
    expect(getDisplayStatus()?.currentScreen.id).toBe('a');
  });

  it('overwrites previous status for the same display', () => {
    setDisplayStatus(
      {
        currentScreen: { index: 0, id: 'a', name: 'A' },
        screenCount: 1,
        activeProfile: null,
        displayState: 'active',
        timestamp: 1,
      },
      'kitchen',
    );
    setDisplayStatus(
      {
        currentScreen: { index: 1, id: 'b', name: 'B' },
        screenCount: 3,
        activeProfile: 'night',
        displayState: 'asleep',
        timestamp: 2,
      },
      'kitchen',
    );
    const got = getDisplayStatus('kitchen');
    expect(got?.currentScreen.id).toBe('b');
    expect(got?.displayState).toBe('asleep');
  });
});

describe('getAllDisplayStatuses', () => {
  it('returns all display statuses keyed by id', () => {
    drainCommands('kitchen');
    drainCommands('bedroom');
    const all = getAllDisplayStatuses();
    expect(all.size).toBeGreaterThanOrEqual(2);
    expect(all.has('kitchen')).toBe(true);
    expect(all.has('bedroom')).toBe(true);
  });
});

describe('getUnadoptedDisplays', () => {
  it('returns displays that have polled but are not in the config', () => {
    drainCommands('kitchen');
    drainCommands('bedroom');
    drainCommands('garage');
    const unadopted = getUnadoptedDisplays(['kitchen']);
    expect(unadopted.sort()).toEqual(['bedroom', 'garage']);
  });

  it('returns empty when every known display is in the config', () => {
    drainCommands('kitchen');
    expect(getUnadoptedDisplays(['kitchen'])).toEqual([]);
  });

  it('returns empty when nothing has polled', () => {
    expect(getUnadoptedDisplays(['kitchen'])).toEqual([]);
  });

  it('prunes unadopted displays whose last heartbeat is older than the staleness window', async () => {
    // Seed an unadopted display with a stale heartbeat by stubbing Date.now.
    const realNow = Date.now;
    const longAgo = realNow() - 5 * 60 * 1000; // 5 minutes ago
    try {
      // Stub Date.now so drainCommands writes a "5 minutes ago" lastSeen
      Date.now = () => longAgo;
      drainCommands('abandoned');
    } finally {
      Date.now = realNow;
    }

    // First call with real now() sees the stale entry and prunes it
    expect(getUnadoptedDisplays([])).toEqual([]);
    // Second call confirms it's really gone from the tracking maps
    expect(getUnadoptedDisplays([])).toEqual([]);
    expect(getDisplayStatus('abandoned')).toBeNull();
  });

  it('keeps unadopted displays whose heartbeat is fresh', () => {
    drainCommands('kitchen');
    expect(getUnadoptedDisplays([])).toEqual(['kitchen']);
    // Calling again doesn't prune it (still fresh)
    expect(getUnadoptedDisplays([])).toEqual(['kitchen']);
  });

  it('never prunes adopted displays even when stale', () => {
    const realNow = Date.now;
    const longAgo = realNow() - 10 * 60 * 1000;
    try {
      Date.now = () => longAgo;
      drainCommands('kitchen');
    } finally {
      Date.now = realNow;
    }
    // 'kitchen' is in the config (configDisplayIds), so it's NOT unadopted
    // and NOT subject to pruning. Its statusMap entry stays.
    getUnadoptedDisplays(['kitchen']);
    expect(getDisplayStatus('kitchen')?.lastSeen).toBe(longAgo);
  });
});

describe('viewport reports (per-client tracking)', () => {
  it('records and returns a single viewport per client', () => {
    recordViewportReport('kitchen', 'client-a', 1920, 1080);
    const reports = getViewportReports('kitchen');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ width: 1920, height: 1080 });
  });

  it('tracks multiple distinct clients posting different viewports', () => {
    recordViewportReport('home-screens', 'client-a', 1440, 2560);
    recordViewportReport('home-screens', 'client-b', 1024, 768);
    const reports = getViewportReports('home-screens');
    expect(reports).toHaveLength(2);
    // Most recent first (client-b was recorded later)
    expect(reports.map((r) => `${r.width}x${r.height}`).sort()).toEqual([
      '1024x768',
      '1440x2560',
    ]);
  });

  it('keeps clients with identical viewports as distinct rows', () => {
    // Intentionally not deduped: two devices with the same resolution
    // but different source IPs need to appear as two rows in the editor
    // so the user can trace the phantom reporter by address.
    recordViewportReport('home-screens', 'client-a', 1440, 2560, '192.168.1.10');
    recordViewportReport('home-screens', 'client-b', 1440, 2560, '192.168.1.20');
    const reports = getViewportReports('home-screens');
    expect(reports).toHaveLength(2);
    expect(reports.map((r) => r.clientAddress).sort()).toEqual([
      '192.168.1.10',
      '192.168.1.20',
    ]);
  });

  it('records the client source address when provided', () => {
    recordViewportReport('kitchen', 'client-a', 1920, 1080, '10.0.0.5');
    const reports = getViewportReports('kitchen');
    expect(reports[0].clientAddress).toBe('10.0.0.5');
  });

  it('updates an existing client when it re-reports', () => {
    recordViewportReport('kitchen', 'client-a', 1024, 768);
    recordViewportReport('kitchen', 'client-a', 1920, 1080);
    const reports = getViewportReports('kitchen');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ width: 1920, height: 1080 });
  });

  it('rejects invalid display ids', () => {
    recordViewportReport('INVALID', 'client-a', 1920, 1080);
    expect(getViewportReports('INVALID')).toEqual([]);
  });

  it('rejects empty client ids', () => {
    recordViewportReport('kitchen', '', 1920, 1080);
    expect(getViewportReports('kitchen')).toEqual([]);
  });

  it('rejects non-positive dimensions', () => {
    recordViewportReport('kitchen', 'client-a', 0, 1080);
    recordViewportReport('kitchen', 'client-b', 1920, -1);
    recordViewportReport('kitchen', 'client-c', Infinity, 1080);
    expect(getViewportReports('kitchen')).toEqual([]);
  });

  it('caps the number of distinct clients per display', () => {
    // Fill the map to its cap (16)
    for (let i = 0; i < 16; i++) {
      recordViewportReport('kitchen', `client-${i}`, 100 + i, 200 + i);
    }
    // 17th new client should be refused (distinct dims so no dedup)
    recordViewportReport('kitchen', 'client-overflow', 9999, 9999);
    const reports = getViewportReports('kitchen');
    expect(reports.length).toBeLessThanOrEqual(16);
    expect(reports.find((r) => r.width === 9999)).toBeUndefined();
  });

  it('updates accepted from existing clients even past the cap', () => {
    for (let i = 0; i < 16; i++) {
      recordViewportReport('kitchen', `client-${i}`, 100 + i, 200 + i);
    }
    // Existing client bumping its value still works
    recordViewportReport('kitchen', 'client-0', 5000, 6000);
    const reports = getViewportReports('kitchen');
    expect(reports.find((r) => r.width === 5000 && r.height === 6000)).toBeTruthy();
  });
});

describe('shared-state reports', () => {
  it('records and returns a valid snapshot for a display', () => {
    recordSharedStateReport('kitchen', {
      'plugin:ha:door': { value: 'open', updatedAt: 1234 },
    });
    const report = getSharedStateReport('kitchen');
    expect(report).not.toBeNull();
    expect(report!.entries['plugin:ha:door']).toEqual({ value: 'open', updatedAt: 1234 });
    expect(report!.reportedAt).toBeTypeOf('number');
  });

  it('uses the legacy default slot when displayId is omitted', () => {
    recordSharedStateReport(undefined, { 'host.key': { value: 'x', updatedAt: 1 } });
    expect(getSharedStateReport()!.entries['host.key']?.value).toBe('x');
    expect(getSharedStateReport('kitchen')).toBeNull();
  });

  it('skips malformed keys and entries instead of rejecting the whole report', () => {
    recordSharedStateReport('kitchen', {
      'UPPER:invalid': { value: 'x', updatedAt: 1 },
      'ok.key': { value: 'kept', updatedAt: 1 },
      'missing.value': { updatedAt: 1 },
      'bad.updated': { value: 'x', updatedAt: 'nope' },
      'not.object': 'x',
    });
    const report = getSharedStateReport('kitchen');
    expect(Object.keys(report!.entries)).toEqual(['ok.key']);
  });

  it('rejects non-object payloads and invalid display ids', () => {
    recordSharedStateReport('kitchen', 'garbage');
    recordSharedStateReport('kitchen', ['array']);
    expect(getSharedStateReport('kitchen')).toBeNull();
    recordSharedStateReport('NOT VALID', { 'ok.key': { value: 'x', updatedAt: 1 } });
    expect(getSharedStateReport('NOT VALID')).toBeNull();
  });

  it('drops values over the length cap', () => {
    recordSharedStateReport('kitchen', {
      'too.long': { value: 'x'.repeat(2000), updatedAt: 1 },
      'ok.key': { value: 'v', updatedAt: 1 },
    });
    const report = getSharedStateReport('kitchen');
    expect(report!.entries['too.long']).toBeUndefined();
    expect(report!.entries['ok.key']?.value).toBe('v');
  });

  it('rejects a payload with more keys than a real display could ever publish', () => {
    // The client bus caps at 256 keys, so an oversized payload is a
    // malicious or broken poster — dropped wholesale, not trimmed.
    const raw: Record<string, { value: string; updatedAt: number }> = {};
    for (let i = 0; i < 300; i++) {
      raw[`key.${String(i).padStart(3, '0')}`] = { value: 'v', updatedAt: 1 };
    }
    recordSharedStateReport('kitchen', raw);
    expect(getSharedStateReport('kitchen')).toBeNull();
  });

  it('an empty snapshot overwrites a previous one (producer went quiet)', () => {
    recordSharedStateReport('kitchen', { 'ok.key': { value: 'x', updatedAt: 1 } });
    recordSharedStateReport('kitchen', {});
    expect(getSharedStateReport('kitchen')!.entries).toEqual({});
  });

  it('keeps a tombstoned entry with its staleAt', () => {
    // The display holds a cleared key for a 15s grace window and still
    // evaluates conditions against it, so the report has to carry the
    // tombstone. Dropping it made the editor's verdict disagree with the
    // screen for that whole window.
    recordSharedStateReport('kitchen', {
      'plugin:ha:door': { value: 'open', updatedAt: 1000, staleAt: 2000 },
    });
    expect(getSharedStateReport('kitchen')!.entries['plugin:ha:door']).toEqual({
      value: 'open', updatedAt: 1000, staleAt: 2000,
    });
  });

  it('ignores a malformed staleAt rather than dropping the entry', () => {
    recordSharedStateReport('kitchen', {
      'a.key': { value: 'x', updatedAt: 1, staleAt: 'soon' },
      'b.key': { value: 'y', updatedAt: 1, staleAt: Infinity },
    });
    const entries = getSharedStateReport('kitchen')!.entries;
    // Still live entries, just without a (nonsensical) tombstone marker.
    expect(entries['a.key']).toEqual({ value: 'x', updatedAt: 1 });
    expect(entries['b.key']).toEqual({ value: 'y', updatedAt: 1 });
  });
});

/**
 * Mirrors the `shared-state reports` block above against the provider-health
 * twin. The two ingest the same shape of untrusted heartbeat payload, but only
 * the shared-state side had a sanitizer suite — the health side was referenced
 * in exactly one file, mocked with `vi.fn()`. Every branch below was live in
 * production with nothing failing in CI if it regressed: a broken TTL leaves a
 * resolved outage showing a permanent "provider unhealthy" banner under
 * Settings > Automation > Live, and a malformed payload from an out-of-date
 * plugin could poison the map.
 */
describe('provider-health reports', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and returns a well-formed report', () => {
    recordProviderHealthReport('kitchen', {
      ha: { message: 'service unreachable', since: 1234 },
    });
    const report = getProviderHealthReport('kitchen');
    expect(report).not.toBeNull();
    expect(report!.health.ha).toEqual({ message: 'service unreachable', since: 1234 });
    expect(report!.reportedAt).toBeTypeOf('number');
  });

  it('lowercases plugin ids so the editor lookup cannot miss on case', () => {
    recordProviderHealthReport('kitchen', { HomeAssistant: { message: 'down', since: 1 } });
    expect(getProviderHealthReport('kitchen')!.health).toHaveProperty('homeassistant');
  });

  it('uses the legacy default slot when displayId is omitted', () => {
    recordProviderHealthReport(undefined, { ha: { message: 'down', since: 1 } });
    expect(getProviderHealthReport()!.health.ha?.message).toBe('down');
    expect(getProviderHealthReport('kitchen')).toBeNull();
  });

  it('skips out-of-charset plugin ids and malformed entries, keeping the rest', () => {
    recordProviderHealthReport('kitchen', {
      'bad id!': { message: 'x', since: 1 },
      'ok-plugin': { message: 'kept', since: 1 },
      missingMessage: { since: 1 },
      badSince: { message: 'x', since: 'nope' },
      notObject: 'x',
      infiniteSince: { message: 'x', since: Infinity },
    });
    expect(Object.keys(getProviderHealthReport('kitchen')!.health)).toEqual(['ok-plugin']);
  });

  it('rejects non-object payloads and invalid display ids', () => {
    recordProviderHealthReport('kitchen', 'garbage');
    recordProviderHealthReport('kitchen', ['array']);
    expect(getProviderHealthReport('kitchen')).toBeNull();
    recordProviderHealthReport('NOT VALID', { ha: { message: 'x', since: 1 } });
    expect(getProviderHealthReport('NOT VALID')).toBeNull();
  });

  it('drops messages over the 200-char cap', () => {
    recordProviderHealthReport('kitchen', {
      chatty: { message: 'x'.repeat(500), since: 1 },
      terse: { message: 'ok', since: 1 },
    });
    const health = getProviderHealthReport('kitchen')!.health;
    expect(health.chatty).toBeUndefined();
    expect(health.terse?.message).toBe('ok');
  });

  it('rejects a payload with more entries than a real display could publish', () => {
    // The client store caps at 64, so an oversized payload is malicious or
    // broken — dropped wholesale, not trimmed.
    const raw: Record<string, { message: string; since: number }> = {};
    for (let i = 0; i < 100; i++) raw[`plugin-${i}`] = { message: 'down', since: 1 };
    recordProviderHealthReport('kitchen', raw);
    expect(getProviderHealthReport('kitchen')).toBeNull();
  });

  it('an empty snapshot overwrites a previous one (outage resolved)', () => {
    recordProviderHealthReport('kitchen', { ha: { message: 'down', since: 1 } });
    recordProviderHealthReport('kitchen', {});
    expect(getProviderHealthReport('kitchen')!.health).toEqual({});
  });

  it('evicts a report past the TTL instead of serving a stale outage forever', () => {
    vi.useFakeTimers();
    recordProviderHealthReport('kitchen', { ha: { message: 'down', since: 1 } });
    expect(getProviderHealthReport('kitchen')).not.toBeNull();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(getProviderHealthReport('kitchen')).toBeNull();
  });
});

describe('shared-state editor interest', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports interest per display after a mark, and none before', () => {
    expect(hasSharedStateInterest('kitchen')).toBe(false);
    markSharedStateInterest('kitchen');
    expect(hasSharedStateInterest('kitchen')).toBe(true);
    expect(hasSharedStateInterest('bedroom')).toBe(false);
  });

  it('tracks the legacy slot when no display id is given', () => {
    markSharedStateInterest();
    expect(hasSharedStateInterest()).toBe(true);
    expect(hasSharedStateInterest('kitchen')).toBe(false);
  });

  it('expires interest after the TTL so idle displays fall back to the slow heartbeat', () => {
    vi.useFakeTimers();
    markSharedStateInterest('kitchen');
    vi.advanceTimersByTime(15_001);
    expect(hasSharedStateInterest('kitchen')).toBe(false);
  });

  it('ignores invalid display ids', () => {
    markSharedStateInterest('NOT VALID');
    expect(hasSharedStateInterest('NOT VALID')).toBe(false);
  });
});

/**
 * The `knownDisplays` / MAX_KNOWN_DISPLAYS gate on both untrusted-heartbeat
 * ingest paths. It is the backstop that stops a spoofed or misconfigured poster
 * from growing the in-memory maps past the display ceiling — and it was the one
 * branch neither sanitizer covered, on either twin.
 */
describe('report ingest respects the known-display cap', () => {
  /** Register the cap's worth of displays the way a real Pi does — by polling. */
  function fillKnownDisplays() {
    for (let i = 0; i < 64; i++) drainCommands(`display-${i}`);
  }

  it('drops a shared-state report from an unregistered display once the cap is reached', () => {
    fillKnownDisplays();
    recordSharedStateReport('stranger', { 'a.key': { value: 'x', updatedAt: 1 } });
    expect(getSharedStateReport('stranger')).toBeNull();
  });

  it('drops a provider-health report from an unregistered display once the cap is reached', () => {
    fillKnownDisplays();
    recordProviderHealthReport('stranger', { ha: { message: 'down', since: 1 } });
    expect(getProviderHealthReport('stranger')).toBeNull();
  });

  it('still accepts reports from displays registered before the cap was hit', () => {
    fillKnownDisplays();
    // display-0 is inside the cap, so its reports must keep landing — the gate
    // refuses NEW ids, it does not freeze the whole hub.
    recordSharedStateReport('display-0', { 'a.key': { value: 'x', updatedAt: 1 } });
    recordProviderHealthReport('display-0', { ha: { message: 'down', since: 1 } });
    expect(getSharedStateReport('display-0')!.entries['a.key']?.value).toBe('x');
    expect(getProviderHealthReport('display-0')!.health.ha?.message).toBe('down');
  });

  it('accepts an unknown id while there is still room under the cap', () => {
    recordSharedStateReport('newcomer', { 'a.key': { value: 'x', updatedAt: 1 } });
    expect(getSharedStateReport('newcomer')).not.toBeNull();
  });
});
