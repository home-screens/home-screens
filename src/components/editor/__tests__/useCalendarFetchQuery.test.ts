// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { addDays, addWeeks, startOfDay, startOfWeek } from 'date-fns';
import { useEditorStore } from '@/stores/editor-store';
import { useCalendarFetchQuery } from '../useCalendarFetchQuery';
import type { ModuleInstance, Screen, ScreenConfiguration } from '@/types/config';

// Wednesday 15 Jul 2026, so a Sunday-start week begins on the 12th.
const NOW = new Date(2026, 6, 15, 10, 30, 0);

function makeModule(type: ModuleInstance['type'], config: Record<string, unknown>): ModuleInstance {
  return {
    id: `${type}-${Math.random()}`,
    type,
    position: { x: 0, y: 0 },
    size: { width: 400, height: 400 },
    config,
    style: {},
  } as unknown as ModuleInstance;
}

function makeScreen(id: string, modules: ModuleInstance[]): Screen {
  return { id, name: id, backgroundImage: '', modules } as unknown as Screen;
}

function seed(partial: Partial<ScreenConfiguration>): void {
  useEditorStore.setState({
    config: {
      version: 1,
      settings: { calendar: { daysAhead: 7 } },
      screens: [],
      ...partial,
    } as unknown as ScreenConfiguration,
    selectedDisplayId: null,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  useEditorStore.setState({ config: null, selectedDisplayId: null });
});

const weekStart = () => startOfWeek(NOW, { weekStartsOn: 0 });
const expectedMin = (from: Date) => `timeMin=${encodeURIComponent(addDays(from, -1).toISOString())}`;

describe('useCalendarFetchQuery', () => {
  it('returns an empty query when nothing needs more than the server default', () => {
    seed({ screens: [makeScreen('s1', [makeModule('calendar', { viewMode: 'daily' })])] });
    const { result } = renderHook(() => useCalendarFetchQuery('active'));
    expect(result.current).toBe('');
  });

  it('mirrors the display window for the active display', () => {
    seed({ screens: [makeScreen('s1', [makeModule('calendar', { viewMode: 'multi-week', weeksToShow: 4 })])] });
    const { result } = renderHook(() => useCalendarFetchQuery('active'));
    expect(result.current).toContain(expectedMin(weekStart()));
    expect(result.current).toContain(`timeMax=${encodeURIComponent(addDays(addWeeks(weekStart(), 4), 1).toISOString())}`);
  });

  it('covers every display under the "all" scope, not just the selected one', () => {
    // The grid lives on a display the editor is not looking at. A fetch that
    // seeds process-wide state has to cover it anyway, or a later failure of
    // that source leaves this display's past cells empty.
    seed({
      screens: [],
      displays: [
        { id: 'kitchen', name: 'Kitchen', screens: [makeScreen('k1', [makeModule('calendar', { viewMode: 'daily' })])] },
        { id: 'hall', name: 'Hall', screens: [makeScreen('h1', [makeModule('calendar', { viewMode: 'multi-week', weeksToShow: 6 })])] },
      ],
    } as Partial<ScreenConfiguration>);
    useEditorStore.setState({ selectedDisplayId: 'kitchen' });

    const active = renderHook(() => useCalendarFetchQuery('active'));
    const all = renderHook(() => useCalendarFetchQuery('all'));

    // Kitchen alone needs nothing beyond the default; the hub as a whole does.
    expect(active.result.current).toBe('');
    expect(all.result.current).toContain(expectedMin(weekStart()));
    expect(all.result.current).toContain(`timeMax=${encodeURIComponent(addDays(addWeeks(weekStart(), 6), 1).toISOString())}`);
  });

  it('widens for a daily view that keeps today\'s finished events', () => {
    seed({ screens: [makeScreen('s1', [makeModule('calendar', { viewMode: 'daily', dimPastEvents: true })])] });
    const { result } = renderHook(() => useCalendarFetchQuery('all'));
    expect(result.current).toBe(expectedMin(startOfDay(NOW)));
  });

  it('returns an empty query with no config loaded', () => {
    useEditorStore.setState({ config: null, selectedDisplayId: null });
    const { result } = renderHook(() => useCalendarFetchQuery('all'));
    expect(result.current).toBe('');
  });
});
