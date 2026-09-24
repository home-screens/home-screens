// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/stores/editor-store';
import type { CalendarSettings, ScreenConfiguration } from '@/types/config';
import { usePreviewData } from '../usePreviewData';

const mocks = vi.hoisted(() => ({ editorFetch: vi.fn() }));

vi.mock('@/lib/editor-fetch', () => ({ editorFetch: mocks.editorFetch }));
vi.mock('@/hooks/useSecretStatus', () => ({
  useSecretStatus: () => ({ status: {}, loading: false, error: false, hasStatus: true }),
}));
vi.mock('../useCalendarFetchQuery', () => ({ useCalendarFetchQuery: () => '' }));

function makeConfig(calendar: Partial<CalendarSettings>): ScreenConfiguration {
  return {
    settings: { weather: { provider: 'open-meteo', latitude: 51.865, longitude: -2.246, units: 'metric' }, calendar },
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
});
