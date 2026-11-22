import { describe, it, expect } from 'vitest';
import { buildLegendRows } from '@/lib/calendar-legend';

const LABELS = { holidays: 'Holidays', everyone: 'Everyone' };

const ev = (sourceId: string, sourceName: string, color: string) => ({
  start: '2026-11-19T09:00', end: '2026-11-19T10:00', sourceId, sourceName, calendarColor: color,
});

/** Source-mode legend, no window scoping, no people. */
const legend = (events: ReturnType<typeof ev>[], order?: string[]) =>
  buildLegendRows(events, null, undefined, LABELS, undefined, undefined, undefined, order)
    .map((row) => row.name);

describe('legend order follows the household order', () => {
  // Arrives in the order the feed happens to list them.
  const events = [
    ev('friends', 'friends', '#10b981'),
    ev('fam', 'fam', '#3b82f6'),
    ev('bdays', 'birthdays', '#f59e0b'),
  ];

  it('keeps first-seen order when nothing is saved', () => {
    expect(legend(events)).toEqual(['friends', 'fam', 'birthdays']);
  });

  it('reorders to match the saved order', () => {
    // The key should read in the same order the cells do, so it doubles as a
    // reminder of which calendar wins a crowded day.
    expect(legend(events, ['bdays', 'fam', 'friends'])).toEqual(['birthdays', 'fam', 'friends']);
  });

  it('puts an unlisted calendar last, keeping its first-seen place', () => {
    const withExtra = [...events, ev('other', 'other', '#ef4444')];
    expect(legend(withExtra, ['bdays', 'fam'])).toEqual(['birthdays', 'fam', 'friends', 'other']);
  });

  it('is unaffected by an order naming calendars that are not showing', () => {
    expect(legend(events, ['gone', 'bdays'])).toEqual(['birthdays', 'friends', 'fam']);
  });

  it('leaves the rows alone when the order is empty', () => {
    expect(legend(events, [])).toEqual(['friends', 'fam', 'birthdays']);
  });
});
