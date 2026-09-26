// @vitest-environment jsdom

/**
 * The command drain is the wall's one 3 s request to the hub. Its answer's
 * revisions go to the heartbeat readers, after the commands (which exist
 * nowhere else once drained). An editor preview reads the revisions alone,
 * and a refused beat still lets the wall notice a new build.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { subscribeRevisions, type DisplayRevisions } from '@/lib/display-heartbeat';
import type { CommandHandlers } from '../useDisplayCommands';

const REVISIONS: DisplayRevisions = { buildId: 'build-1', plugins: 'p1', config: '"c1"', timer: 't1' };

let beatStatus = 200;
// False plays a hub from before revisions existed, as after a rollback.
let answersRevisions = true;
let commands: unknown[] = [];
const fetched: string[] = [];

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: vi.fn(async (url: string) => {
    fetched.push(url);
    if (url === '/api/system/build-id') return { ok: true, text: async () => 'build-2' };
    return {
      ok: beatStatus === 200,
      status: beatStatus,
      json: async () => (url.startsWith('/api/display/commands')
        ? { commands, sharedStateWatched: false, ...(answersRevisions ? { revisions: REVISIONS } : {}) }
        : { revisions: REVISIONS }),
    };
  }),
}));

import { useDisplayCommands } from '../useDisplayCommands';

const order: string[] = [];
const published: DisplayRevisions[] = [];
let unsubscribe: () => void = () => {};

function handlers(): CommandHandlers {
  return {
    wake: () => order.push('wake'),
    sleep: vi.fn(),
    nextScreen: vi.fn(),
    prevScreen: vi.fn(),
    gotoScreen: vi.fn(),
    sleepOverride: vi.fn(),
    setBrightness: vi.fn(),
    reload: vi.fn(),
    showAlert: vi.fn(),
  };
}

async function flush(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  beatStatus = 200;
  answersRevisions = true;
  commands = [];
  fetched.length = 0;
  order.length = 0;
  published.length = 0;
  unsubscribe = subscribeRevisions((revisions) => {
    order.push('revisions');
    published.push(revisions);
  });
});

afterEach(() => {
  unsubscribe();
  cleanup();
  vi.useRealTimers();
});

describe('the display heartbeat', () => {
  it('drains this display, runs its commands, then hands on the revisions, every 3 s', async () => {
    commands = [{ type: 'wake', timestamp: 1 }];
    renderHook(() => useDisplayCommands(handlers(), 'kitchen'));
    await flush();

    expect(fetched).toEqual(['/api/display/commands?display=kitchen']);
    expect(order).toEqual(['wake', 'revisions']);
    expect(published).toEqual([REVISIONS]);

    commands = [];
    await flush(3_000);
    expect(fetched).toHaveLength(2);
    expect(published).toHaveLength(2);
  });

  it('in a preview, reads the revisions alone and runs no commands', async () => {
    commands = [{ type: 'wake', timestamp: 1 }];
    renderHook(() => useDisplayCommands(handlers(), 'kitchen', false));
    await flush();

    expect(fetched).toEqual(['/api/display/revisions']);
    expect(order).toEqual(['revisions']);
  });

  it('after a refused beat, hands on the build id from the public endpoint alone', async () => {
    beatStatus = 401;
    renderHook(() => useDisplayCommands(handlers()));
    await flush();

    expect(fetched).toEqual(['/api/display/commands', '/api/system/build-id']);
    expect(published).toEqual([{ buildId: 'build-2' }]);
  });

  it('on a hub that answers without revisions, runs the commands and still hands on the build id', async () => {
    answersRevisions = false;
    commands = [{ type: 'wake', timestamp: 1 }];
    renderHook(() => useDisplayCommands(handlers()));
    await flush();

    expect(fetched).toEqual(['/api/display/commands', '/api/system/build-id']);
    expect(order).toEqual(['wake', 'revisions']);
    expect(published).toEqual([{ buildId: 'build-2' }]);
  });
});
