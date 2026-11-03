// @vitest-environment jsdom

import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { addDays } from 'date-fns';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { LOOK_AHEAD_LIMIT_NOTICE_MS, SWIPE_OWNER_ATTR, useLookAhead } from '../useLookAhead';
import { calendarLookAhead, daySteps } from '@/lib/look-ahead';
import { WALL_SCROLL_IDLE_MS } from '@/lib/wall-scroll';
import { rotationIsHeld } from '@/lib/interaction-hold';
import { RotationProvider, type RotationState } from '@/components/display/rotation-context';
import { useLookAheadStore } from '@/stores/look-ahead-store';

const TODAY = new Date(2026, 10, 2);
const WEEK = calendarLookAhead({ viewMode: 'week' });

function rotation(activeScreenId: string): RotationState {
  return { screens: [], allScreens: [], activeScreenId, showScreen: () => {} };
}

beforeEach(() => {
  vi.useFakeTimers();
  useLookAheadStore.setState({ reaches: {}, span: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useLookAhead', () => {
  it('steps a week at a time from today, and the way back goes straight home', () => {
    const { result } = renderHook(() => useLookAhead({ step: WEEK, enabled: true, today: TODAY }));
    expect(result.current).toMatchObject({ on: true, offset: 0, away: false, anchor: TODAY });
    act(() => result.current.forward());
    act(() => result.current.forward());
    expect(result.current.offset).toBe(2);
    expect(result.current.anchor).toEqual(new Date(2026, 10, 16));
    act(() => result.current.back());
    expect(result.current.offset).toBe(1);
    act(() => result.current.home());
    expect(result.current).toMatchObject({ offset: 0, away: false });
  });

  /* A faded arrow said nothing, and a child took the wall for broken. */
  it('says how far the wall goes when an arrow is tapped past the end, for a moment', () => {
    const { result } = renderHook(() => useLookAhead({ step: WEEK, enabled: true, today: TODAY }));
    for (let i = 0; i < 8; i++) act(() => result.current.forward());
    expect(result.current).toMatchObject({ offset: 8, limit: null });
    act(() => result.current.forward());
    expect(result.current).toMatchObject({ offset: 8, limit: 'forward' });
    act(() => { vi.advanceTimersByTime(LOOK_AHEAD_LIMIT_NOTICE_MS + 10); });
    expect(result.current.limit).toBeNull();
    act(() => result.current.forward());
    act(() => result.current.back());
    // Stepping again clears the note at once.
    expect(result.current).toMatchObject({ offset: 7, limit: null });
  });

  /* Sam was tapping the meal plan beside it when the calendar slid back. */
  it('starts the minute again for a touch anywhere on the screen, not only on itself', () => {
    const { result } = renderHook(() => useLookAhead({ step: WEEK, enabled: true, today: TODAY }));
    act(() => result.current.forward());
    act(() => { vi.advanceTimersByTime(WALL_SCROLL_IDLE_MS - 5_000); });
    act(() => { window.dispatchEvent(new Event('pointerdown')); });
    act(() => { vi.advanceTimersByTime(WALL_SCROLL_IDLE_MS - 5_000); });
    expect(result.current.offset).toBe(1);
    act(() => { vi.advanceTimersByTime(5_001); });
    expect(result.current.offset).toBe(0);
  });

  /* Every tester swiped sideways on a calendar and lost the wall to the next screen. */
  it('steps with a sideways swipe on the module and keeps the screen swipe out of it', () => {
    const { result } = renderHook(() => useLookAhead({ step: WEEK, enabled: true, today: TODAY }));
    expect(result.current.rootProps[SWIPE_OWNER_ATTR]).toBe('');
    const swipe = (dx: number, ms = 200, dy = 0) => act(() => {
      const props = result.current.rootProps;
      props.onPointerDown!({ isPrimary: true, clientX: 500, clientY: 400, timeStamp: 1000, pointerId: 1 } as unknown as ReactPointerEvent);
      props.onPointerUp!({ isPrimary: true, clientX: 500 + dx, clientY: 400 + dy, timeStamp: 1000 + ms, pointerId: 1 } as unknown as ReactPointerEvent);
    });
    swipe(-300);
    expect(result.current.offset).toBe(1);
    swipe(300);
    swipe(300);
    expect(result.current.offset).toBe(-1);
    // A tap, a slow drag and a mostly vertical one step nothing.
    swipe(4);
    swipe(-300, 1500);
    swipe(-200, 200, 180);
    expect(result.current.offset).toBe(-1);
    // With taps off the module does not claim the swipe.
    const off = renderHook(() => useLookAhead({ step: WEEK, enabled: false, today: TODAY }));
    expect(off.result.current.rootProps).toEqual({});
  });

  it('stops at the reach either way', () => {
    const { result } = renderHook(() => useLookAhead({ step: WEEK, enabled: true, today: TODAY }));
    for (let i = 0; i < 12; i++) act(() => result.current.forward());
    expect(result.current).toMatchObject({ offset: 8, canForward: false, canBack: true });
    act(() => result.current.home());
    for (let i = 0; i < 12; i++) act(() => result.current.back());
    expect(result.current).toMatchObject({ offset: -8, canBack: false, canForward: true });
  });

  it('slides back to now a minute after the last touch, and a touch while away starts the minute again', () => {
    const { result } = renderHook(() => useLookAhead({ step: WEEK, enabled: true, today: TODAY }));
    act(() => result.current.forward());
    act(() => { vi.advanceTimersByTime(WALL_SCROLL_IDLE_MS - 5_000); });
    act(() => result.current.touched());
    act(() => { vi.advanceTimersByTime(WALL_SCROLL_IDLE_MS - 5_000); });
    expect(result.current.offset).toBe(1);
    act(() => { vi.advanceTimersByTime(5_001); });
    expect(result.current.offset).toBe(0);
  });

  it('holds the screen while someone looks ahead', () => {
    const { result } = renderHook(() => useLookAhead({ step: WEEK, enabled: true, today: TODAY }));
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(rotationIsHeld()).toBe(false);
    act(() => result.current.forward());
    expect(rotationIsHeld()).toBe(true);
  });

  it('shows nothing and stays at now with taps off or in a view that does not step', () => {
    const off = renderHook(() => useLookAhead({ step: WEEK, enabled: false, today: TODAY }));
    act(() => off.result.current.forward());
    expect(off.result.current).toMatchObject({ on: false, offset: 0, anchor: TODAY, canForward: false });
    const none = renderHook(() => useLookAhead({ step: null, enabled: true, today: TODAY }));
    expect(none.result.current.on).toBe(false);
  });

  it('comes back to now when taps are switched off or the view changes', () => {
    const { result, rerender } = renderHook(({ enabled, days }) => useLookAhead({ step: daySteps(days), enabled, today: TODAY }), {
      initialProps: { enabled: true, days: 3 },
    });
    act(() => result.current.forward());
    rerender({ enabled: true, days: 3 });
    expect(result.current.offset).toBe(1);
    // A rebuilt step with the same span is the same step.
    rerender({ enabled: true, days: 5 });
    expect(result.current.offset).toBe(0);
    act(() => result.current.forward());
    rerender({ enabled: false, days: 5 });
    rerender({ enabled: true, days: 5 });
    expect(result.current.offset).toBe(0);
  });

  it('comes back to now when the screen changes, for a module shown on every screen', () => {
    let screen = 'kitchen';
    const wrapper = ({ children }: { children: ReactNode }) => createElement(RotationProvider, { value: rotation(screen) }, children);
    const { result, rerender } = renderHook(() => useLookAhead({ step: WEEK, enabled: true, today: TODAY }), { wrapper });
    act(() => result.current.forward());
    rerender();
    expect(result.current.offset).toBe(1);
    screen = 'photos';
    rerender();
    expect(result.current.offset).toBe(0);
  });

  it('asks the shared calendar fetch for its whole reach while away, once', () => {
    const reach = vi.fn((step: NonNullable<typeof WEEK>) => ({ start: addDays(TODAY, -7 * step.back), end: addDays(TODAY, 7 * step.forward + 7) }));
    const { result } = renderHook(() => useLookAhead({ step: WEEK, enabled: true, today: TODAY, moduleId: 'cal', reach }));
    expect(useLookAheadStore.getState().span).toBeNull();
    act(() => result.current.forward());
    const span = useLookAheadStore.getState().span;
    expect(span).toEqual({ start: addDays(TODAY, -56).getTime(), end: addDays(TODAY, 63).getTime() });
    act(() => result.current.forward());
    expect(useLookAheadStore.getState().span).toBe(span);
    act(() => result.current.home());
    expect(useLookAheadStore.getState().span).toBeNull();
  });
});
