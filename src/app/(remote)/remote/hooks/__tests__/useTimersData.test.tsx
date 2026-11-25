// @vitest-environment jsdom

/**
 * The phone's timer buttons against a hub that runs the route's own rule: a
 * press names the timer the card shows, so one that another wall replaced a
 * moment ago is left alone, and the card catches up with no error.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { DisplayTargetContext } from '../../display-target';
import { pauseSession, pressIsForSession, startSession } from '@/lib/timer-logic';
import type { Routine, TimerSession } from '@/types/timers';

const translate = (key: string) => key;
vi.mock('@/i18n', () => ({ useTranslate: () => translate }));

const mocks = vi.hoisted(() => ({
  editorFetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(),
}));

// Keep `isSessionExpired` real so the hook sees the same error shape `editorFetch` throws.
vi.mock('@/lib/editor-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/editor-fetch')>();
  return { ...actual, editorFetch: mocks.editorFetch };
});

import { useTimersData } from '../useTimersData';

const ROUTINE: Routine = {
  id: 'r', name: 'Morning', view: 'ring', sound: false,
  steps: [
    { id: 'a', label: 'Make your bed', icon: '', durationSec: 300 },
    { id: 'b', label: 'Get dressed', icon: '', durationSec: 300 },
    { id: 'c', label: 'Shoes', icon: '', durationSec: 300 },
  ],
};

/** What the hub holds. */
let held: TimerSession | null = null;
/** Every control press as posted. */
let presses: Array<Record<string, unknown>> = [];

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function fakeHub(url: string, init?: RequestInit): Promise<Response> {
  if (url === '/api/timers/routines') return Promise.resolve(json(200, { routines: [ROUTINE], revision: 'r1' }));
  if (url !== '/api/timers/session') return Promise.resolve(json(404, {}));
  if (init?.method !== 'POST') return Promise.resolve(json(200, { session: held }));
  const body = JSON.parse(String(init.body)) as Record<string, unknown> & { action: string };
  presses.push(body);
  // The route's rule: a press for another timer or another step changes nothing.
  if (!held || !pressIsForSession(held, body as { sessionId?: unknown; stepIndex?: unknown })) {
    return Promise.resolve(json(404, { error: 'No timer is running', code: 'timers.notRunning' }));
  }
  if (body.action === 'pause') held = pauseSession(held, Date.now());
  if (body.action === 'skip') held = { ...held, stepIndex: held.stepIndex + 1, stepStartedAt: Date.now() };
  return Promise.resolve(json(200, { session: held }));
}

const quick = (durationSec: number) =>
  startSession({ kind: 'quick', durationSec, targets: 'all', view: 'ring' }, Date.now());

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    DisplayTargetContext.Provider,
    { value: { target: undefined, setTarget: () => {}, displays: [], timerTargetIds: [], setTimerTargetIds: () => {}, live: [] } },
    children,
  );
}

async function mounted() {
  const view = renderHook(() => useTimersData(), { wrapper });
  await waitFor(() => expect(view.result.current.live?.id).toBe(held?.id));
  return view;
}

beforeEach(() => {
  held = null;
  presses = [];
  mocks.editorFetch.mockReset().mockImplementation(fakeHub);
});

afterEach(() => {
  cleanup();
});

describe('useTimersData timer buttons', () => {
  it('name the timer the card shows, and the step for Skip', async () => {
    held = startSession({ kind: 'routine', routine: ROUTINE, targets: 'all' }, Date.now());
    const { result } = await mounted();
    const shown = result.current.live!;

    await act(async () => { await result.current.control('skip', shown); });
    await act(async () => { await result.current.control('pause', result.current.live!); });

    expect(presses).toEqual([
      { action: 'skip', sessionId: shown.id, stepIndex: 0 },
      { action: 'pause', sessionId: shown.id },
    ]);
    expect(result.current.live!.stepIndex).toBe(1);
    expect(result.current.live!.pausedAt).toBeDefined();
  });

  it('two quick Skips move on one step, not two', async () => {
    held = startSession({ kind: 'routine', routine: ROUTINE, targets: 'all' }, Date.now());
    const { result } = await mounted();
    const shown = result.current.live!;

    await act(async () => {
      await Promise.all([result.current.control('skip', shown), result.current.control('skip', shown)]);
    });

    expect(held!.stepIndex).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it('leave a timer another wall started a moment ago alone, and the card catches up with no error', async () => {
    held = quick(600);
    const { result } = await mounted();
    const shown = result.current.live!;
    // The kitchen wall starts a 5 minute timer; this phone has not polled yet.
    const replaced = quick(300);
    held = replaced;

    await act(async () => { await result.current.control('pause', shown); });

    expect(presses).toEqual([{ action: 'pause', sessionId: shown.id }]);
    // The kitchen's timer is not paused by a press meant for the old one.
    expect(held).toBe(replaced);
    expect(held.pausedAt).toBeUndefined();
    // The card shows the timer that is running now, and says nothing alarming.
    expect(result.current.live!.id).toBe(replaced.id);
    expect(result.current.error).toBeNull();
  });

  it('still say so when the hub turns a press down for another reason', async () => {
    held = quick(600);
    const { result } = await mounted();
    mocks.editorFetch.mockImplementation((url, init) => (
      init?.method === 'POST'
        ? Promise.resolve(json(400, { error: 'Unknown action', code: 'timers.badRequest' }))
        : fakeHub(url, init)
    ));

    await act(async () => { await result.current.control('pause', result.current.live!); });

    // Only "no timer is running" is the card catching up; anything else is
    // shown (as the shared words here, since the test's dictionary is empty).
    expect(result.current.error).toBe('refusals.failed');
  });
});
