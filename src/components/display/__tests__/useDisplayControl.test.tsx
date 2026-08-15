// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDisplayControl } from '../useDisplayControl';
import type { CommandHandlers } from '@/hooks/useDisplayCommands';

/**
 * Remote navigation implies wake when the content is hidden (issue #26):
 * changing screens on a sleeping display used to "work" invisibly under the
 * opaque sleep overlay. These tests pin the wiring — each remote nav handler
 * calls the sleep manager's `wakeIfHidden` (which owns the asleep/dimmed/
 * override gating and the schedule-window hold; see
 * sleep-manager-wake-hold.test.tsx for that behavior) alongside the
 * navigation itself, while the plain `wake` command stays on `wake`.
 */

const mocks = vi.hoisted(() => ({
  wake: vi.fn(),
  wakeIfHidden: vi.fn(),
  forceSleep: vi.fn(),
  setRemoteBrightness: vi.fn(),
  capturedHandlers: null as CommandHandlers | null,
}));

vi.mock('@/hooks/useSleepManager', () => ({
  useSleepManager: () => ({
    displayState: 'asleep',
    dimOpacity: 1,
    wake: mocks.wake,
    wakeIfHidden: mocks.wakeIfHidden,
    forceSleep: mocks.forceSleep,
    setRemoteBrightness: mocks.setRemoteBrightness,
  }),
}));

vi.mock('@/hooks/useDisplayCommands', () => ({
  useDisplayCommands: (handlers: CommandHandlers) => {
    mocks.capturedHandlers = handlers;
  },
  useStatusReporter: () => {},
}));

function renderControl() {
  const nextScreen = vi.fn();
  const prevScreen = vi.fn();
  const gotoScreen = vi.fn();
  const resetRotation = vi.fn();
  renderHook(() =>
    useDisplayControl({
      sleep: undefined,
      timezone: undefined,
      screenIndex: 0,
      screenId: 's1',
      screenName: 'Screen 1',
      screenCount: 2,
      activeProfile: null,
      nextScreen,
      prevScreen,
      gotoScreen,
      resetRotation,
    }),
  );
  return { nextScreen, prevScreen, gotoScreen, resetRotation };
}

describe('useDisplayControl remote navigation wakes a hidden display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.capturedHandlers = null;
  });

  it('next-screen wakes via wakeIfHidden', () => {
    const { nextScreen, resetRotation } = renderControl();
    mocks.capturedHandlers!.nextScreen();
    expect(mocks.wakeIfHidden).toHaveBeenCalledTimes(1);
    expect(nextScreen).toHaveBeenCalledTimes(1);
    expect(resetRotation).toHaveBeenCalledTimes(1);
  });

  it('prev-screen wakes via wakeIfHidden', () => {
    const { prevScreen } = renderControl();
    mocks.capturedHandlers!.prevScreen();
    expect(mocks.wakeIfHidden).toHaveBeenCalledTimes(1);
    expect(prevScreen).toHaveBeenCalledTimes(1);
  });

  it('goto-screen wakes and still forwards the target', () => {
    const { gotoScreen } = renderControl();
    mocks.capturedHandlers!.gotoScreen('kitchen');
    expect(mocks.wakeIfHidden).toHaveBeenCalledTimes(1);
    expect(gotoScreen).toHaveBeenCalledWith('kitchen');
  });

  it('the wake command stays wired to the plain wake handler', () => {
    renderControl();
    mocks.capturedHandlers!.wake();
    expect(mocks.wake).toHaveBeenCalledWith();
    expect(mocks.wakeIfHidden).not.toHaveBeenCalled();
  });
});
