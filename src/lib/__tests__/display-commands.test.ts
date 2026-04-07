import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueCommand,
  drainCommands,
  setDisplayStatus,
  getDisplayStatus,
  getAllDisplayStatuses,
  getUnadoptedDisplays,
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
});
