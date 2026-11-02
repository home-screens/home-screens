import { describe, it, expect } from 'vitest';
import { dropDuplicateHolidays, holidayNameKey } from '../holiday-duplicates';
import { selectCalendarEvents } from '../calendar-rules';
import type { CalendarEvent } from '@/types/config';
import { makeEvent } from './helpers/calendar-fixtures';

/** An all-day row from the family's Google holiday calendar. */
function calendarHoliday(title: string, day = '2026-11-11', over: Partial<CalendarEvent> = {}): CalendarEvent {
  return makeEvent({ id: `g-${title}-${day}`, title, start: day, end: nextDay(day), allDay: true, sourceId: 'us-holidays', ...over });
}

/** The same day from the Public Holidays feature. */
function publicHoliday(title: string, day = '2026-11-11'): CalendarEvent {
  return makeEvent({ id: `holiday-US-${day}-${title}`, title, start: day, end: nextDay(day), allDay: true, sourceId: 'holidays', kind: 'holiday' });
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const ids = (events: CalendarEvent[]) => events.map((ev) => ev.id);

describe('holidayNameKey', () => {
  it('ignores case, punctuation, spacing and accents', () => {
    expect(holidayNameKey('Martin Luther King, Jr. Day')).toBe(holidayNameKey('martin luther king jr day'));
    expect(holidayNameKey('New Year’s Day')).toBe(holidayNameKey("New Year's Day"));
    expect(holidayNameKey('New Years Day')).toBe(holidayNameKey("New Year's Day"));
    expect(holidayNameKey('Día de la Hispanidad')).toBe(holidayNameKey('Dia de la Hispanidad'));
  });

  it('drops an English "Day" at the end, never the whole name', () => {
    expect(holidayNameKey('Thanksgiving Day')).toBe(holidayNameKey('Thanksgiving'));
    expect(holidayNameKey('Day')).toBe('day');
    expect(holidayNameKey('Labor Day')).not.toBe(holidayNameKey('Labour Day'));
  });
});

describe('dropDuplicateHolidays', () => {
  it('keeps one Veterans Day when the calendar and Public Holidays both list it', () => {
    const out = dropDuplicateHolidays([calendarHoliday('Veterans Day'), publicHoliday('Veterans Day')]);
    expect(ids(out)).toEqual(['holiday-US-2026-11-11-Veterans Day']);
  });

  it('matches names loosely: "Thanksgiving Day" and "Thanksgiving", "King, Jr." and "King Jr."', () => {
    const out = dropDuplicateHolidays([
      calendarHoliday('Thanksgiving Day', '2026-11-26'), publicHoliday('Thanksgiving', '2026-11-26'),
      calendarHoliday('Martin Luther King, Jr. Day', '2026-01-19'), publicHoliday('Martin Luther King Jr. Day', '2026-01-19'),
    ]);
    expect(out.map((ev) => ev.sourceId)).toEqual(['holidays', 'holidays']);
  });

  it('keeps holidays only one of them lists, and the same name on another day', () => {
    const election = calendarHoliday('Election Day', '2026-11-03');
    const otherDay = calendarHoliday('Veterans Day', '2026-11-10');
    const out = dropDuplicateHolidays([election, otherDay, publicHoliday('Veterans Day')]);
    expect(out).toHaveLength(3);
  });

  it('leaves timed events, birthdays and multi-day events with the name alone', () => {
    const dinner = makeEvent({ id: 'dinner', title: 'Thanksgiving', start: '2026-11-26T17:00:00', end: '2026-11-26T20:00:00' });
    const birthday = calendarHoliday('Thanksgiving', '2026-11-26', { id: 'bday', kind: 'birthday' });
    const weekend = calendarHoliday('Thanksgiving', '2026-11-26', { id: 'weekend', end: '2026-11-29' });
    const out = dropDuplicateHolidays([dinner, birthday, weekend, publicHoliday('Thanksgiving Day', '2026-11-26')]);
    expect(ids(out)).toEqual(['dinner', 'bday', 'weekend', 'holiday-US-2026-11-26-Thanksgiving Day']);
  });

  it('changes nothing without Public Holidays', () => {
    const events = [calendarHoliday('Veterans Day'), calendarHoliday('Veterans Day', '2026-11-11', { id: 'g2', sourceId: 'other' })];
    expect(dropDuplicateHolidays(events)).toEqual(events);
  });
});

describe('selectCalendarEvents drops the second copy after the module\'s own filters', () => {
  const now = new Date(2026, 10, 2, 12);
  const both = [calendarHoliday('Veterans Day'), publicHoliday('Veterans Day')];

  it('shows the holiday once', () => {
    expect(selectCalendarEvents(both, { now })).toHaveLength(1);
  });

  it('keeps the calendar\'s copy when the module leaves Public Holidays out', () => {
    const out = selectCalendarEvents(both, { now, sourceFilter: ['us-holidays'] });
    expect(ids(out)).toEqual(['g-Veterans Day-2026-11-11']);
  });

  it('keeps the calendar\'s copy when a rule hides the holidays', () => {
    const out = selectCalendarEvents(both, { now, eventRules: [{ id: 'r1', match: { kind: 'holiday' }, hide: true }] });
    expect(ids(out)).toEqual(['g-Veterans Day-2026-11-11']);
  });
});
