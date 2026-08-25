import { describe, it, expect } from 'vitest';
import type { CalendarEvent, CalendarPerson } from '@/types/config';
import {
  buildPersonRows, eventsForRow, initialsOf, busyBlocksForDay, freeGaps, commonFreeGaps, EVERYONE_ROW_ID,
} from '@/lib/calendar-people';

const ev = (id: string, sourceId: string | undefined, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: id, allDay: false, start: '2026-08-24T16:00:00', end: '2026-08-24T17:00:00', sourceId,
  sourceName: sourceId ? `${sourceId} cal` : undefined, calendarColor: '#123456', ...extra,
});

const people: CalendarPerson[] = [
  { id: 'p-ella', name: 'Ella', color: '#db2777', sourceIds: ['src-ella'] },
  { id: 'p-owen', name: 'Owen Lee', color: '#ea580c', sourceIds: ['src-owen', 'src-owen-school'] },
];
const opts = { everyoneLabel: 'Everyone', everyoneColor: '#888', includeEveryone: true };

describe('initialsOf', () => {
  it('takes one letter for a single word and two for two words', () => {
    expect(initialsOf('Ella')).toBe('E');
    expect(initialsOf('owen lee')).toBe('OL');
    expect(initialsOf('Mary Ann Smith')).toBe('MA');
    expect(initialsOf('  ')).toBe('?');
  });
});

describe('buildPersonRows with people configured', () => {
  it('lists every person even with no events, in settings order', () => {
    const rows = buildPersonRows([], people, opts);
    expect(rows.map((r) => r.id)).toEqual(['p-ella', 'p-owen']);
    expect(rows[1].initials).toBe('OL');
  });

  it('adds the Everyone row first only when an unclaimed event exists', () => {
    const rows = buildPersonRows([ev('a', 'src-family'), ev('b', 'src-ella')], people, opts);
    expect(rows[0].id).toBe(EVERYONE_ROW_ID);
    expect(rows[0].sourceIds).toBeNull();
    expect(buildPersonRows([ev('b', 'src-ella')], people, opts).map((r) => r.id)).toEqual(['p-ella', 'p-owen']);
    expect(buildPersonRows([ev('a', 'src-family')], people, { ...opts, includeEveryone: false }).map((r) => r.id)).toEqual(['p-ella', 'p-owen']);
  });

  it('routes events: a person takes their sources, Everyone takes the rest', () => {
    const events = [ev('a', 'src-family'), ev('b', 'src-ella'), ev('c', 'src-owen-school'), ev('h', 'holidays', { kind: 'holiday' }), ev('n', undefined)];
    const rows = buildPersonRows(events, people, opts);
    const byRow = Object.fromEntries(rows.map((r) => [r.id, eventsForRow(events, r, rows).map((e) => e.id)]));
    expect(byRow[EVERYONE_ROW_ID]).toEqual(['a', 'h', 'n']);
    expect(byRow['p-ella']).toEqual(['b']);
    expect(byRow['p-owen']).toEqual(['c']);
  });
});

describe('buildPersonRows fallback (no people)', () => {
  it('makes one row per source seen, sorted by name, with holidays on Everyone', () => {
    const events = [ev('a', 'zeta'), ev('b', 'alpha'), ev('c', 'alpha'), ev('h', 'holidays', { kind: 'holiday' })];
    const rows = buildPersonRows(events, undefined, opts);
    expect(rows.map((r) => r.id)).toEqual([EVERYONE_ROW_ID, 'alpha', 'zeta']);
    expect(rows[1].name).toBe('alpha cal');
    expect(rows[1].color).toBe('#123456');
    expect(eventsForRow(events, rows[1], rows).map((e) => e.id)).toEqual(['b', 'c']);
    expect(eventsForRow(events, rows[0], rows).map((e) => e.id)).toEqual(['h']);
  });

  it('returns no rows for an empty feed', () => {
    expect(buildPersonRows([], undefined, opts)).toEqual([]);
    expect(buildPersonRows([], [], opts)).toEqual([]);
  });
});

describe('free time', () => {
  const day = new Date(2026, 7, 24);

  it('busyBlocksForDay clamps timed events to the window and skips all-day rows', () => {
    const events = [
      ev('early', 's', { start: '2026-08-24T05:00:00', end: '2026-08-24T08:00:00' }),
      ev('late', 's', { start: '2026-08-24T21:00:00', end: '2026-08-24T23:30:00' }),
      ev('out', 's', { start: '2026-08-24T02:00:00', end: '2026-08-24T06:00:00' }),
      ev('allday', 's', { allDay: true, start: '2026-08-24', end: '2026-08-25' }),
      ev('other-day', 's', { start: '2026-08-25T10:00:00', end: '2026-08-25T11:00:00' }),
    ];
    const blocks = busyBlocksForDay(events, day, 7, 22);
    expect(blocks.map((b) => [b.id, b.start, b.end])).toEqual([['early', 7, 8], ['late', 21, 22]]);
  });

  it('freeGaps merges overlaps and drops gaps under the minimum', () => {
    const blocks = [
      { id: 'a', title: 'a', color: '#000', start: 9, end: 10 },
      { id: 'b', title: 'b', color: '#000', start: 9.5, end: 11 },
      { id: 'c', title: 'c', color: '#000', start: 11.25, end: 12 },
    ];
    expect(freeGaps(blocks, 7, 22, 0.5)).toEqual([{ start: 7, end: 9 }, { start: 12, end: 22 }]);
    expect(freeGaps([], 7, 22, 0.5)).toEqual([{ start: 7, end: 22 }]);
  });

  it('commonFreeGaps intersects every list', () => {
    const a = [{ start: 7, end: 9 }, { start: 15, end: 22 }];
    const b = [{ start: 8, end: 12 }, { start: 18, end: 20 }];
    const c = [{ start: 7, end: 22 }];
    expect(commonFreeGaps([a, b, c], 1)).toEqual([{ start: 8, end: 9 }, { start: 18, end: 20 }]);
    expect(commonFreeGaps([a, b, c], 1.5)).toEqual([{ start: 18, end: 20 }]);
    expect(commonFreeGaps([], 1)).toEqual([]);
  });
});
