// @vitest-environment jsdom

import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useWallCalendarSwitch } from '../useWallCalendarSwitch';
import { WALL_SCROLL_IDLE_MS } from '@/lib/wall-scroll';
import { rotationIsHeld } from '@/lib/interaction-hold';
import { RotationProvider, type RotationState } from '@/components/display/rotation-context';
import type { WallPersonPick } from '@/lib/calendar-wall-switch';

type View = 'week' | 'month' | 'daily';
const VIEWS: View[] = ['week', 'month', 'daily'];
const keep = (pick: WallPersonPick | null) => pick;
const NOAH: WallPersonPick = { kind: 'member', id: 'noah' };

function rotation(activeScreenId: string): RotationState {
  return { screens: [], allScreens: [], activeScreenId, showScreen: () => {} };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useWallCalendarSwitch', () => {
  it('borrows a view and a person, and both go back together a minute after the last touch', () => {
    const { result } = renderHook(() => useWallCalendarSwitch<View>({ enabled: true, homeView: 'week', views: VIEWS, pick: keep }));
    expect(result.current).toMatchObject({ view: 'week', borrowed: null, pick: null, away: false });

    act(() => result.current.showView('month'));
    act(() => result.current.showPick(NOAH));
    expect(result.current).toMatchObject({ view: 'month', borrowed: 'month', pick: NOAH, away: true });
    expect(rotationIsHeld()).toBe(true);

    // A touch anywhere on the screen starts the minute again.
    act(() => { vi.advanceTimersByTime(WALL_SCROLL_IDLE_MS - 1_000); });
    act(() => { window.dispatchEvent(new Event('pointerdown')); });
    act(() => { vi.advanceTimersByTime(WALL_SCROLL_IDLE_MS - 1_000); });
    expect(result.current.away).toBe(true);

    act(() => { vi.advanceTimersByTime(1_500); });
    expect(result.current).toMatchObject({ view: 'week', borrowed: null, pick: null, away: false });
  });

  it('treats the own view’s button as the way home', () => {
    const { result } = renderHook(() => useWallCalendarSwitch<View>({ enabled: true, homeView: 'week', views: VIEWS, pick: keep }));
    act(() => result.current.showView('daily'));
    act(() => result.current.showView('week'));
    expect(result.current).toMatchObject({ view: 'week', borrowed: null, away: false });
  });

  it('answers the own view and everyone while switched off', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useWallCalendarSwitch<View>({ enabled, homeView: 'week', views: VIEWS, pick: keep }),
      { initialProps: { enabled: true } },
    );
    act(() => result.current.showView('month'));
    act(() => result.current.showPick(NOAH));
    rerender({ enabled: false });
    expect(result.current).toMatchObject({ view: 'week', pick: null, away: false });
    // Turning it back on does not bring the old borrow back.
    rerender({ enabled: true });
    expect(result.current).toMatchObject({ view: 'week', pick: null });
  });

  it('never shows a view that is no longer on offer, or a pick the roster dropped', () => {
    let offered = true;
    const { result, rerender } = renderHook(
      ({ views }) => useWallCalendarSwitch<View>({ enabled: true, homeView: 'week', views, pick: (pick) => (offered ? pick : null) }),
      { initialProps: { views: VIEWS } },
    );
    act(() => result.current.showView('daily'));
    act(() => result.current.showPick(NOAH));
    offered = false;
    rerender({ views: ['week', 'month'] });
    expect(result.current).toMatchObject({ view: 'week', pick: null, away: false });
  });

  it('goes home when the screen changes under a calendar shown on every screen', () => {
    let state = rotation('home');
    const wrapper = ({ children }: { children: ReactNode }) => createElement(RotationProvider, { value: state }, children);
    const { result, rerender } = renderHook(
      () => useWallCalendarSwitch<View>({ enabled: true, homeView: 'week', views: VIEWS, pick: keep }),
      { wrapper },
    );
    act(() => result.current.showView('month'));
    state = rotation('family');
    rerender();
    expect(result.current).toMatchObject({ view: 'week', away: false });
  });
});
