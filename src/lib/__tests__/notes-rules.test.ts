import { describe, it, expect } from 'vitest';
import {
  applyFilter,
  arrangeNotes,
  cardColumns,
  expiryFor,
  formatNoteAge,
  goneNotes,
  groupByDay,
  initialOf,
  isGone,
  isLive,
  isSweepable,
  sortByTime,
  sortForWall,
  stepOrder,
  tiltFor,
  timeLeftMs,
  timeLeftParts,
} from '../notes-rules';
import { NOTES_GONE_KEEP_MS, type Note } from '@/types/notes';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-20T15:00:00.000Z');
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    text: `Note ${id}`,
    pinned: false,
    important: false,
    life: '1d',
    createdAt: at(-HOUR),
    updatedAt: at(-HOUR),
    expiresAt: at(DAY),
    ...overrides,
  };
}

describe('expiryFor', () => {
  it('adds each timed preset to the start instant', () => {
    expect(expiryFor('12h', NOW)).toBe(at(12 * HOUR));
    expect(expiryFor('1d', NOW)).toBe(at(DAY));
    expect(expiryFor('3d', NOW)).toBe(at(3 * DAY));
    expect(expiryFor('7d', NOW)).toBe(at(7 * DAY));
  });

  it('gives keep no expiry', () => {
    expect(expiryFor('keep', NOW)).toBeNull();
  });
});

describe('isLive, isGone and isSweepable', () => {
  it('keeps a note with no expiry live, never gone and never sweepable', () => {
    const forever = { expiresAt: null };
    expect(isLive(forever, NOW)).toBe(true);
    expect(isGone(forever, NOW)).toBe(false);
    expect(isSweepable(forever, new Date(NOW.getTime() + 365 * DAY))).toBe(false);
  });

  it('keeps a note live while its expiry is still ahead', () => {
    expect(isLive({ expiresAt: at(1) }, NOW)).toBe(true);
    expect(isGone({ expiresAt: at(1) }, NOW)).toBe(false);
  });

  it('counts a note whose expiry equals now as gone', () => {
    expect(isLive({ expiresAt: at(0) }, NOW)).toBe(false);
    expect(isGone({ expiresAt: at(0) }, NOW)).toBe(true);
  });

  it('only sweeps a gone note once it has been gone for longer than the keep window', () => {
    expect(isSweepable({ expiresAt: at(-HOUR) }, NOW)).toBe(false);
    expect(isSweepable({ expiresAt: at(-NOTES_GONE_KEEP_MS) }, NOW)).toBe(false);
    expect(isSweepable({ expiresAt: at(-NOTES_GONE_KEEP_MS - 1) }, NOW)).toBe(true);
    expect(NOTES_GONE_KEEP_MS).toBe(7 * DAY);
  });

  it('treats an unreadable expiry as live and never sweeps it', () => {
    expect(isLive({ expiresAt: 'not a date' }, NOW)).toBe(true);
    expect(isSweepable({ expiresAt: 'not a date' }, NOW)).toBe(false);
  });
});

describe('timeLeftMs', () => {
  it('is null for keep, positive while live and zero or less once gone', () => {
    expect(timeLeftMs({ expiresAt: null }, NOW)).toBeNull();
    expect(timeLeftMs({ expiresAt: at(5 * MINUTE) }, NOW)).toBe(5 * MINUTE);
    expect(timeLeftMs({ expiresAt: at(0) }, NOW)).toBe(0);
    expect(timeLeftMs({ expiresAt: at(-HOUR) }, NOW)).toBe(-HOUR);
  });

  it('is null for an unreadable expiry', () => {
    expect(timeLeftMs({ expiresAt: 'garbage' }, NOW)).toBeNull();
  });
});

