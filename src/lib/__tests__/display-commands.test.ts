import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueCommand,
  drainCommands,
  setDisplayStatus,
  getDisplayStatus,
  getAllDisplayStatuses,
  getUnadoptedDisplays,
  recordViewportReport,
  getViewportReports,
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
