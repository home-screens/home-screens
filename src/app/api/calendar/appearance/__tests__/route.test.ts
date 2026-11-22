/**
 * Route-level tests for `POST /api/calendar/appearance`.
 *
 * This is the one config write a display token may make, so the guard rails
 * matter more than the happy path: anything that is not a `#rrggbb` colour
 * naming at least one calendar must be refused before the config is touched
 * at all. `updateConfigAtomic` is mocked to run its mutator against a fixture
 * and record the result, which is what the real store would persist.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

const { updateConfigAtomicMock } = vi.hoisted(() => ({ updateConfigAtomicMock: vi.fn() }));
vi.mock('@/lib/config', () => ({ updateConfigAtomic: updateConfigAtomicMock }));

import { NextRequest } from 'next/server';
import { POST } from '../route';
import type { ScreenConfiguration } from '@/types/config';

function configWith(calendar: Record<string, unknown> | undefined): ScreenConfiguration {
  return { version: 1, screens: [], settings: { ...(calendar ? { calendar } : {}) } } as unknown as ScreenConfiguration;
}

/** Runs the route's mutator over `start` and hands back what it would save. */
function captureWrite(start: ScreenConfiguration) {
  let saved: ScreenConfiguration | undefined;
  updateConfigAtomicMock.mockImplementation(async (mutate: (c: ScreenConfiguration) => ScreenConfiguration) => {
    saved = await mutate(start);
    return saved;
  });
  return () => saved;
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/calendar/appearance', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const BASE = { googleCalendarId: '', googleCalendarIds: ['work'] };

describe('POST /api/calendar/appearance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateConfigAtomicMock.mockResolvedValue(undefined);
  });

  it.each([
    ['a named colour', 'rebeccapurple'],
    ['shorthand hex', '#abc'],
    ['no hash', 'aabbcc'],
    ['a css function', 'rgb(1,2,3)'],
    ['not a string', 42],
  ])('refuses %s without touching the config', async (_label, color) => {
    const res = await POST(postRequest({ sourceIds: ['work'], color }));
    expect(res.status).toBe(400);
    expect(updateConfigAtomicMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no calendars named', []],
    ['a missing list', undefined],
    ['a blank id', ['']],
    ['a non-string id', [7]],
  ])('refuses %s without touching the config', async (_label, sourceIds) => {
    const res = await POST(postRequest({ sourceIds, color: '#10b981' }));
    expect(res.status).toBe(400);
    expect(updateConfigAtomicMock).not.toHaveBeenCalled();
  });

  it('refuses an implausible number of calendars', async () => {
    const many = Array.from({ length: 33 }, (_, i) => `cal-${i}`);
    const res = await POST(postRequest({ sourceIds: many, color: '#10b981' }));
    expect(res.status).toBe(400);
    expect(updateConfigAtomicMock).not.toHaveBeenCalled();
  });

  it('sets the colour and keeps the name already on that calendar', async () => {
    const saved = captureWrite(configWith({
      ...BASE,
      calendarOverrides: { work: { name: 'fam' }, other: { color: '#111111' } },
    }));
    const res = await POST(postRequest({ sourceIds: ['work'], color: '#10b981' }));

    expect(res.status).toBe(200);
    const overrides = saved()!.settings.calendar!.calendarOverrides!;
    expect(overrides.work).toEqual({ name: 'fam', color: '#10b981' });
    // A tap on one legend row must not disturb any other calendar.
    expect(overrides.other).toEqual({ color: '#111111' });
  });

  it('creates an override for a calendar that had none', async () => {
    const saved = captureWrite(configWith(BASE));
    await POST(postRequest({ sourceIds: ['work'], color: '#ABCDEF' }));
    expect(saved()!.settings.calendar!.calendarOverrides).toEqual({ work: { color: '#ABCDEF' } });
  });

  it('recolours every calendar behind one legend row', async () => {
    const saved = captureWrite(configWith(BASE));
    await POST(postRequest({ sourceIds: ['a', 'b'], color: '#10b981' }));
    const overrides = saved()!.settings.calendar!.calendarOverrides!;
    expect(overrides).toEqual({ a: { color: '#10b981' }, b: { color: '#10b981' } });
  });

  it('leaves the rest of the settings alone', async () => {
    const saved = captureWrite(configWith({ ...BASE, daysAhead: 30, hideDeclined: true }));
    await POST(postRequest({ sourceIds: ['work'], color: '#10b981' }));
    expect(saved()!.settings.calendar).toMatchObject({ daysAhead: 30, hideDeclined: true, googleCalendarIds: ['work'] });
  });

  it('answers 409 when the display has no calendar settings at all', async () => {
    const saved = captureWrite(configWith(undefined));
    const res = await POST(postRequest({ sourceIds: ['work'], color: '#10b981' }));
    expect(res.status).toBe(409);
    // Refused, not half-written: the config comes back untouched.
    expect(saved()!.settings.calendar).toBeUndefined();
  });
});
