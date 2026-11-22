// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editor-fetch', () => ({ editorFetch: (url: string) => request(url), isSessionExpired: () => false }));

import { useCalendarTab } from '../useCalendarTab';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const DAYS = ['2026-11-23', '2026-11-24'];
let name = 'Family';

beforeEach(() => {
  vi.useFakeTimers();
  name = 'Family';
  request.mockReset();
  request.mockImplementation(async (url: string) => {
    if (url === '/api/calendar/entry') return json({ enabled: true, calendars: [], timezone: 'America/Chicago' });
    return json({ events: [{ id: 'e1', title: 'Pizza night', start: '2026-11-23T18:00', end: '2026-11-23T19:00', allDay: false, sourceName: name }] });
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => {}); };

describe('useCalendarTab', () => {
  it('reads again every minute, so a phone left on the tab shows a calendar renamed elsewhere', async () => {
    const view = renderHook(() => useCalendarTab(DAYS));
    await settle();
    expect(view.result.current.events[0].sourceName).toBe('Family');

    name = 'Smith family';
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await settle();
    expect(view.result.current.events[0].sourceName).toBe('Smith family');
  });

  it('keeps what it shows when a read in the background fails', async () => {
    const view = renderHook(() => useCalendarTab(DAYS));
    await settle();
    request.mockRejectedValue(new TypeError('offline'));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await settle();
    expect(view.result.current.loadError).toBe(false);
    expect(view.result.current.events).toHaveLength(1);
  });
});
