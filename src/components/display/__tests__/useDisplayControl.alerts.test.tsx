// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useDisplayControl } from '../useDisplayControl';
import { useAlertStore } from '@/stores/alert-store';
import type { CommandHandlers } from '@/hooks/useDisplayCommands';

/**
 * Alerts go through useDisplayControl.showAlert, not straight into the store,
 * for the night case: an urgent alert (smoke, CO, weather) must wake a
 * sleeping display and the wake must end with the alert; a routine alert
 * that arrives while asleep is dropped, not shown hours later.
 */

const mocks = vi.hoisted(() => ({
  wakeForAlert: vi.fn(),
  releaseAlertWake: vi.fn(),
  displayState: 'active' as 'active' | 'dimmed' | 'asleep',
  capturedHandlers: null as CommandHandlers | null,
}));

vi.mock('@/hooks/useSleepManager', () => ({
  useSleepManager: () => ({
    displayState: mocks.displayState,
    dimOpacity: 0,
    wake: vi.fn(),
    wakeIfHidden: vi.fn(),
    forceSleep: vi.fn(),
    setRemoteBrightness: vi.fn(),
    wakeForAlert: mocks.wakeForAlert,
    releaseAlertWake: mocks.releaseAlertWake,
    getDisplayState: () => mocks.displayState,
  }),
}));

vi.mock('@/hooks/useDisplayCommands', () => ({
  useDisplayCommands: (handlers: CommandHandlers) => {
    mocks.capturedHandlers = handlers;
  },
  useStatusReporter: () => {},
}));

function renderControl() {
  return renderHook(() =>
    useDisplayControl({
      sleep: undefined,
      timezone: undefined,
      screenIndex: 0,
      screenId: 's1',
      screenName: 'Screen 1',
      screenCount: 1,
      activeProfile: null,
      nextScreen: vi.fn(),
      prevScreen: vi.fn(),
      gotoScreen: vi.fn(),
      resetRotation: vi.fn(),
    }),
  );
}

describe('useDisplayControl showAlert', () => {
  // Unmount between tests: the hook subscribes to the shared alert store, and
  // a leaked subscription would count releases from earlier tests.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.displayState = 'active';
    useAlertStore.getState().clearAlerts();
    useAlertStore.getState().configure({ enabled: true, maxVisible: 3, defaultDuration: 0 });
  });

  it('shows a routine alert on an active display without waking', () => {
    renderControl();
    act(() => { mocks.capturedHandlers!.showAlert({ type: 'info', title: 'Dinner at 6', message: '' }); });
    expect(useAlertStore.getState().alerts).toHaveLength(1);
    expect(mocks.wakeForAlert).not.toHaveBeenCalled();
  });

  it('drops a routine alert that arrives while asleep', () => {
    mocks.displayState = 'asleep';
    renderControl();
    act(() => { mocks.capturedHandlers!.showAlert({ type: 'info', title: 'Dinner at 6', message: '' }); });
    expect(useAlertStore.getState().alerts).toHaveLength(0);
    expect(mocks.wakeForAlert).not.toHaveBeenCalled();
  });

  it('an urgent alert shows and wakes, even while asleep', () => {
    mocks.displayState = 'asleep';
    renderControl();
    act(() => { mocks.capturedHandlers!.showAlert({ type: 'urgent', title: 'Smoke detected', message: 'Basement' }); });
    expect(useAlertStore.getState().alerts).toHaveLength(1);
    expect(mocks.wakeForAlert).toHaveBeenCalledTimes(1);
  });

  it('a routine alert sent with wake: true also wakes', () => {
    mocks.displayState = 'asleep';
    renderControl();
    act(() => { mocks.capturedHandlers!.showAlert({ type: 'warning', title: 'Bus in 10 minutes', message: '', wake: true }); });
    expect(useAlertStore.getState().alerts).toHaveLength(1);
    expect(mocks.wakeForAlert).toHaveBeenCalledTimes(1);
  });

  it('releases the wake when the last urgent alert is dismissed, and not before', () => {
    renderControl();
    act(() => {
      mocks.capturedHandlers!.showAlert({ type: 'urgent', title: 'Tornado warning', message: '' });
      mocks.capturedHandlers!.showAlert({ type: 'info', title: 'Dinner', message: '' });
    });
    const [urgent, info] = useAlertStore.getState().alerts;
    act(() => { useAlertStore.getState().dismissAlert(info.id); });
    expect(mocks.releaseAlertWake).not.toHaveBeenCalled();
    act(() => { useAlertStore.getState().dismissAlert(urgent.id); });
    expect(mocks.releaseAlertWake).toHaveBeenCalledTimes(1);
  });

  it('clear-alerts releases the wake too', () => {
    renderControl();
    act(() => { mocks.capturedHandlers!.showAlert({ type: 'urgent', title: 'Tornado warning', message: '' }); });
    act(() => { useAlertStore.getState().clearAlerts(); });
    expect(mocks.releaseAlertWake).toHaveBeenCalledTimes(1);
  });
});