describe('sortForWall', () => {
  it('puts pinned notes first, then newest first', () => {
    const notes = [
      note('old', { createdAt: at(-3 * HOUR) }),
      note('pinned-old', { pinned: true, createdAt: at(-5 * HOUR) }),
      note('new', { createdAt: at(-MINUTE) }),
      note('pinned-new', { pinned: true, createdAt: at(-2 * HOUR) }),
    ];
    expect(sortForWall(notes).map((n) => n.id)).toEqual(['pinned-new', 'pinned-old', 'new', 'old']);
  });

  it('keeps store order for notes posted at the same instant', () => {
    const same = at(-HOUR);
    const notes = ['a', 'b', 'c', 'd'].map((id) => note(id, { createdAt: same }));
    expect(sortForWall(notes).map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves the input untouched and sorts an unreadable date as the oldest', () => {
    const notes = [note('broken', { createdAt: 'nope' }), note('fine')];
    const before = notes.map((n) => n.id);
    expect(sortForWall(notes).map((n) => n.id)).toEqual(['fine', 'broken']);
    expect(notes.map((n) => n.id)).toEqual(before);
  });
});

describe('sortByTime', () => {
  it('orders newest first and ignores the pin', () => {
    const notes = [
      note('pinned-old', { pinned: true, createdAt: at(-5 * HOUR) }),
      note('new', { createdAt: at(-MINUTE) }),
      note('mid', { createdAt: at(-2 * HOUR) }),
    ];
    expect(sortByTime(notes).map((n) => n.id)).toEqual(['new', 'mid', 'pinned-old']);
  });

  it('keeps store order on ties', () => {
    const notes = ['x', 'y', 'z'].map((id) => note(id, { createdAt: at(-HOUR) }));
    expect(sortByTime(notes).map((n) => n.id)).toEqual(['x', 'y', 'z']);
  });
});

describe('applyFilter', () => {
  const notes = [note('plain'), note('pin', { pinned: true }), note('imp', { important: true }), note('both', { pinned: true, important: true })];

  it('keeps everything for all or no filter, as a copy', () => {
    expect(applyFilter(notes, 'all').map((n) => n.id)).toEqual(['plain', 'pin', 'imp', 'both']);
    const copy = applyFilter(notes, undefined);
    expect(copy).toEqual(notes);
    expect(copy).not.toBe(notes);
  });

  it('keeps only the pinned or only the important notes', () => {
    expect(applyFilter(notes, 'pinned').map((n) => n.id)).toEqual(['pin', 'both']);
    expect(applyFilter(notes, 'important').map((n) => n.id)).toEqual(['imp', 'both']);
  });
});

describe('arrangeNotes', () => {
  const notes = [
    note('gone', { expiresAt: at(-MINUTE), createdAt: at(-MINUTE) }),
    note('n1', { createdAt: at(-1 * HOUR) }),
    note('n2', { createdAt: at(-2 * HOUR), important: true }),
    note('n3', { createdAt: at(-3 * HOUR) }),
    note('pin', { createdAt: at(-9 * HOUR), pinned: true, expiresAt: null }),
  ];

  it('shows only live notes, in wall order, with no cap by default', () => {
    const { shown, hidden, all } = arrangeNotes(notes, NOW);
    expect(shown.map((n) => n.id)).toEqual(['pin', 'n1', 'n2', 'n3']);
    expect(all).toEqual(shown);
    expect(hidden).toBe(0);
  });

  it('treats a max of 0 or a negative max as no cap', () => {
    expect(arrangeNotes(notes, NOW, { max: 0 }).shown).toHaveLength(4);
    expect(arrangeNotes(notes, NOW, { max: -3 }).shown).toHaveLength(4);
  });

  it('caps at max and counts the rest as hidden', () => {
    const { shown, hidden, all } = arrangeNotes(notes, NOW, { max: 2 });
    expect(shown.map((n) => n.id)).toEqual(['pin', 'n1']);
    expect(hidden).toBe(2);
    expect(all.map((n) => n.id)).toEqual(['pin', 'n1', 'n2', 'n3']);
  });

  it('rounds a fractional max down', () => {
    expect(arrangeNotes(notes, NOW, { max: 2.9 }).shown).toHaveLength(2);
  });

  it('hides nothing when max is larger than the board', () => {
    expect(arrangeNotes(notes, NOW, { max: 50 })).toMatchObject({ hidden: 0 });
  });

  it('filters before capping, so the hidden count is of matching notes only', () => {
    const { shown, hidden } = arrangeNotes(notes, NOW, { filter: 'important', max: 1 });
    expect(shown.map((n) => n.id)).toEqual(['n2']);
    expect(hidden).toBe(0);
  });

  it('gives an empty board nothing to show', () => {
    expect(arrangeNotes([], NOW, { max: 3 })).toEqual({ shown: [], hidden: 0, all: [] });
  });
});

describe('goneNotes', () => {
  it('lists gone notes inside the keep window, newest expiry first', () => {
    const notes = [
      note('live', { expiresAt: at(HOUR) }),
      note('keep', { expiresAt: null }),
      note('gone-2d', { expiresAt: at(-2 * DAY) }),
      note('gone-now', { expiresAt: at(0) }),
      note('gone-1h', { expiresAt: at(-HOUR) }),
      note('swept', { expiresAt: at(-NOTES_GONE_KEEP_MS - 1) }),
      note('edge', { expiresAt: at(-NOTES_GONE_KEEP_MS) }),
    ];
    expect(goneNotes(notes, NOW).map((n) => n.id)).toEqual(['gone-now', 'gone-1h', 'gone-2d', 'edge']);
  });
});

describe('stepOrder', () => {
  it('gives every pinned or important note two turns in a row', () => {
    const shown = [note('plain'), note('pin', { pinned: true }), note('imp', { important: true }), note('both', { pinned: true, important: true }), note('last')];
    expect(stepOrder(shown).map((n) => n.id)).toEqual(['plain', 'pin', 'pin', 'imp', 'imp', 'both', 'both', 'last']);
  });

  it('walks an empty list as empty', () => {
    expect(stepOrder([])).toEqual([]);
  });
});

describe('tiltFor', () => {
  it('gives the same id the same lean every time', () => {
    expect(tiltFor('7f0c2a4e-dentist')).toBe(tiltFor('7f0c2a4e-dentist'));
  });

  it('stays within 1.6 degrees either way, to one decimal, across a thousand ids', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const tilt = tiltFor(`note-${i}-${(i * 7919).toString(36)}`);
      expect(tilt).toBeGreaterThanOrEqual(-1.6);
      expect(tilt).toBeLessThanOrEqual(1.6);
      expect(Math.round(tilt * 10) / 10).toBe(tilt);
      seen.add(tilt);
    }
    // A spread, not one lean for everything.
    expect(seen.size).toBeGreaterThan(10);
  });

  it('handles an empty id and a long id', () => {
    expect(tiltFor('')).toBe(-1.6);
    const long = tiltFor('x'.repeat(10_000));
    expect(long).toBeGreaterThanOrEqual(-1.6);
    expect(long).toBeLessThanOrEqual(1.6);
  });
});

