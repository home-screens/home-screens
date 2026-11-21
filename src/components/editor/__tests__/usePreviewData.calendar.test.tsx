// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/stores/editor-store';
import type { CalendarSettings, ScreenConfiguration } from '@/types/config';
import { usePreviewData } from '../usePreviewData';
import { sharedStateStore } from '@/lib/shared-state-store';
import { CALENDAR_STATE_KEYS } from '@/lib/calendar-state';
import { NOTES_STATE_KEYS } from '@/lib/notes-state';

const mocks = vi.hoisted(() => ({
  notes: null as { notes: unknown[] } | null, editorFetch: vi.fn() }));

vi.mock('@/lib/editor-fetch', () => ({ editorFetch: mocks.editorFetch }));
// The notes board read: the real hook needs the app's translation provider.
vi.mock('@/hooks/useFetchData', () => ({ useFetchData: () => [mocks.notes, null, null] }));
vi.mock('@/hooks/useSecretStatus', () => ({
  useSecretStatus: () => ({ status: {}, loading: false, error: false, hasStatus: true }),
}));
vi.mock('../useCalendarFetchQuery', () => ({ useCalendarFetchQuery: () => '' }));

function makeConfig(calendar: Partial<CalendarSettings>): ScreenConfiguration {
  return {
    settings: { weather: { provider: 'open-meteo', units: 'metric' }, calendar },
    screens: [{ id: 'home', name: 'Home', modules: [{ type: 'calendar', config: {} }] }],
  } as unknown as ScreenConfiguration;
}

function calendarCalls(): string[] {
  return mocks.editorFetch.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/calendar'));
}

describe('usePreviewData calendar requests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.editorFetch.mockImplementation(async () =>
      new Response(JSON.stringify({ events: [], sourceStatus: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    mocks.editorFetch.mockReset();
    useEditorStore.setState({ config: null });
  });

  // A fresh install has no calendar: the route would answer 400 and fill the
  // console, so the preview does not ask.
  it('does not ask for calendar data when no calendar is set up', async () => {
    useEditorStore.setState({ config: makeConfig({ googleCalendarIds: [], icalSources: [] }) });
    renderHook(() => usePreviewData());
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(calendarCalls()).toEqual([]);
  });

  it('asks once a calendar is set up', async () => {
    useEditorStore.setState({ config: makeConfig({ holidayCountry: 'US' }) });
    renderHook(() => usePreviewData());
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(calendarCalls()).toEqual(['/api/calendar']);
  });

  // The wall publishes these from its root. The canvas is its own tab with
  // its own bus, so a Text module's "{calendar.next_event_title}" stayed
  // blank there until the editor published them too.
  it('puts the calendar facts on the editor bus, read in the household zone', async () => {
    vi.setSystemTime(new Date('2026-08-20T15:00:00Z'));
    mocks.editorFetch.mockImplementation(async () =>
      new Response(JSON.stringify({
        events: [{ id: 'a', title: 'Pickup', start: '2026-08-20T15:30:00Z', end: '2026-08-20T16:00:00Z', allDay: false }],
        sourceStatus: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    // No zone saved: the hub's zone stands in, never the laptop's.
    useEditorStore.setState({ config: makeConfig({ holidayCountry: 'US' }), hubTimezone: 'Asia/Tokyo' });
    const { unmount } = renderHook(() => usePreviewData());
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    const value = (key: string) => sharedStateStore.snapshot().get(key)?.value;
    expect(value(CALENDAR_STATE_KEYS.nextEventTitle)).toBe('Pickup');
    expect(value(CALENDAR_STATE_KEYS.nextEventInMinutes)).toBe('30');
    // 15:30 UTC is half past midnight in Tokyo.
    expect(value(CALENDAR_STATE_KEYS.nextEventTime)).toMatch(/^(12:30\sAM|00:30|0:30)$/);
    unmount();
    useEditorStore.setState({ hubTimezone: null });
  });

  it('puts the notes board counts on the editor bus', async () => {
    mocks.notes = {
      notes: [
        { id: 'n1', text: 'Bins out', pinned: true, important: false, expiresAt: null },
        { id: 'n2', text: 'Dentist 3pm', pinned: false, important: true, expiresAt: null },
      ],
    };
    useEditorStore.setState({ config: makeConfig({ googleCalendarIds: [], icalSources: [] }) });
    const { unmount } = renderHook(() => usePreviewData());

    const value = (key: string) => sharedStateStore.snapshot().get(key)?.value;
    expect(value(NOTES_STATE_KEYS.count)).toBe('2');
    expect(value(NOTES_STATE_KEYS.important)).toBe('1');
    expect(value(NOTES_STATE_KEYS.pinned)).toBe('1');
    unmount();
    mocks.notes = null;
  });
});
