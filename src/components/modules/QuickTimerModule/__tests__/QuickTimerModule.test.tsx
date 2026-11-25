// @vitest-environment jsdom

/**
 * The Quick Timer box against a faked hub that runs the route's own rules.
 * What is held here is what a family would notice: a timer kept in the box
 * says when it is over, a box that comes back with its screen already knows
 * a timer is running, a press names the timer it was made on, and a timer
 * that belongs to another wall is neither shown nor replaced.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { publishRevisions } from '@/lib/display-heartbeat';
import {
  addMinute, advanceStep, cancelSession, materializeSession, pauseSession, pressIsForSession,
  resumeSession, startSession, subtractMinute,
} from '@/lib/timer-logic';
import { __resetTimerPresenceForTests, getShowingTimerSession } from '@/lib/timer-presence';
import { STEP_SETTLE_MS } from '@/lib/sheet-tap-guard';
import type { Routine, TimerSession } from '@/types/timers';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));
vi.mock('@/hooks/useDisplayId', () => ({ useDisplayId: () => undefined }));
vi.mock('@/components/modules/ModuleWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/display/timer-views/RingTimerView', () => ({ default: () => <div data-testid="ring" /> }));
vi.mock('@/components/display/timer-views/TimerCelebration', () => ({ default: () => <div data-testid="celebration" /> }));
vi.mock('@/components/display/timer-views/timer-sounds', () => ({ playTimerSound: vi.fn() }));
// jsdom measures nothing, so the box falls back to its unmeasured size unless
// a test gives it one.
const measured = vi.hoisted(() => ({ box: { width: 0, height: 0 } }));
vi.mock('@/hooks/useElementBox', () => ({ useElementBox: () => [() => {}, measured.box] }));

let session: TimerSession | null = null;
const bodies: Array<Record<string, unknown>> = [];

const RULES: Record<string, (s: TimerSession, now: number) => TimerSession> = {
  pause: pauseSession,
  resume: resumeSession,
  'add-minute': addMinute,
  'subtract-minute': subtractMinute,
  'step-done': advanceStep,
  cancel: cancelSession,
};

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown> & { action: string };
      bodies.push(body);
      if (body.action === 'start') {
        session = startSession({
          kind: 'quick',
          durationSec: body.durationSec as number,
          targets: body.targets as 'all' | string[],
          view: 'ring',
          sound: false,
          fullScreen: body.fullScreen as boolean,
        }, Date.now());
      } else {
        const live = materializeSession(session, Date.now());
        if (live && pressIsForSession(live, body as { sessionId?: unknown; stepIndex?: unknown })) {
          const { awaitingTap, ...raw } = live;
          void awaitingTap;
          session = RULES[body.action](raw, Date.now());
        }
      }
    }
    return { ok: true, json: async () => ({ session }) };
  },
}));

import QuickTimerModule from '../index';
import TimerOverlay from '@/components/display/TimerOverlay';

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function beat(revision: string) {
  await act(async () => {
    publishRevisions({ timer: revision });
    await vi.advanceTimersByTimeAsync(0);
  });
}

const box = () => screen.getByTestId('quick-timer');
const state = () => box().getAttribute('data-state');
const tapPreset = (minutes: number) =>
  fireEvent.click(document.querySelector(`[data-testid="quick-timer-preset"][data-minutes="${minutes}"]`)!);

const boxed = (durationSec: number, targets: 'all' | string[] = 'all'): TimerSession =>
  startSession({ kind: 'quick', durationSec, targets, view: 'ring', fullScreen: false }, Date.now());

const style = {} as never;

/** What the box shows just changed (or it just mounted): wait until it takes taps again. */
const ready = () => settle(STEP_SETTLE_MS + 50);