describe('cardColumns', () => {
  it('draws one column under 400 px, two under 900 px and three above', () => {
    expect(cardColumns(0)).toBe(1);
    expect(cardColumns(399)).toBe(1);
    expect(cardColumns(400)).toBe(2);
    expect(cardColumns(899)).toBe(2);
    expect(cardColumns(900)).toBe(3);
    expect(cardColumns(2160)).toBe(3);
  });
});

describe('initialOf', () => {
  it('takes the first letter of the trimmed name, upper-cased', () => {
    expect(initialOf('ada')).toBe('A');
    expect(initialOf('  Ben ')).toBe('B');
    expect(initialOf('élise')).toBe('É');
  });

  it('gives an empty name no initial', () => {
    expect(initialOf('')).toBe('');
    expect(initialOf('   ')).toBe('');
  });

  it('takes the first letter of the first word that has one, never half an emoji', () => {
    expect(initialOf('Big Guns')).toBe('B');
    expect(initialOf('\u{1F984} Mia')).toBe('M');
  });

  it('falls back to the first whole character of a name with no letter', () => {
    expect(initialOf('\u{1F984}')).toBe('\u{1F984}');
    expect(initialOf('\u{1F984} \u{1F31F}')).toBe('\u{1F984}');
    expect(initialOf('42')).toBe('4');
  });
});

