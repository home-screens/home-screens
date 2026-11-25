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

  const refused = () => new Response(JSON.stringify({ error: 'Something went wrong' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  /** The answers `beforeEach` set up, for a test that turns down only one of the two reads. */
  const good = () => request.getMockImplementation()!;

  it('keeps what adding offers when a read in the background is turned down, so an open form stays', async () => {
    const answer = good();
    const view = renderHook(() => useCalendarTab(DAYS));
    await settle();
    const before = view.result.current.entry;
    expect(before).not.toBeNull();

    name = 'Smith family';
    request.mockImplementation(async (url: string) => (url === '/api/calendar/entry' ? refused() : answer(url)));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await settle();
    expect(view.result.current.entry).toBe(before);
    // The events answered, so they still move on, read in the zone already known.
    expect(view.result.current.events[0].sourceName).toBe('Smith family');
    const eventsUrl = request.mock.calls.map(([url]) => url as string).filter((url) => url.startsWith('/api/calendar?')).at(-1)!;
    expect(new URL(eventsUrl, 'http://hub').searchParams.get('timeMin')).toBe('2026-11-23T06:00:00.000Z');
    expect(view.result.current.loadError).toBe(false);
  });

  it('keeps the events when a read of them in the background is turned down', async () => {
    const answer = good();
    const view = renderHook(() => useCalendarTab(DAYS));
    await settle();
    expect(view.result.current.events).toHaveLength(1);

    request.mockImplementation(async (url: string) => (url === '/api/calendar/entry' ? answer(url) : refused()));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await settle();
    expect(view.result.current.events).toHaveLength(1);
    expect(view.result.current.entry).not.toBeNull();
    expect(view.result.current.loadError).toBe(false);
  });

  it('the first read still shows the days with no events and no adding when the hub turns both down, and says the events could not be read', async () => {
    request.mockImplementation(async () => refused());
    const view = renderHook(() => useCalendarTab(DAYS));
    await settle();
    expect(view.result.current.loaded).toBe(true);
    expect(view.result.current.entry).toBeNull();
    expect(view.result.current.events).toEqual([]);
    expect(view.result.current.loadError).toBe(true);
  });

  it('says the events could not be read when only they fail, as when Google is out of reach after a restart', async () => {
    const answer = good();
    request.mockImplementation(async (url: string) => (url === '/api/calendar/entry' ? answer(url) : refused()));
    const view = renderHook(() => useCalendarTab(DAYS));
    await settle();
    expect(view.result.current.entry).not.toBeNull();
    expect(view.result.current.events).toEqual([]);
    expect(view.result.current.loadError).toBe(true);

    // The next good read takes it away.
    request.mockImplementation(answer);
    await act(async () => { await view.result.current.reload(); });
    await settle();
    expect(view.result.current.events).toHaveLength(1);
    expect(view.result.current.loadError).toBe(false);
  });

  it('says the events could not be read when the hub does not answer at all', async () => {
    request.mockRejectedValue(new TypeError('offline'));
    const view = renderHook(() => useCalendarTab(DAYS));
    await settle();
    expect(view.result.current.loaded).toBe(true);
    expect(view.result.current.loadError).toBe(true);
  });

  it('says nothing failed when there is no calendar at all to read', async () => {
    const answer = good();
    request.mockImplementation(async (url: string) => (url === '/api/calendar/entry'
      ? answer(url)
      : new Response(JSON.stringify({ error: 'No calendars configured.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })));
    const view = renderHook(() => useCalendarTab(DAYS));
    await settle();
    expect(view.result.current.events).toEqual([]);
    expect(view.result.current.loadError).toBe(false);
  });
});
