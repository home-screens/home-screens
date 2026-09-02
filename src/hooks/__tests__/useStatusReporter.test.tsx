// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { sharedStateStore } from '@/lib/shared-state-store';
import { setShowingTimerSession, __resetTimerPresenceForTests } from '@/lib/timer-presence';
import { useAlertStore } from '@/stores/alert-store';
import { useStatusReporter, __resetSharedStateReportingForTests } from '../useDisplayCommands';

/**
 * Bus-change re-reporting on the status heartbeat. Contract under test:
 * - only armed while an editor is watching (commands-drain flag)
 * - throttled to one POST per 5s with a trailing report, so the last change
 *   in a burst always reaches the hub
 * - the POST body carries the snapshot with tombstoned entries filtered,
 *   sends ONE empty snapshot after the last key clears, then omits the field
 * - unmount cancels a pending trailing report
 */

const { displayFetchMock } = vi.hoisted(() => ({
  displayFetchMock: vi.fn(
    async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }),
  ),
}));

vi.mock('@/lib/display-fetch', () => ({ displayFetch: displayFetchMock }));

function renderReporter() {
  return renderHook(() => useStatusReporter(0, 'screen-1', 'Screen 1', 3, null, 'active', 100, 'kitchen'));
}

function statusBodies(): Array<Record<string, unknown>> {
  return displayFetchMock.mock.calls
    .filter(([url]) => url === '/api/display/status')
    .map((call) => JSON.parse((call[1] as RequestInit).body as string));
}

describe('useStatusReporter shared-state re-reporting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sharedStateStore.__resetForTests();
    __resetSharedStateReportingForTests(true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    displayFetchMock.mockClear();
    __resetSharedStateReportingForTests(false);
  });

  it('reports immediately on a bus change (leading edge) with the snapshot attached', () => {
    renderReporter();
    displayFetchMock.mockClear();

    act(() => sharedStateStore.publish('plugin:ha:door', 'open'));

    const bodies = statusBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].sharedState).toEqual({
      'plugin:ha:door': { value: 'open', updatedAt: expect.any(Number) },
    });
    expect(bodies[0].displayId).toBe('kitchen');
  });

  it('throttles a burst to one leading and one trailing report', () => {
    renderReporter();
    displayFetchMock.mockClear();

    act(() => {
      sharedStateStore.publish('k1', 'a'); // leading report
      sharedStateStore.publish('k2', 'b'); // arms trailing timer
      sharedStateStore.publish('k3', 'c'); // coalesced into the same timer
    });
    expect(statusBodies()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    const bodies = statusBodies();
    expect(bodies).toHaveLength(2);
    // The trailing report must carry the last change in the burst.
    expect((bodies[1].sharedState as Record<string, { value: string }>).k3.value).toBe('c');
  });

  it('does not re-report bus changes while no editor is watching', () => {
    __resetSharedStateReportingForTests(false);
    renderReporter();
    displayFetchMock.mockClear();

    act(() => {
      sharedStateStore.publish('k1', 'a');
      vi.advanceTimersByTime(10_000);
    });
    expect(statusBodies()).toHaveLength(0);
  });

  it('cancels a pending trailing report on unmount', () => {
    const { unmount } = renderReporter();
    displayFetchMock.mockClear();

    act(() => {
      sharedStateStore.publish('k1', 'a'); // leading
      sharedStateStore.publish('k2', 'b'); // trailing armed
    });
    expect(statusBodies()).toHaveLength(1);

    unmount();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(statusBodies()).toHaveLength(1);
  });

  it('ships tombstoned entries with staleAt, then one empty snapshot, then omits the field', () => {
    renderReporter();
    displayFetchMock.mockClear();

    act(() => sharedStateStore.publish('plugin:ha:door', 'open'));
    act(() => vi.advanceTimersByTime(6_000)); // past the throttle window

    // Clearing tombstones the entry. It is still reported, carrying `staleAt`:
    // the display's own evaluation keeps seeing the key through the grace
    // window, so filtering it here made the editor's verdict disagree with the
    // screen for those 15 seconds.
    act(() => sharedStateStore.clearKey('plugin:ha:door'));
    let bodies = statusBodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[1].sharedState).toMatchObject({
      'plugin:ha:door': { value: 'open', staleAt: expect.any(Number) },
    });

    // Once the grace window expires the entry is deleted for real, and THEN the
    // explicit empty snapshot goes out so the hub drops the value.
    act(() => vi.advanceTimersByTime(15_000));
    bodies = statusBodies();
    expect(bodies[bodies.length - 1].sharedState).toEqual({});

    // Next heartbeat with a still-empty bus omits the field entirely.
    act(() => vi.advanceTimersByTime(30_000));
    bodies = statusBodies();
    expect('sharedState' in bodies[bodies.length - 1]).toBe(false);
  });

  it('omits sharedState entirely when the bus has never had entries', () => {
    renderReporter(); // mount report happens with an empty bus
    const bodies = statusBodies();
    expect(bodies.length).toBeGreaterThan(0);
    expect('sharedState' in bodies[0]).toBe(false);
  });
});

/**
 * The family remote confirms its commands against three heartbeat fields
 * that live outside the reporter's props: brightness (a prop, part of the
 * immediate-report key), the timer session on screen, and the alert count.
 * Each must reach the hub on the spot, not on the next 30s beat.
 */
describe('useStatusReporter remote-confirmation fields', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sharedStateStore.__resetForTests();
    __resetSharedStateReportingForTests(false);
    __resetTimerPresenceForTests();
    useAlertStore.getState().clearAlerts();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    displayFetchMock.mockClear();
    useAlertStore.getState().clearAlerts();
  });

  it('carries brightness, the showing timer session and the alert count', () => {
    setShowingTimerSession('sess-9');
    useAlertStore.getState().showAlert({ type: 'info', title: 'Hi', message: '' });
    renderHook(() => useStatusReporter(0, 'screen-1', 'Screen 1', 3, null, 'dimmed', 40, 'kitchen'));

    const bodies = statusBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].brightness).toBe(40);
    expect(bodies[0].timerSessionId).toBe('sess-9');
    expect(bodies[0].activeAlerts).toBe(1);
  });

  it('re-reports immediately when brightness changes', () => {
    const { rerender } = renderHook(
      ({ brightness }) => useStatusReporter(0, 'screen-1', 'Screen 1', 3, null, 'dimmed', brightness, 'kitchen'),
      { initialProps: { brightness: 100 } },
    );
    displayFetchMock.mockClear();
    rerender({ brightness: 40 });
    const bodies = statusBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].brightness).toBe(40);
  });

  it('re-reports immediately when a timer takes the screen or an alert appears', () => {
    renderHook(() => useStatusReporter(0, 'screen-1', 'Screen 1', 3, null, 'active', 100, 'kitchen'));
    displayFetchMock.mockClear();

    act(() => setShowingTimerSession('sess-1'));
    expect(statusBodies().map((b) => b.timerSessionId)).toEqual(['sess-1']);

    act(() => useAlertStore.getState().showAlert({ type: 'warning', title: 'Dinner', message: '' }));
    const bodies = statusBodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[1].activeAlerts).toBe(1);
  });
});
