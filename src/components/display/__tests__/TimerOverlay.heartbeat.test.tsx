// @vitest-environment jsdom

/**
 * TimerOverlay fetches the session only when the heartbeat names a new
 * revision (a start, skip, pause or cancel was saved) and derives everything
 * else on the display. The hub keeps a finished session on file, so no new
 * revision arrives when it expires: the overlay's own tick has to notice and
 * stop, or a wall would re-render four times a second until the next timer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { publishRevisions } from '@/lib/display-heartbeat';
import { SESSION_LINGER_MS, startSession } from '@/lib/timer-logic';
import type { TimerSession } from '@/types/timers';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));
vi.mock('../timer-views/RingTimerView', () => ({ default: () => <div data-testid="ring" /> }));
vi.mock('../timer-views/FaceTimerView', () => ({ default: () => null }));
vi.mock('../timer-views/CascadeTimerView', () => ({ default: () => null }));
vi.mock('../timer-views/PathTimerView', () => ({ default: () => null }));
vi.mock('../timer-views/TimerCelebration', () => ({ default: () => <div data-testid="celebration" /> }));
vi.mock('../timer-views/timer-sounds', () => ({ playTimerSound: vi.fn() }));

let session: TimerSession | null = null;
let sessionOk = true;
const fetchSession = vi.fn();

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: (url: string) => fetchSession(url),
}));

import TimerOverlay from '../TimerOverlay';

async function beat(timer: string) {
  await act(async () => {
    publishRevisions({ timer });
    await vi.advanceTimersByTimeAsync(0);
  });
}

function quickTimer(durationSec: number): TimerSession {
  return startSession({ kind: 'quick', durationSec, targets: 'all', view: 'ring' }, Date.now());
}

beforeEach(() => {
  vi.useFakeTimers();
  session = null;
  sessionOk = true;
  fetchSession.mockReset().mockImplementation(async () => ({ ok: sessionOk, json: async () => ({ session }) }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TimerOverlay follows the heartbeat', () => {
  it('fetches the session only when the beat names a new revision', async () => {
    render(<TimerOverlay />);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(fetchSession).not.toHaveBeenCalled();

    session = quickTimer(60);
    await beat('t1');
    expect(fetchSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('timer-overlay')).toBeTruthy();

    await beat('t1');
    expect(fetchSession).toHaveBeenCalledTimes(1);

    await beat('t2');
    expect(fetchSession).toHaveBeenCalledTimes(2);
  });

  it('retries a failed fetch on the next beat', async () => {
    render(<TimerOverlay />);
    sessionOk = false;
    await beat('t1');
    await beat('t1');
    expect(fetchSession).toHaveBeenCalledTimes(2);

    sessionOk = true;
    await beat('t1');
    await beat('t1');
    expect(fetchSession).toHaveBeenCalledTimes(3);
  });

  it('stops its local tick once a finished session has lingered out', async () => {
    render(<TimerOverlay />);
    session = quickTimer(5);
    await beat('t1');
    expect(screen.getByTestId('ring')).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    expect(screen.getByTestId('celebration')).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(SESSION_LINGER_MS); });
    expect(screen.queryByTestId('timer-overlay')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
