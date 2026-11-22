import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { CalendarEvent } from '@/types/config';
import type { TranslateFn } from '@/i18n';
import { openDayCellProps, openDayProps, useDaySheet } from '../useDaySheet';

// @vitest-environment jsdom

afterEach(cleanup);

const FRIDAY = new Date(2026, 10, 6);

function ev(id: string, title: string): CalendarEvent {
  return { id, title, start: '2026-11-06T17:00:00', end: '2026-11-06T18:00:00', allDay: false } as CalendarEvent;
}

const DENTIST = ev('dentist', 'Dentist');
const SWIM = ev('swim', 'Swim lessons');

describe('useDaySheet', () => {
  it('has no opener while taps are off, so the views draw plain text', () => {
    const { result } = renderHook(() => useDaySheet([DENTIST], false));
    expect(result.current.opener).toBeNull();
    expect(result.current.day).toBeNull();
  });

  it('opens a day with the cell’s events and keeps the opener stable', () => {
    const { result, rerender } = renderHook(({ events }) => useDaySheet(events, true), { initialProps: { events: [DENTIST, SWIM] } });
    const opener = result.current.opener;
    act(() => opener?.(FRIDAY, [DENTIST, SWIM]));
    expect(result.current.day?.date).toBe(FRIDAY);
    expect(result.current.day?.events.map((e) => e.id)).toEqual(['dentist', 'swim']);
    rerender({ events: [DENTIST, SWIM] });
    expect(result.current.opener).toBe(opener);
  });

  it('follows a refresh: a renamed event updates and a removed one leaves', () => {
    const { result, rerender } = renderHook(({ events }) => useDaySheet(events, true), { initialProps: { events: [DENTIST, SWIM] } });
    act(() => result.current.opener?.(FRIDAY, [DENTIST, SWIM]));
    rerender({ events: [{ ...DENTIST, title: 'Dentist (moved)' }] });
    expect(result.current.day?.events.map((e) => e.title)).toEqual(['Dentist (moved)']);
    // Nothing of that day left: no empty sheet.
    rerender({ events: [] });
    expect(result.current.day).toBeNull();
  });

  it('closes when taps are turned off and stays closed when they come back', () => {
    const { result, rerender } = renderHook(({ enabled }) => useDaySheet([DENTIST], enabled), { initialProps: { enabled: true } });
    act(() => result.current.opener?.(FRIDAY, [DENTIST]));
    expect(result.current.day).not.toBeNull();
    rerender({ enabled: false });
    expect(result.current.day).toBeNull();
    rerender({ enabled: true });
    expect(result.current.day).toBeNull();
  });

  it('opens a day that has only a note, and keeps the sheet while the note is there', () => {
    const notes = { '2026-11-06': ['Picture day'] };
    const { result, rerender } = renderHook(({ dayNotes }) => useDaySheet([], true, dayNotes), { initialProps: { dayNotes: notes as Record<string, string[]> } });
    act(() => result.current.opener?.(FRIDAY, []));
    expect(result.current.day).toEqual({ date: FRIDAY, events: [], notes: ['Picture day'] });
    // The note was deleted on the phone: nothing left to show.
    rerender({ dayNotes: {} });
    expect(result.current.day).toBeNull();
  });

  it('hands the day’s notes over with its events', () => {
    const { result } = renderHook(() => useDaySheet([DENTIST], true, { '2026-11-06': ['Picture day', 'Library books'], '2026-11-07': ['Other day'] }));
    act(() => result.current.opener?.(FRIDAY, [DENTIST]));
    expect(result.current.day?.notes).toEqual(['Picture day', 'Library books']);
  });

  it('closes on close()', () => {
    const { result } = renderHook(() => useDaySheet([DENTIST], true));
    act(() => result.current.opener?.(FRIDAY, [DENTIST]));
    act(() => result.current.close());
    expect(result.current.day).toBeNull();
  });
});

describe('while events can be added here', () => {
  const t = ((key: string, vars?: Record<string, unknown>) => `${key}:${vars?.date}`) as TranslateFn;

  it('opens a day with nothing on it, and keeps the sheet open', () => {
    const { result } = renderHook(() => useDaySheet([DENTIST], true, undefined, true));
    const opener = result.current.opener!;
    expect(opener.everyDay).toBe(true);
    expect(openDayProps(opener, FRIDAY, [], t, 'en-US')?.['data-open-day']).toBe('2026-11-06');
    expect(openDayCellProps(opener, FRIDAY, [])?.['data-day-cell']).toBe('2026-11-06');
    act(() => opener(FRIDAY, []));
    expect(result.current.day).toEqual({ date: FRIDAY, events: [], notes: [] });
  });

  it('changes nothing with adding off: an empty day stays plain text', () => {
    const { result } = renderHook(() => useDaySheet([DENTIST], true));
    expect(result.current.opener?.everyDay).toBeUndefined();
    expect(openDayProps(result.current.opener, FRIDAY, [], t, 'en-US')).toBeUndefined();
  });
});

describe('openDayProps', () => {
  const t = ((key: string, vars?: Record<string, unknown>) => `${key}:${vars?.date}`) as TranslateFn;

  it('is nothing without an opener or for an empty day', () => {
    expect(openDayProps(null, FRIDAY, [DENTIST], t, 'en-US')).toBeUndefined();
    expect(openDayProps(() => {}, FRIDAY, [], t, 'en-US')).toBeUndefined();
  });

  it('opens an empty day that has a note, when the caller says so', () => {
    expect(openDayProps(() => {}, FRIDAY, [], t, 'en-US', true)?.['data-open-day']).toBe('2026-11-06');
    expect(openDayProps(null, FRIDAY, [], t, 'en-US', true)).toBeUndefined();
  });

  it('opens the day with the cell’s events and names the day', () => {
    const calls: unknown[] = [];
    const props = openDayProps((date, events) => calls.push([date, events]), FRIDAY, [DENTIST], t, 'en-US');
    expect(props?.['aria-label']).toBe('calendar.daySheet.openDay:Friday, November 6');
    expect(props?.['data-open-day']).toBe('2026-11-06');
    props?.onClick();
    expect(calls).toEqual([[FRIDAY, [DENTIST]]]);
  });
});