describe('formatNoteAge', () => {
  // English takes the narrow form ("5m ago"); every other language the short
  // one, because narrow is a negative number in French and a bare letter in German.
  const rel = (locale: string, value: number, unit: Intl.RelativeTimeFormatUnit) =>
    new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: locale.startsWith('en') ? 'narrow' : 'short' }).format(-value, unit);
  const weekday = (locale: string, iso: string, timeZone?: string) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone }).format(new Date(iso));
  const shortDate = (locale: string, iso: string, timeZone?: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone }).format(new Date(iso));

  it('never reads as a negative number in French', () => {
    const fr = formatNoteAge(at(-5 * MINUTE), NOW, 'fr-FR');
    expect(fr).not.toMatch(/^[-\u2212]/);
    expect(fr.replace(/\s/g, ' ')).toContain('il y a 5 min');
    expect(formatNoteAge(at(-2 * HOUR), NOW, 'de-DE').replace(/\s/g, ' ')).toContain('vor 2 Std.');
  });

  it('reads in whole minutes under an hour, never below one minute', () => {
    expect(formatNoteAge(at(-25 * MINUTE - 40_000), NOW, 'en-US')).toBe(rel('en-US', 25, 'minute'));
    expect(formatNoteAge(at(-59 * MINUTE - 59_000), NOW, 'en-US')).toBe(rel('en-US', 59, 'minute'));
    expect(formatNoteAge(at(-5_000), NOW, 'en-US')).toBe(rel('en-US', 1, 'minute'));
    expect(formatNoteAge(at(0), NOW, 'en-US')).toBe(rel('en-US', 1, 'minute'));
  });

  it('reads a note from a clock running ahead as just posted', () => {
    expect(formatNoteAge(at(10 * MINUTE), NOW, 'en-US')).toBe(rel('en-US', 1, 'minute'));
  });

  it('reads in whole hours from one hour up to a day', () => {
    expect(formatNoteAge(at(-HOUR), NOW, 'en-US')).toBe(rel('en-US', 1, 'hour'));
    expect(formatNoteAge(at(-2 * HOUR - 59 * MINUTE), NOW, 'en-US')).toBe(rel('en-US', 2, 'hour'));
    expect(formatNoteAge(at(-DAY + 1), NOW, 'en-US')).toBe(rel('en-US', 23, 'hour'));
  });

  it('reads the short weekday from one day to under a week', () => {
    const posted = at(-DAY);
    expect(formatNoteAge(posted, NOW, 'en-US', 'UTC')).toBe(weekday('en-US', posted, 'UTC'));
    const almostWeek = at(-7 * DAY + 1);
    expect(formatNoteAge(almostWeek, NOW, 'en-US', 'UTC')).toBe(weekday('en-US', almostWeek, 'UTC'));
  });

  it('reads a short date from a week on', () => {
    const posted = at(-7 * DAY);
    expect(formatNoteAge(posted, NOW, 'en-US', 'UTC')).toBe(shortDate('en-US', posted, 'UTC'));
    expect(formatNoteAge(at(-40 * DAY), NOW, 'en-US', 'UTC')).toBe(shortDate('en-US', at(-40 * DAY), 'UTC'));
  });

  it("names the weekday in the household's zone, not the hub's", () => {
    // 03:00 UTC on a Tuesday is still Monday evening in Minnesota.
    const now = new Date('2026-10-22T12:00:00.000Z');
    const posted = '2026-10-20T03:00:00.000Z';
    expect(formatNoteAge(posted, now, 'en-US', 'UTC')).toBe('Tue');
    expect(formatNoteAge(posted, now, 'en-US', 'America/Chicago')).toBe('Mon');
  });

  it("speaks the household's language", () => {
    expect(formatNoteAge(at(-25 * MINUTE), NOW, 'de-DE')).toBe(rel('de-DE', 25, 'minute'));
    expect(formatNoteAge(at(-2 * HOUR), NOW, 'de-DE')).toBe(rel('de-DE', 2, 'hour'));
    expect(formatNoteAge(at(-25 * MINUTE), NOW, 'de-DE')).not.toBe(formatNoteAge(at(-25 * MINUTE), NOW, 'en-US'));
    const posted = '2026-10-20T03:00:00.000Z';
    const now = new Date('2026-10-22T12:00:00.000Z');
    expect(formatNoteAge(posted, now, 'de-DE', 'UTC')).toBe(weekday('de-DE', posted, 'UTC'));
    const older = '2026-10-01T03:00:00.000Z';
    expect(formatNoteAge(older, now, 'de-DE', 'UTC')).toBe(shortDate('de-DE', older, 'UTC'));
    expect(formatNoteAge(older, now, 'de-DE', 'UTC')).not.toBe(formatNoteAge(older, now, 'en-US', 'UTC'));
  });

  it('gives an unreadable date, locale or zone an empty string', () => {
    expect(formatNoteAge('not a date', NOW, 'en-US')).toBe('');
    expect(formatNoteAge('', NOW, 'en-US')).toBe('');
    expect(formatNoteAge(at(-MINUTE), NOW, '!!not-a-locale')).toBe('');
    expect(formatNoteAge(at(-3 * DAY), NOW, 'en-US', 'Not/AZone')).toBe('');
  });
});

