// @vitest-environment jsdom

/**
 * The dock's Timers button and the sheet it opens: the family's routines and
 * the quick lengths, each started on this display by one tap, with the
 * phone's "start a new timer?" question when one is already running.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import DisplayControlModule from '..';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import { RotationProvider, type RotationState } from '@/components/display/rotation-context';
import { ModuleSurfaceProvider } from '@/components/modules/module-surface';
import { startSession } from '@/lib/timer-logic';
import { __resetTimerPresenceForTests, subscribeTimerRefresh } from '@/lib/timer-presence';
import type { Routine, TimerSession } from '@/types/timers';
import enUSModules from '@/translations/en-US/modules.json';
import enUSCore from '@/translations/en-US/core.json';

vi.mock('@/hooks/useDisplayId', () => ({ useDisplayId: () => 'kitchen' }));

const displays = [
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'hallway', name: 'Hallway' },
];
const rotation: RotationState = {
  screens: [{ id: 's1', name: 'Home', iconType: 'clock' }],
  allScreens: [{ id: 's1', name: 'Home', iconType: 'clock' }],
  activeScreenId: 's1',
  showScreen: vi.fn(),
};
const ROUTINES: Routine[] = [
  {
    id: 'bed', name: 'Bedtime', icon: '🌙', view: 'path', sound: false,
    steps: [
      { id: 'a', label: 'Pajamas on', icon: '👕', durationSec: 180 },
      { id: 'b', label: 'Brush teeth', icon: '🪥', durationSec: 120 },
      { id: 'c', label: 'Read together', icon: '📚', durationSec: 600 },
    ],
  },
];

const base = { layout: 'dock' as const, defaultTarget: 'self', allowRetargeting: false, compact: false, dockTimers: true };

let running: TimerSession | null = null;
let routinesOk = true;
const starts: unknown[] = [];

function wrap(children: ReactNode, surface: 'display' | 'editor' = 'display') {
  return (
    <ModuleSurfaceProvider value={surface}>
      <RotationProvider value={rotation}>
        <I18nProvider locale="en-US" blob={{ modules: enUSModules, core: enUSCore }}>{children}</I18nProvider>
      </RotationProvider>
    </ModuleSurfaceProvider>
  );
}

async function openSheet(config: Record<string, unknown> = base, list = displays) {
  render(wrap(<DisplayControlModule config={config as typeof base} availableDisplays={list} />));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Timers' }));
  });
}

beforeEach(() => {
  running = null;
  routinesOk = true;
  starts.length = 0;
  __resetTimerPresenceForTests();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/timers/routines')) {
      return routinesOk
        ? new Response(JSON.stringify({ routines: ROUTINES, revision: 'r1' }), { status: 200 })
        : new Response('{}', { status: 500 });
    }
    if (url.startsWith('/api/timers/session')) {
      if (init?.method === 'POST') {
        starts.push(JSON.parse(String(init.body)));
        return new Response('{}', { status: 200 });
      }
      return new Response(JSON.stringify({ session: running }), { status: 200 });
    }
    return new Response(null, { status: 200 });
  }));
});

afterEach(() => {
  cleanup();
  __resetLoaderForTests();
  vi.unstubAllGlobals();
});

describe('Dock Timers button', () => {
  it('is not in the dock unless switched on, and comes after the divider when it is', () => {
    render(wrap(<DisplayControlModule config={{ ...base, dockTimers: false }} availableDisplays={displays} />));
    expect(screen.queryByRole('button', { name: 'Timers' })).toBeNull();
    cleanup();
    render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />));
    expect(screen.getByRole('button', { name: 'Timers' })).toBeTruthy();
  });

  it('opens nothing in the editor, where a tap must not start a real timer', async () => {
    render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />, 'editor'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Timers' }));
    });
    expect(screen.queryByTestId('timers-sheet')).toBeNull();
  });

  it('lists the routines with their steps and length, and the quick lengths', async () => {
    await openSheet();
    expect(screen.getByTestId('timers-sheet')).toBeTruthy();
    expect(screen.getByText('Bedtime')).toBeTruthy();
    expect(screen.getByText('3 steps · 15 min')).toBeTruthy();
    expect(screen.getAllByTestId('timers-sheet-quick').map((b) => b.textContent)).toEqual(['30 sec', '1 min', '2 min', '5 min', '10 min', '15 min']);
  });

  it('starts a routine on this display alone, with its own look, then closes and asks the takeover to show it', async () => {
    const refreshed = vi.fn();
    subscribeTimerRefresh(refreshed);
    await openSheet();
    await act(async () => {
      fireEvent.click(screen.getByTestId('timers-sheet-routine'));
    });
    expect(starts).toEqual([{ action: 'start', kind: 'routine', routineId: 'bed', targets: ['kitchen'] }]);
    expect(refreshed).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('timers-sheet')).toBeNull();
  });

  it('starts a quick timer in Timer face with sound, everywhere on a hub with one display', async () => {
    await openSheet(base, []);
    await act(async () => {
      fireEvent.click(screen.getByText('5 min'));
    });
    expect(starts).toEqual([{ action: 'start', kind: 'quick', durationSec: 300, view: 'face', sound: true, targets: 'all' }]);
  });

  it('asks before replacing a timer already running on another display', async () => {
    running = startSession({ kind: 'quick', durationSec: 600, targets: ['hallway'] }, Date.now());
    await openSheet();
    await act(async () => {
      fireEvent.click(screen.getByText('1 min'));
    });
    expect(starts).toEqual([]);
    expect(screen.getByRole('alertdialog', { name: 'Start a new timer?' })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(starts).toEqual([]);

    await act(async () => {
      fireEvent.click(screen.getByText('1 min'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('timers-sheet-replace'));
    });
    expect(starts).toHaveLength(1);
    expect(screen.queryByTestId('timers-sheet')).toBeNull();
  });

  it('says where routines come from when there are none, and still offers quick timers', async () => {
    const empty = vi.fn(async (url: string) => (url.startsWith('/api/timers/routines')
      ? new Response(JSON.stringify({ routines: [], revision: 'r0' }), { status: 200 })
      : new Response(JSON.stringify({ session: null }), { status: 200 })));
    vi.stubGlobal('fetch', empty);
    await openSheet();
    expect(screen.getByText('Make routines on the phone, under Timers.')).toBeTruthy();
    expect(screen.getAllByTestId('timers-sheet-quick')).toHaveLength(6);
  });

  it('says so when the routines could not be read', async () => {
    routinesOk = false;
    await openSheet();
    expect(screen.getByText("Couldn't load your routines. Check the connection and try again.")).toBeTruthy();
  });
});
