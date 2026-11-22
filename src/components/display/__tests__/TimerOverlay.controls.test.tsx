// @vitest-environment jsdom

/**
 * The running timer's buttons on the wall: a tap brings them up for
 * TIMER_CONTROLS_IDLE_MS, they stay up while paused, Stop has to be held,
 * a step waiting for its "Done!" keeps the whole screen as that button, and a
 * tap closes "Time's up!" on this display. The hub is faked with the same
 * session rules the route runs, so each press round-trips like the real one.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { publishRevisions } from '@/lib/display-heartbeat';
import { TIMES_UP_HOLD_MS, addMinute, advanceStep, cancelSession, materializeSession, pauseSession, resumeSession, startSession } from '@/lib/timer-logic';
import { __resetTimerPresenceForTests, requestTimerRefresh } from '@/lib/timer-presence';
import type { Routine, TimerSession } from '@/types/timers';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));
vi.mock('../timer-views/RingTimerView', () => ({ default: () => <div data-testid="ring" /> }));
vi.mock('../timer-views/FaceTimerView', () => ({ default: () => null }));
vi.mock('../timer-views/CascadeTimerView', () => ({ default: () => null }));
vi.mock('../timer-views/PathTimerView', () => ({ default: () => null }));
vi.mock('../timer-views/TimerCelebration', () => ({ default: () => <div data-testid="celebration" /> }));
vi.mock('../timer-views/timer-sounds', () => ({ playTimerSound: vi.fn() }));

let session: TimerSession | null = null;
const posted: string[] = [];

const RULES: Record<string, (s: TimerSession, now: number) => TimerSession> = {
  pause: pauseSession,
  resume: resumeSession,
  'add-minute': addMinute,
  'step-done': advanceStep,
  cancel: cancelSession,
};

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const { action } = JSON.parse(String(init.body)) as { action: string };
      posted.push(action);
      if (session) session = RULES[action](materializeSession(session, Date.now())!, Date.now());
    }
    return { ok: true, json: async () => ({ session }) };
  },
}));

import TimerOverlay, { TIMER_CONTROLS_IDLE_MS } from '../TimerOverlay';

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function showSession(s: TimerSession, revision: string) {
  session = s;
  await act(async () => {
    publishRevisions({ timer: revision });
    await vi.advanceTimersByTimeAsync(0);
  });
}

const tapScreen = () => fireEvent.click(screen.getByTestId('timer-overlay'));
const controls = () => screen.queryByTestId('timer-controls');

function quick(durationSec: number): TimerSession {
  return startSession({ kind: 'quick', durationSec, targets: 'all', view: 'ring' }, Date.now());
}

const TAP_ROUTINE: Routine = {
  id: 'r', name: 'Morning', view: 'ring', sound: false,
  steps: [
    { id: 'a', label: 'Make your bed', icon: '🛏️', durationSec: 5, waitForTap: true },
    { id: 'b', label: 'Get dressed', icon: '👕', durationSec: 300 },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  session = null;
  posted.length = 0;
  __resetTimerPresenceForTests();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TimerOverlay buttons', () => {
  it('show for the first wait of a new timer, then come back on a tap; each touch starts the wait again', async () => {
    render(<TimerOverlay />);
    await showSession(quick(600), 't1');
    expect(controls()).not.toBeNull();
    await settle(TIMER_CONTROLS_IDLE_MS);
    expect(controls()).toBeNull();

    // The same timer read again does not bring them back by itself.
    await showSession(session!, 't2');
    expect(controls()).toBeNull();

    tapScreen();
    expect(controls()).not.toBeNull();
    await settle(TIMER_CONTROLS_IDLE_MS - 1000);
    tapScreen();
    await settle(TIMER_CONTROLS_IDLE_MS - 1000);
    expect(controls()).not.toBeNull();
    await settle(1000);
    expect(controls()).toBeNull();
  });

  it('pause stays up with Resume and the paused word, on its own, until resumed', async () => {
    render(<TimerOverlay />);
    await showSession(quick(600), 't1');
    tapScreen();
    fireEvent.click(screen.getByTestId('timer-pause'));
    await settle();
    expect(posted).toEqual(['pause']);
    expect(screen.getByTestId('timer-resume')).toBeTruthy();
    expect(controls()!.textContent).toContain('timer.paused');

    await settle(TIMER_CONTROLS_IDLE_MS * 3);
    expect(screen.getByTestId('timer-resume')).toBeTruthy();

    fireEvent.click(screen.getByTestId('timer-resume'));
    await settle();
    expect(posted).toEqual(['pause', 'resume']);
    expect(screen.getByTestId('timer-pause')).toBeTruthy();
    await settle(TIMER_CONTROLS_IDLE_MS);
    expect(controls()).toBeNull();
  });

  it('a timer paused from the phone brings the buttons up on the wall without a tap', async () => {
    render(<TimerOverlay />);
    const s = quick(600);
    await showSession(s, 't1');
    await showSession(pauseSession(s, Date.now()), 't2');
    expect(screen.getByTestId('timer-resume')).toBeTruthy();
  });

  it('+1 min asks the hub for one more minute', async () => {
    render(<TimerOverlay />);
    await showSession(quick(600), 't1');
    tapScreen();
    fireEvent.click(screen.getByTestId('timer-add-minute'));
    await settle();
    expect(posted).toEqual(['add-minute']);
  });

  it('Stop does nothing on a short tap and stops the timer after a full hold', async () => {
    render(<TimerOverlay />);
    await showSession(quick(600), 't1');
    tapScreen();
    const stop = screen.getByLabelText('timer.stopHoldHint');

    fireEvent.pointerDown(stop);
    await settle(300);
    fireEvent.pointerUp(stop);
    await settle();
    expect(posted).toEqual([]);
    expect(screen.getByRole('status').textContent).toBe('timer.keepHoldingToStop');

    fireEvent.pointerDown(stop);
    await settle(1000);
    await settle();
    expect(posted).toEqual(['cancel']);
    expect(screen.queryByTestId('timer-overlay')).toBeNull();
  });

  it('a step waiting for its Done keeps the whole screen as that button, with no buttons', async () => {
    render(<TimerOverlay />);
    await showSession(startSession({ kind: 'routine', routine: TAP_ROUTINE, targets: 'all' }, Date.now()), 't1');
    await settle(6000);
    tapScreen();
    await settle();
    expect(posted).toEqual(['step-done']);
    expect(controls()).toBeNull();
  });

  it('keeps "Time\'s up!" up past the old 15 s until a tap', async () => {
    render(<TimerOverlay />);
    await showSession(quick(5), 't1');
    await settle(6000);
    await settle(5 * 60_000);
    expect(screen.getByTestId('celebration')).toBeTruthy();
    await settle(TIMES_UP_HOLD_MS);
    expect(screen.queryByTestId('timer-overlay')).toBeNull();
  });

  it('a tap closes "Time\'s up!" on this display at once', async () => {
    render(<TimerOverlay />);
    await showSession(quick(5), 't1');
    await settle(6000);
    expect(screen.getByTestId('celebration')).toBeTruthy();
    tapScreen();
    await settle();
    expect(screen.queryByTestId('timer-overlay')).toBeNull();
    expect(posted).toEqual([]);
  });

  it('reads the session at once when this display asks (the Timers sheet started one)', async () => {
    render(<TimerOverlay />);
    session = quick(600);
    await act(async () => {
      requestTimerRefresh();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('timer-overlay')).toBeTruthy();
  });
});
