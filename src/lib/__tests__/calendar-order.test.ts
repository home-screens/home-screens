import { describe, it, expect } from 'vitest';
import { calendarRanker, byCalendarThenTime } from '@/lib/calendar-order';

const ev = (sourceId: string | undefined, start: string, allDay = false) =>
  ({ id: start + sourceId, start, sourceId, allDay });

const titles = (list: { start: string; sourceId?: string }[]) =>
  list.map((e) => `${e.sourceId ?? '-'}@${e.start.slice(11, 16)}`);

describe('calendarRanker', () => {
  it('ranks by position in the list', () => {
    const rank = calendarRanker(['birthdays', 'fam', 'friends']);
    expect(rank('birthdays')).toBe(0);
    expect(rank('friends')).toBe(2);
  });

  it('puts an unlisted calendar after every listed one', () => {
    const rank = calendarRanker(['birthdays']);
    expect(rank('something-else')).toBeGreaterThan(rank('birthdays'));
  });

  it('treats an event with no source as unlisted', () => {
    expect(calendarRanker(['a'])(undefined)).toBeGreaterThan(0);
  });

  it('lets the first mention win, so a duplicate cannot demote its own calendar', () => {
    const rank = calendarRanker(['fam', 'birthdays', 'fam']);
    expect(rank('fam')).toBe(0);
  });

  it('ranks everything equally when nothing is saved', () => {
    const rank = calendarRanker(undefined);
    expect(rank('a')).toBe(rank('b'));
  });
});

describe('byCalendarThenTime', () => {
  const order = ['birthdays', 'fam'];

  it('puts the higher calendar first even when it is later in the day', () => {
    const list = [ev('fam', '2026-11-19T07:00'), ev('birthdays', '2026-11-19T17:00')];
    expect(titles([...list].sort(byCalendarThenTime(order)))).toEqual(['birthdays@17:00', 'fam@07:00']);
  });

  it('falls back to time within one calendar', () => {
    const list = [ev('fam', '2026-11-19T17:00'), ev('fam', '2026-11-19T07:00')];
    expect(titles([...list].sort(byCalendarThenTime(order)))).toEqual(['fam@07:00', 'fam@17:00']);
  });

  it('is plain chronological order when nothing is saved', () => {
    const list = [ev('fam', '2026-11-19T17:00'), ev('birthdays', '2026-11-19T07:00')];
    expect(titles([...list].sort(byCalendarThenTime(undefined))))
      .toEqual(['birthdays@07:00', 'fam@17:00']);
  });

  it('sends unlisted calendars to the end, still in time order', () => {
    const list = [
      ev('other', '2026-11-19T08:00'),
      ev('fam', '2026-11-19T18:00'),
      ev('another', '2026-11-19T06:00'),
    ];
    expect(titles([...list].sort(byCalendarThenTime(order))))
      .toEqual(['fam@18:00', 'another@06:00', 'other@08:00']);
  });
});