describe('timeLeftParts', () => {
  const left = (ms: number) => timeLeftParts({ expiresAt: at(ms) }, NOW);

  it('counts minutes under an hour, never below one', () => {
    expect(left(30_000)).toEqual({ unit: 'minute', value: 1 });
    expect(left(25 * MINUTE)).toEqual({ unit: 'minute', value: 25 });
    expect(left(59 * MINUTE)).toEqual({ unit: 'minute', value: 59 });
  });

  it('rounds before it picks the unit, so the last half minute of an hour reads as 1 hour', () => {
    expect(left(59 * MINUTE + 29_000)).toEqual({ unit: 'minute', value: 59 });
    expect(left(59 * MINUTE + 30_000)).toEqual({ unit: 'hour', value: 1 });
    expect(left(HOUR - 1)).toEqual({ unit: 'hour', value: 1 });
  });

  it('reads the last half hour of a day as 1 day', () => {
    expect(left(23 * HOUR + 29 * MINUTE)).toEqual({ unit: 'hour', value: 23 });
    expect(left(23 * HOUR + 30 * MINUTE)).toEqual({ unit: 'day', value: 1 });
    expect(left(DAY - 1)).toEqual({ unit: 'day', value: 1 });
  });

  it('counts rounded hours under a day', () => {
    expect(left(HOUR)).toEqual({ unit: 'hour', value: 1 });
    expect(left(22 * HOUR + 10 * MINUTE)).toEqual({ unit: 'hour', value: 22 });
    expect(left(2 * HOUR + 30 * MINUTE)).toEqual({ unit: 'hour', value: 3 });
  });

  it('counts rounded days from a day on', () => {
    expect(left(DAY)).toEqual({ unit: 'day', value: 1 });
    expect(left(4 * DAY - 2 * HOUR)).toEqual({ unit: 'day', value: 4 });
    expect(left(7 * DAY)).toEqual({ unit: 'day', value: 7 });
  });

  it('gives a gone note a value of 0', () => {
    expect(left(0)).toEqual({ unit: 'minute', value: 0 });
    expect(left(-DAY)).toEqual({ unit: 'minute', value: 0 });
  });

  it('gives a kept note no unit', () => {
    expect(timeLeftParts({ expiresAt: null }, NOW)).toEqual({ unit: null, value: 0 });
  });
});

describe('groupByDay', () => {
  const dayOf = (iso: string) => iso.slice(0, 10);

  it('groups newest day first and newest note first inside a day', () => {
    const notes = [
      note('mon-am', { createdAt: '2026-10-19T08:00:00.000Z' }),
      note('tue-pm', { createdAt: '2026-10-20T18:00:00.000Z' }),
      note('mon-pm', { createdAt: '2026-10-19T20:00:00.000Z' }),
      note('sun', { createdAt: '2026-10-18T12:00:00.000Z' }),
      note('tue-am', { createdAt: '2026-10-20T07:00:00.000Z', pinned: true }),
    ];
    expect(groupByDay(notes, dayOf).map((g) => ({ day: g.day, ids: g.notes.map((n) => n.id) }))).toEqual([
      { day: '2026-10-20', ids: ['tue-pm', 'tue-am'] },
      { day: '2026-10-19', ids: ['mon-pm', 'mon-am'] },
      { day: '2026-10-18', ids: ['sun'] },
    ]);
  });

  it("uses the caller's day, so a late-evening note lands on the household's day", () => {
    const notes = [note('late', { createdAt: '2026-10-20T03:00:00.000Z' }), note('noon', { createdAt: '2026-10-19T17:00:00.000Z' })];
    const chicago = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(iso));
    expect(groupByDay(notes, chicago)).toEqual([{ day: '2026-10-19', notes: [notes[0], notes[1]] }]);
  });

  it('gives no notes no groups', () => {
    expect(groupByDay([], dayOf)).toEqual([]);
  });
});