beforeEach(() => {
  vi.useFakeTimers();
  session = null;
  bodies.length = 0;
  measured.box = { width: 0, height: 0 };
  __resetTimerPresenceForTests();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a timer kept in its box', () => {
  it('says "Time\'s up!" in the box when it ends, until a tap puts it away', async () => {
    render(<><QuickTimerModule key="box" config={{ fullScreen: false, presetMinutes: [1] }} style={style} /><TimerOverlay key="overlay" /></>);
    await ready();
    tapPreset(1);
    await settle();
    expect(state()).toBe('running');
    expect(screen.queryByTestId('timer-overlay')).toBeNull();

    await settle(61_000);
    expect(state()).toBe('finished');
    expect(screen.getByTestId('quick-timer-times-up').textContent).toContain('timer.timesUp');
    // The box has it, so the takeover stays down.
    expect(screen.queryByTestId('timer-overlay')).toBeNull();

    await ready();
    fireEvent.click(screen.getByTestId('quick-timer-times-up'));
    await settle();
    expect(state()).toBe('idle');
    expect(screen.queryByTestId('timer-overlay')).toBeNull();
  });

  it('is reported as showing on this wall, running and finished', async () => {
    render(<><QuickTimerModule key="box" config={{ fullScreen: false, presetMinutes: [1] }} style={style} /><TimerOverlay key="overlay" /></>);
    await ready();
    tapPreset(1);
    await settle();
    expect(getShowingTimerSession()).toBe(session!.id);
    await settle(61_000);
    expect(getShowingTimerSession()).toBe(session!.id);
  });

  it('ends on the whole screen when no box is up to say so', async () => {
    const { rerender } = render(<><QuickTimerModule key="box" config={{ fullScreen: false, presetMinutes: [1] }} style={style} /><TimerOverlay key="overlay" /></>);
    await ready();
    tapPreset(1);
    await settle();
    // The rotation moves on to a screen without the box. The takeover is
    // keyed so it stays mounted through the change, as it does on a wall.
    rerender(<><TimerOverlay key="overlay" /></>);
    await settle(30_000);
    expect(screen.queryByTestId('timer-overlay')).toBeNull();
    await settle(31_000);
    expect(screen.getByTestId('celebration')).toBeTruthy();
  });
});

describe('a box that comes back with its screen', () => {
  it('shows the running timer at once, with no wait for the next heartbeat', async () => {
    session = boxed(600);
    const { rerender } = render(<><TimerOverlay key="overlay" /></>);
    await beat('t1');

    rerender(<><QuickTimerModule key="box" config={{ fullScreen: false }} style={style} /><TimerOverlay key="overlay" /></>);
    expect(state()).toBe('running');
    expect(document.querySelector('[data-testid="quick-timer-preset"]')).toBeNull();
  });
});

describe('a tap on a length', () => {
  it('brings the full-screen timer up in the same read, not on the next heartbeat', async () => {
    render(<><QuickTimerModule key="box" config={{ presetMinutes: [5] }} style={style} /><TimerOverlay key="overlay" /></>);
    await ready();
    tapPreset(5);
    await settle();
    expect(screen.getByTestId('timer-overlay')).toBeTruthy();
  });
});

describe('a press in the box', () => {
  it('names the timer it was made on, and the step for "Done!"', async () => {
    const routine: Routine = {
      id: 'r', name: 'Morning', view: 'ring', sound: false,
      steps: [
        { id: 'a', label: 'Make your bed', icon: '', durationSec: 5, waitForTap: true },
        { id: 'b', label: 'Get dressed', icon: '', durationSec: 300 },
        { id: 'c', label: 'Shoes', icon: '', durationSec: 300 },
      ],
    };
    session = startSession({ kind: 'routine', routine, targets: 'all' }, Date.now());
    render(<QuickTimerModule style={style} />);
    await beat('t1');
    await settle(6_000);
    await ready();

    // Two taps before the first answer lands, as a child makes them.
    const done = screen.getByTestId('quick-timer-done');
    fireEvent.click(done);
    fireEvent.click(done);
    await settle();

    expect(bodies).toEqual([
      { action: 'step-done', sessionId: session!.id, stepIndex: 0 },
      { action: 'step-done', sessionId: session!.id, stepIndex: 0 },
    ]);
    // The second one is turned down: "Get dressed" is not skipped.
    expect(session!.stepIndex).toBe(1);
  });

  it('keeps the name the timer was started with after a minute is added', async () => {
    render(<QuickTimerModule config={{ fullScreen: false, presetMinutes: [5] }} style={style} />);
    await ready();
    tapPreset(5);
    await ready();
    fireEvent.click(screen.getByTestId('quick-timer-add'));
    await settle();
    expect(session!.steps[0].durationSec).toBe(360);
    expect(session!.quickSec).toBe(300);
  });
});

