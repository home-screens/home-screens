import { describe, it, expect } from 'vitest';
import {
  applyCalendarOverrides, calendarLook, calendarOverridesProblem, cleanCalendarOverrides, renameSourceStatus, withCalendarOverride,
} from '@/lib/calendar-overrides';
import type { CalendarEvent } from '@/types/config';

const ev = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1', title: 'Thing', start: '2026-11-05T10:00', end: '2026-11-05T11:00',
  sourceId: 'work', sourceName: 'work@example.com', calendarColor: '#1a73e8',
  ...over,
} as CalendarEvent);

describe('applyCalendarOverrides', () => {
  it('returns the same array when there is nothing to apply', () => {
    const events = [ev()];
    expect(applyCalendarOverrides(events, undefined)).toBe(events);
    expect(applyCalendarOverrides(events, {})).toBe(events);
  });

  it('replaces the name and colour for a matching source', () => {
    const [out] = applyCalendarOverrides([ev()], { work: { name: 'Work', color: '#10b981' } });
    expect(out.sourceName).toBe('Work');
    expect(out.calendarColor).toBe('#10b981');
  });

  it('leaves other sources untouched', () => {
    const out = applyCalendarOverrides(
      [ev(), ev({ id: 'e2', sourceId: 'home', sourceName: 'Home', calendarColor: '#abc' })],
      { work: { name: 'Work' } },
    );
    expect(out[0].sourceName).toBe('Work');
    expect(out[1].sourceName).toBe('Home');
    expect(out[1].calendarColor).toBe('#abc');
  });

  it('keeps the original when a field is absent, so a half-filled override never blanks it', () => {
    const [nameOnly] = applyCalendarOverrides([ev()], { work: { name: 'Work' } });
    expect(nameOnly.sourceName).toBe('Work');
    expect(nameOnly.calendarColor).toBe('#1a73e8');

    const [colorOnly] = applyCalendarOverrides([ev()], { work: { color: '#10b981' } });
    expect(colorOnly.sourceName).toBe('work@example.com');
    expect(colorOnly.calendarColor).toBe('#10b981');
  });

  it('treats a whitespace-only name as absent', () => {
    const [out] = applyCalendarOverrides([ev()], { work: { name: '   ' } });
    expect(out.sourceName).toBe('work@example.com');
  });

  it('keeps a colour somebody gave one event, as Google does, and gives the calendar\'s colour to its legend colour', () => {
    const [own, plain] = applyCalendarOverrides(
      [ev({ calendarColor: '#d50000', sourceColor: '#1a73e8' }), ev({ id: 'e2' })],
      { work: { name: 'Work', color: '#10b981' } },
    );
    expect(own).toMatchObject({ calendarColor: '#d50000', sourceColor: '#10b981', sourceName: 'Work' });
    expect(plain.calendarColor).toBe('#10b981');
    expect(plain.sourceColor).toBeUndefined();
  });

  it('ignores events with no sourceId', () => {
    const orphan = ev({ sourceId: undefined });
    const [out] = applyCalendarOverrides([orphan], { work: { name: 'Work' } });
    expect(out).toBe(orphan);
  });

  it('does not mutate the input events', () => {
    const input = ev();
    applyCalendarOverrides([input], { work: { name: 'Work', color: '#10b981' } });
    expect(input.sourceName).toBe('work@example.com');
    expect(input.calendarColor).toBe('#1a73e8');
  });
});

describe('calendarLook', () => {
  const own = { name: 'work@example.com', color: '#1a73e8' };

  it('is the provider look when the household changed nothing', () => {
    expect(calendarLook('work', own, undefined)).toBe(own);
    expect(calendarLook('work', own, { other: { name: 'Other' } })).toBe(own);
  });

  it('takes each field the household set and keeps the rest', () => {
    expect(calendarLook('work', own, { work: { name: ' Work ' } })).toEqual({ name: 'Work', color: '#1a73e8' });
    expect(calendarLook('work', own, { work: { color: '#10b981' } })).toEqual({ name: 'work@example.com', color: '#10b981' });
    expect(calendarLook('work', own, { work: { name: '  ', color: '' } })).toEqual(own);
  });
});

describe('withCalendarOverride', () => {
  it('starts an entry and keeps what is already there', () => {
    const once = withCalendarOverride(undefined, 'work', { name: 'Work' });
    expect(once).toEqual({ work: { name: 'Work' } });
    expect(withCalendarOverride(once, 'work', { color: '#10b981' })).toEqual({ work: { name: 'Work', color: '#10b981' } });
  });

  it('drops a cleared field, then the empty entry, then the empty map', () => {
    const both = { work: { name: 'Work', color: '#10b981' }, home: { name: 'Home' } };
    expect(withCalendarOverride(both, 'work', { name: '' })).toEqual({ work: { color: '#10b981' }, home: { name: 'Home' } });
    expect(withCalendarOverride(both, 'work', { name: '', color: '' })).toEqual({ home: { name: 'Home' } });
    expect(withCalendarOverride({ home: { name: 'Home' } }, 'home', { name: '  ' })).toBeUndefined();
  });

  it('does not change the map it was given', () => {
    const before = { work: { name: 'Work' } };
    withCalendarOverride(before, 'work', { name: '' });
    expect(before).toEqual({ work: { name: 'Work' } });
  });
});

describe('renameSourceStatus', () => {
  it('names a source the way the household does, and leaves the rest', () => {
    const statuses = [
      { id: 'ic-home', name: 'Home', ok: false, fetchedAt: null },
      { id: 'work', name: 'work@example.com', ok: true, fetchedAt: 1 },
    ];
    expect(renameSourceStatus(statuses, undefined)).toBe(statuses);
    const out = renameSourceStatus(statuses, { 'ic-home': { name: 'Our house' }, work: { color: '#10b981' } });
    expect(out[0]).toEqual({ id: 'ic-home', name: 'Our house', ok: false, fetchedAt: null });
    expect(out[1]).toBe(statuses[1]);
  });
});

describe('a config edited by hand', () => {
  const bad = { work: { name: 42, color: { r: 1 } }, home: 'blue' } as never;

  it('never throws on what it reads, and keeps the provider\'s look', () => {
    const own = { name: 'work@example.com', color: '#1a73e8' };
    expect(calendarLook('work', own, bad)).toEqual(own);
    expect(calendarLook('home', own, bad)).toEqual(own);
    expect(calendarLook('work', own, 'nonsense' as never)).toEqual(own);
    const events = [ev()];
    expect(applyCalendarOverrides(events, bad)[0]).toBe(events[0]);
    expect(renameSourceStatus([{ id: 'work', name: 'Work', ok: true, fetchedAt: 1 }], bad)[0].name).toBe('Work');
    expect(withCalendarOverride(bad, 'work', { name: 'Work' })).toMatchObject({ work: { name: 'Work' } });
  });

  it('is refused on save and cleaned on read', () => {
    expect(calendarOverridesProblem(undefined)).toBeNull();
    expect(calendarOverridesProblem({ work: { name: 'Work', color: '#10b981' } })).toBeNull();
    expect(calendarOverridesProblem(bad)).toMatch(/calendar's own name/);
    expect(calendarOverridesProblem({ work: { name: 'x'.repeat(81) } })).toMatch(/80/);
    expect(cleanCalendarOverrides(bad)).toBeUndefined();
    expect(cleanCalendarOverrides({ work: { name: 'x'.repeat(90), color: 'red' } })).toEqual({ work: { name: 'x'.repeat(80) } });
    const sound = { work: { name: 'Work' } };
    expect(cleanCalendarOverrides(sound)).toBe(sound);
  });
});
