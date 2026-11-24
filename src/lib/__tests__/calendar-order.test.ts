import { describe, it, expect } from 'vitest';
import { calendarRanker, keepMostWanted, wantedFirst } from '@/lib/calendar-order';

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

describe('keepMostWanted', () => {
  const rank = calendarRanker(['birthdays', 'fam']);
  // A day as a view lists it: in time order.
  const day = [ev('bins', '2026-03-02T07:00:00'), ev('fam', '2026-03-02T09:00:00'), ev('work', '2026-03-02T13:00:00'), ev('birthdays', '2026-03-02T18:00:00')];
  const keep = (count: number, ordered = true) =>
    titles(keepMostWanted(day, count, wantedFirst(day, ordered ? rank : undefined, (e) => e.sourceId)));

  it('keeps the calendars that matter, and still reads in time order', () => {
    // Birthdays and fam win the two rows; fam is earlier, so it is drawn first.
    expect(keep(2)).toEqual(['fam@09:00', 'birthdays@18:00']);
  });

  it('gives a spare row to the earliest of the calendars nobody ranked', () => {
    expect(keep(3)).toEqual(['bins@07:00', 'fam@09:00', 'birthdays@18:00']);
  });

  it('is the first few in time order when no order is saved', () => {
    expect(keep(2, false)).toEqual(['bins@07:00', 'fam@09:00']);
  });

  it('changes nothing when everything fits', () => {
    expect(keep(9)).toEqual(titles(day));
  });

  it('keeps a pinned (all-day) event ahead of any calendar', () => {
    const list = [ev('bins', '2026-03-02T00:00:00', true), ...day.slice(1)];
    const kept = keepMostWanted(list, 2, wantedFirst(list, rank, (e) => e.sourceId, (e) => e.allDay));
    expect(titles(kept)).toEqual(['bins@00:00', 'birthdays@18:00']);
  });
});