describe('a tap that was not meant for what is now under the finger', () => {
  it('a double tap on "Time\'s up!" closes it and starts nothing', async () => {
    render(<QuickTimerModule key="box" config={{ fullScreen: false, presetMinutes: [15] }} style={style} />);
    session = boxed(5);
    await beat('t1');
    await settle(6_000);
    await ready();
    const finishedId = session!.id;

    fireEvent.click(screen.getByTestId('quick-timer-times-up'));
    await settle(120);
    // The length now sits where "Time's up!" was.
    tapPreset(15);
    await settle();
    expect(state()).toBe('idle');
    expect(bodies).toEqual([]);
    expect(session!.id).toBe(finishedId);

    // A tap made after the moment has passed is a real one.
    await ready();
    tapPreset(15);
    await settle();
    expect(state()).toBe('running');
  });

  it('a second tap on a length does not land on the buttons that replace it', async () => {
    render(<QuickTimerModule key="box" config={{ fullScreen: false, presetMinutes: [5] }} style={style} />);
    await ready();
    tapPreset(5);
    await settle(120);
    fireEvent.click(screen.getByTestId('quick-timer-pause'));
    fireEvent.click(screen.getByTestId('quick-timer-subtract'));
    await settle();
    expect(bodies.map((b) => b.action)).toEqual(['start']);
  });

  it('lifting the finger that held Stop does not start the length that took its place', async () => {
    render(<QuickTimerModule key="box" config={{ fullScreen: false, presetMinutes: [15] }} style={style} />);
    await ready();
    tapPreset(15);
    await ready();
    session = cancelSession(session!, Date.now());
    await beat('stopped');
    await ready();
    bodies.length = 0;
    // The click a browser makes when a held touch lifts: it has a position
    // (detail 1) and no press of its own on the length.
    fireEvent.click(document.querySelector('[data-testid="quick-timer-preset"]')!, { detail: 1 });
    await settle();
    expect(bodies).toEqual([]);
    // A real tap goes down on the length first.
    fireEvent.pointerDown(document.querySelector('[data-testid="quick-timer-preset"]')!);
    fireEvent.click(document.querySelector('[data-testid="quick-timer-preset"]')!, { detail: 1 });
    await settle();
    expect(bodies.map((b) => b.action)).toEqual(['start']);
  });
});

