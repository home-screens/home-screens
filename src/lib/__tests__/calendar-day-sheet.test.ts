import { describe, it, expect } from 'vitest';
import { daySheetHeading, daySheetRows } from '@/lib/calendar-day-sheet';

/** Friday, November 6 2026, the busy day in the mockup. */
const FRIDAY = new Date(2026, 10, 6);

function ev(id: string, title: string, start: string, end: string, allDay = false) {
  return { id, title, start, end, allDay };
}

describe('daySheetRows', () => {
  it('lists all-day rows first, then timed rows by start', () => {
    const rows = daySheetRows([
      ev('swim', 'Swim lessons', '2026-11-06T17:00:00', '2026-11-06T17:45:00'),
      ev('dentist', 'Dentist', '2026-11-06T07:30:00', '2026-11-06T08:15:00'),
      ev('recycling', 'Recycling', '2026-11-06', '2026-11-07', true),
      ev('pickup', 'Early pickup', '2026-11-06T13:15:00', '2026-11-06T13:45:00'),
    ], FRIDAY);
    expect(rows.map((r) => r.event.id)).toEqual(['recycling', 'dentist', 'pickup', 'swim']);
    expect(rows.map((r) => r.allDay)).toEqual([true, false, false, false]);
  });

  it('breaks a shared start by the earlier end, then by title', () => {
    const rows = daySheetRows([
      ev('long', 'Soccer practice', '2026-11-06T17:30:00', '2026-11-06T19:00:00'),
      ev('b', 'Band', '2026-11-06T17:30:00', '2026-11-06T18:00:00'),
      ev('a', 'Art', '2026-11-06T17:30:00', '2026-11-06T18:00:00'),
    ], FRIDAY);
    expect(rows.map((r) => r.event.id)).toEqual(['a', 'b', 'long']);
  });

  it('keeps an event listed twice once, and leaves out one that is not on the day', () => {
    const dentist = ev('dentist', 'Dentist', '2026-11-06T07:30:00', '2026-11-06T08:15:00');
    const rows = daySheetRows([
      dentist,
      ev('saturday', 'Soccer game', '2026-11-07T09:00:00', '2026-11-07T10:30:00'),
      dentist,
    ], FRIDAY);
    expect(rows.map((r) => r.event.id)).toEqual(['dentist']);
  });

  it('marks the ends of a timed event that crosses midnight, and fills a day it runs through', () => {
    const rows = daySheetRows([
      ev('sleepover', 'Sleepover', '2026-11-06T19:00:00', '2026-11-07T10:00:00'),
      ev('trip', 'Camping trip', '2026-11-05T18:00:00', '2026-11-07T12:00:00'),
      ev('late', 'Late shift', '2026-11-05T22:00:00', '2026-11-06T06:00:00'),
    ], FRIDAY);
    const byId = Object.fromEntries(rows.map((r) => [r.event.id, r]));
    expect(byId.trip).toMatchObject({ allDay: true });
    expect(byId.late).toMatchObject({ allDay: false, startsEarlier: true, endsLater: false });
    expect(byId.sleepover).toMatchObject({ allDay: false, startsEarlier: false, endsLater: true });
    // The whole-day row leads; the one that began yesterday sorts before tonight's.
    expect(rows.map((r) => r.event.id)).toEqual(['trip', 'late', 'sleepover']);
  });

  it('does not call an event that ends exactly at midnight a next-day end', () => {
    const [row] = daySheetRows([ev('party', 'Party', '2026-11-06T20:00:00', '2026-11-07T00:00:00')], FRIDAY);
    expect(row).toMatchObject({ allDay: false, startsEarlier: false, endsLater: false });
  });

  it('keeps a multi-day all-day event on each day it covers', () => {
    const rows = daySheetRows([ev('break', 'Fall break', '2026-11-05', '2026-11-09', true)], FRIDAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].allDay).toBe(true);
  });

  it('reads timed events in the display time zone', () => {
    // 03:30 UTC on Friday is 21:30 on Thursday in Chicago; 03:30 UTC on
    // Saturday is 21:30 on Friday there.
    const rows = daySheetRows([
      ev('thu', 'Thursday call', '2026-11-06T03:30:00Z', '2026-11-06T04:00:00Z'),
      ev('fri', 'Friday call', '2026-11-07T03:30:00Z', '2026-11-07T04:00:00Z'),
    ], FRIDAY, 'America/Chicago');
    expect(rows.map((r) => r.event.id)).toEqual(['fri']);
    expect(rows[0].start.getHours()).toBe(21);
  });
});

describe('daySheetHeading', () => {
  it('names the weekday and the date in English', () => {
    expect(daySheetHeading(FRIDAY, 'en-US')).toEqual({ weekday: 'Friday', date: 'November 6', full: 'Friday, November 6' });
  });

  it('follows the language for the date order and capitalizes the big line only', () => {
    expect(daySheetHeading(FRIDAY, 'de-DE')).toMatchObject({ weekday: 'Freitag', date: '6. November' });
    const fr = daySheetHeading(FRIDAY, 'fr-FR');
    expect(fr.weekday).toBe('vendredi');
    expect(fr.date).toBe('6 novembre');
    // The label runs mid-sentence ("Voir toute la journée du vendredi 6 novembre").
    expect(fr.full).toBe('vendredi 6 novembre');
    expect(daySheetHeading(FRIDAY, 'da-DK').date).toBe('6. november');
  });
});
