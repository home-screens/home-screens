// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { CalendarEvent } from '@/types/config';

/**
 * A Remove pressed on the wall: what the hook tells the sheet for each way
 * the hub can answer. The sheet says the refusal's words, so the answer must
 * carry them; a bare "it did not work" left a button that did nothing.
 */

let answers: Array<Response | Error> = [];
const displayFetch = vi.fn(async (url: string, _init?: RequestInit) => {
  if (url === '/api/calendar/entry') return json(200, { enabled: true, calendars: [{ id: 'family', name: 'Family' }], timezone: 'America/Chicago' });
  const next = answers.shift();
  if (!next) throw new TypeError('Load failed');
  if (next instanceof Error) throw next;
  return next;
});
vi.mock('@/lib/display-fetch', () => ({ displayFetch: (url: string, init?: RequestInit) => displayFetch(url, init) }));
vi.mock('@/components/display/wall-calendar-entry-context', () => ({ useWallCalendarEntry: () => true }));

const { useWallCalendarAdding } = await import('../useWallCalendarAdding');
const { displayCache } = await import('@/lib/display-cache');
const { registerGrownUpAsker } = await import('@/lib/grown-up-client');

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const swim: CalendarEvent = {
  id: 'ev-1', title: 'Swim lesson', start: '2026-11-23T16:00:00', end: '2026-11-23T17:00:00', allDay: false,
  sourceRef: 'ic-1', etag: '"old"',
} as CalendarEvent;

async function setup() {
  const hook = renderHook(() => useWallCalendarAdding(true));
  for (let i = 0; i < 5; i++) await act(async () => {});
  expect(hook.result.current).not.toBeNull();
  return hook;
}

async function remove(hook: Awaited<ReturnType<typeof setup>>) {
  let result: unknown;
  await act(async () => { result = await hook.result.current!.remove(swim, 'instance', 'To remove Swim lesson'); });
  return result;
}

let refresh: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  answers = [];
  displayFetch.mockClear();
  refresh = vi.spyOn(displayCache, 'refreshWhere').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  refresh.mockRestore();
});

describe('useWallCalendarAdding remove', () => {
  it('a removal that went through says so and reads the calendar again', async () => {
    const hook = await setup();
    answers = [json(200, { ok: true })];
    expect(await remove(hook)).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    const [url, init] = displayFetch.mock.calls.at(-1)!;
    expect(url).toBe('/api/calendar/events/ev-1');
    expect(JSON.parse(String(init!.body))).toMatchObject({ scope: 'instance', sourceRef: 'ic-1', etag: '"old"' });
  });

  it('a refusal comes back with the hub\'s answer, so the sheet can say why', async () => {
    const hook = await setup();
    const body = { error: 'Adding events is off', code: 'calendarWrite.notOffered' };
    answers = [json(403, body)];
    expect(await remove(hook)).toEqual({ ok: false, body });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('an event changed elsewhere is read again, so the next press sends the copy the calendar now holds', async () => {
    const hook = await setup();
    const body = { error: 'Changed elsewhere', code: 'calendarWrite.changedElsewhere' };
    answers = [json(409, body)];
    expect(await remove(hook)).toEqual({ ok: false, body });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a refusal with no readable answer still comes back as a refusal', async () => {
    const hook = await setup();
    answers = [new Response('<html>Bad gateway</html>', { status: 502 })];
    expect(await remove(hook)).toEqual({ ok: false, body: null });
  });

  it('a hub that does not answer is unreachable', async () => {
    const hook = await setup();
    answers = [new TypeError('Load failed')];
    expect(await remove(hook)).toEqual({ ok: false, unreachable: true });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a grown-up code nobody gave is cancelled, not a failure', async () => {
    const hook = await setup();
    const unregister = registerGrownUpAsker(async () => false);
    answers = [json(403, { error: 'Needs the code', needsGrownUpCode: true })];
    expect(await remove(hook)).toEqual({ ok: false, cancelled: true });
    expect(refresh).not.toHaveBeenCalled();
    unregister();
  });
});