describe('-1 min near the end', () => {
  const row = () => screen.getByTestId('quick-timer-pause').parentElement!;
  /** Let the countdown run until "-1 min" goes, a tick at a time. */
  const runUntilSubtractGoes = async () => {
    for (let i = 0; i < 40 && screen.queryByTestId('quick-timer-subtract'); i++) await settle(250);
  };

  it('goes as 2:00 turns to 1:59, the row closes up, and a tap landing there does nothing for a moment', async () => {
    render(<QuickTimerModule key="box" config={{ fullScreen: false, presetMinutes: [5] }} style={style} />);
    session = boxed(125);
    await beat('t1');
    await ready();
    expect(screen.getByTestId('quick-timer-subtract')).not.toBeNull();
    expect(row().style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');

    await runUntilSubtractGoes();
    expect(screen.queryByTestId('quick-timer-subtract')).toBeNull();
    expect(screen.getByTestId('quick-timer-remaining').textContent).toBe('1:59');
    // Three across, no hole where it was.
    expect(row().style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(screen.getByTestId('quick-timer-pause').style.gridColumn).toBe('');

    // A tap meant for "-1 min" lands on whatever slid into its place.
    fireEvent.click(screen.getByTestId('quick-timer-add'));
    fireEvent.click(screen.getByTestId('quick-timer-pause'));
    await settle();
    expect(bodies).toEqual([]);

    // Once the moment has passed the buttons answer, and a minute more
    // brings "-1 min" back.
    await ready();
    fireEvent.click(screen.getByTestId('quick-timer-add'));
    await settle();
    expect(bodies.map((b) => b.action)).toEqual(['add-minute']);
    expect(screen.getByTestId('quick-timer-subtract')).not.toBeNull();
    expect(row().style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
  });

  it('in a tall strip, gives Pause the top row so +1 min and Stop stay where they were', async () => {
    measured.box = { width: 200, height: 420 };
    render(<QuickTimerModule key="box" config={{ fullScreen: false, presetMinutes: [5] }} style={style} />);
    session = boxed(125);
    await beat('t1');
    await ready();
    expect(row().style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    expect(screen.getByTestId('quick-timer-subtract')).not.toBeNull();

    await runUntilSubtractGoes();
    expect(row().style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    expect(screen.getByTestId('quick-timer-pause').style.gridColumn).toBe('1 / -1');
    expect(screen.getByTestId('quick-timer-add')).not.toBeNull();
  });

  it('is never offered on a timer that starts under two minutes', async () => {
    render(<QuickTimerModule key="box" config={{ fullScreen: false, presetMinutes: [1] }} style={style} />);
    await ready();
    tapPreset(1);
    await ready();
    expect(state()).toBe('running');
    expect(screen.queryByTestId('quick-timer-subtract')).toBeNull();
    expect(screen.getByTestId('quick-timer-add')).not.toBeNull();
  });
});

describe('the heading', () => {
  it('is drawn by default and gone with "No title"', async () => {
    const { unmount } = render(<QuickTimerModule config={{ presetMinutes: [5] }} style={style} />);
    expect(box().textContent).toContain('quick-timer.title');
    unmount();
    render(<QuickTimerModule config={{ presetMinutes: [5], showTitle: false }} style={style} />);
    expect(box().textContent).not.toContain('quick-timer.title');
    expect(screen.getAllByTestId('quick-timer-preset')).toHaveLength(1);
  });

  it('is gone with "No title" while a timer runs in the box too', async () => {
    render(<QuickTimerModule key="box" config={{ fullScreen: false, presetMinutes: [5], showTitle: false }} style={style} />);
    await ready();
    tapPreset(5);
    await ready();
    expect(state()).toBe('running');
    expect(box().textContent).not.toContain('quick-timer.title');
  });
});

describe('a timer that belongs to another wall', () => {
  it('is not shown, cannot be controlled, and cannot be replaced from here', async () => {
    session = boxed(600, ['kitchen']);
    render(<QuickTimerModule config={{ presetMinutes: [5] }} style={style} renderDisplayId="hall" />);
    await beat('t1');

    expect(state()).toBe('busy');
    expect(screen.getByTestId('quick-timer-busy').textContent).toBe('quick-timer.busyElsewhere');
    expect(screen.queryByTestId('quick-timer-pause')).toBeNull();

    const kitchenTimer = session!.id;
    await ready();
    tapPreset(5);
    await settle();
    expect(bodies).toEqual([]);
    expect(session!.id).toBe(kitchenTimer);
  });

  it('gives the lengths back when that timer runs out by itself, with no word from the hub', async () => {
    session = boxed(60, ['kitchen']);
    render(<QuickTimerModule config={{ presetMinutes: [5] }} style={style} renderDisplayId="hall" />);
    await beat('t1');
    expect(state()).toBe('busy');
    // No new revision arrives when a timer simply ends.
    await settle(62_000);
    expect(state()).toBe('idle');
    await ready();
    tapPreset(5);
    await settle();
    expect(bodies.map((b) => b.action)).toEqual(['start']);
  });

  it('gives the lengths back once that timer is stopped', async () => {
    session = boxed(600, ['kitchen']);
    render(<QuickTimerModule config={{ presetMinutes: [5] }} style={style} renderDisplayId="hall" />);
    await beat('t1');
    session = cancelSession(session!, Date.now());
    await beat('t2');
    expect(state()).toBe('idle');
  });
});
