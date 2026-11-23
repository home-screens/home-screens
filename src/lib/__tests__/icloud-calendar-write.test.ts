import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICloudSource } from '@/types/config';
import type { ICloudAccount } from '@/lib/icloud-accounts';
import { silenceConsole } from '@/test-utils';

vi.mock('tsdav', () => ({ createDAVClient: vi.fn() }));
vi.mock('@/lib/google-auth', () => ({ getAuthenticatedClient: vi.fn() }));

const { createDAVClient } = await import('tsdav');
const w = await import('../icloud-calendar-write');
const { normalizeEventDraft } = await import('../calendar-write');
const { draftFromGoogle } = await import('../google-calendar-write');
const { parseICSEvents } = await import('../ical-calendar');
const { clearICloudCaches } = await import('../caldav-calendar');

const TZ = 'America/Chicago';
const NOW = new Date('2026-11-21T16:00:00Z');
const opts = { timezone: TZ, now: NOW };
const SOURCE: ICloudSource = {
  id: 'src-home',
  accountId: 'acct-1',
  kind: 'calendar',
  url: 'https://p52-caldav.icloud.com/123456/calendars/home/',
  name: 'Home',
  color: '#ef4444',
  enabled: true,
};
const ACCOUNT: ICloudAccount = { id: 'acct-1', appleId: 'family@icloud.com', appPassword: 'aaaa-bbbb-cccc-dddd' };
const OBJECT_URL = `${SOURCE.url}7F3A1C2E-1111-4A5B-9C9D-ABCDEF012345.ics`;
const UID = '7F3A1C2E-1111-4A5B-9C9D-ABCDEF012345';

const ics = (lines: string[]) => `${lines.join('\r\n')}\r\n`;

/** Read a document the way the wall does, for one month around the change. */
function read(text: string, from = '2026-09-01T00:00:00Z', to = '2027-01-01T00:00:00Z', tz = TZ) {
  return parseICSEvents(text, { id: SOURCE.id, name: SOURCE.name, color: SOURCE.color }, new Date(from), new Date(to), tz);
}

const CHICAGO_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/Chicago',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0600',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'DTSTART:20070311T020000',
  'TZNAME:CDT',
  'TZOFFSETTO:-0500',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0500',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'DTSTART:20071104T020000',
  'TZNAME:CST',
  'TZOFFSETTO:-0600',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** What Apple Calendar on an iPhone stores for "Soccer, every Saturday 9 to 10", with an invitee, a note and an alarm. */
function appleSeries(extraMaster: string[] = [], extraEvents: string[][] = []): string {
  return ics([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Apple Inc.//iOS 18.1//EN',
    'CALSCALE:GREGORIAN',
    ...CHICAGO_VTIMEZONE,
    'BEGIN:VEVENT',
    'CREATED:20260901T150000Z',
    'DTEND;TZID=America/Chicago:20260905T100000',
    'DTSTAMP:20260901T150000Z',
    'DTSTART;TZID=America/Chicago:20260905T090000',
    'LAST-MODIFIED:20260901T150000Z',
    'LOCATION:Lakefront Park',
    'RRULE:FREQ=WEEKLY',
    ...extraMaster,
    'SEQUENCE:0',
    'SUMMARY:Soccer',
    'TRANSP:OPAQUE',
    `UID:${UID}`,
    'ATTENDEE;CN="Lee: Sam";CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED:mailto:sam@example.com',
    'DESCRIPTION:Bring shin guards\\, water and snacks.\\nCoach: Pat',
    'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-TITLE=Lakefront Park:geo:44.71,-93.42',
    'X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-PT30M',
    'X-WR-ALARMUID:A1B2C3D4-0000-1111-2222-333344445555',
    'END:VALARM',
    'END:VEVENT',
    ...extraEvents.flat(),
    'END:VCALENDAR',
  ]);
}

function changedDay(recurrenceId: string, start: string, end: string, summary: string): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${UID}`,
    `RECURRENCE-ID;TZID=America/Chicago:${recurrenceId}`,
    'DTSTAMP:20260901T150000Z',
    `DTSTART;TZID=America/Chicago:${start}`,
    `DTEND;TZID=America/Chicago:${end}`,
    `SUMMARY:${summary}`,
    'LOCATION:Lakefront Park',
    'END:VEVENT',
  ];
}

const timed = (date: string, startTime: string, endTime: string, extra: Record<string, unknown> = {}) =>
  normalizeEventDraft({ title: 'Soccer', location: 'Lakefront Park', date, allDay: false, startTime, endTime, ...extra }, opts);

function veventBlocks(text: string): string[] {
  return text.split('BEGIN:VEVENT').slice(1).map((b) => b.split('END:VEVENT')[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  clearICloudCaches();
});

// ── ICS text ──────────────────────────────────────────────────────────

describe('ICS text', () => {
  it('escapes and unescapes TEXT values', () => {
    const typed = 'Lee\\Park; Field 3, North\nGate B';
    expect(w.escapeIcsText(typed)).toBe('Lee\\\\Park\\; Field 3\\, North\\nGate B');
    expect(w.unescapeIcsText(w.escapeIcsText(typed))).toBe(typed);
  });

  it('folds at 75 octets without splitting a character, and unfolds back', () => {
    const line = `SUMMARY:${'Grandma 👵🏽 visiting für Weihnachten, ünd so weiter '.repeat(4)}`;
    const folded = w.foldIcsLine(line);
    const physical = folded.split('\r\n');
    expect(physical.length).toBeGreaterThan(2);
    for (const [i, part] of physical.entries()) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
      if (i > 0) expect(part.startsWith(' ')).toBe(true);
      // A lone surrogate would mean a character was cut in two.
      expect(/[\uD800-\uDBFF]$/.test(part)).toBe(false);
    }
    expect(w.unfoldIcsLines(folded)).toEqual([line]);
  });

  it('leaves a short line alone', () => {
    expect(w.foldIcsLine('SUMMARY:Soccer')).toBe('SUMMARY:Soccer');
  });

  it('splits a content line at the first colon outside a quoted parameter', () => {
    expect(w.parseContentLine('ATTENDEE;CN="Lee: Sam";ROLE=REQ-PARTICIPANT:mailto:sam@example.com')).toEqual({
      name: 'ATTENDEE',
      params: ['CN="Lee: Sam"', 'ROLE=REQ-PARTICIPANT'],
      value: 'mailto:sam@example.com',
    });
  });

  it('parses and writes a document back without losing a line', () => {
    const text = appleSeries();
    const again = w.serializeIcsDocument(w.parseIcsDocument(text));
    expect(w.unfoldIcsLines(again)).toEqual(w.unfoldIcsLines(text));
  });
});

// ── New events ────────────────────────────────────────────────────────

describe('buildICloudEvent', () => {
  it('writes a timed repeating event on the household clock with its VTIMEZONE and the marker', () => {
    const event = timed('2026-10-24', '09:00', '10:00', { repeat: { frequency: 'weekly', until: '2026-12-26' } });
    const text = w.buildICloudEvent(event, { uid: 'abc@homescreens.dev', now: NOW });
    const lines = w.unfoldIcsLines(text);
    expect(lines.slice(0, 4)).toEqual(['BEGIN:VCALENDAR', 'PRODID:-//Home Screens//EN', 'VERSION:2.0', 'CALSCALE:GREGORIAN']);
    expect(lines).toEqual(expect.arrayContaining([
      'TZID:America/Chicago',
      'UID:abc@homescreens.dev',
      'DTSTAMP:20261121T160000Z',
      'DTSTART;TZID=America/Chicago:20261024T090000',
      'DTEND;TZID=America/Chicago:20261024T100000',
      'SUMMARY:Soccer',
      'LOCATION:Lakefront Park',
      // The last second of December 26 in Chicago, in UTC.
      'RRULE:FREQ=WEEKLY;UNTIL=20261227T055959Z',
      'X-HOME-SCREENS:1',
    ]));
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('writes an all-day event as dates with an exclusive end and no VTIMEZONE', () => {
    const event = normalizeEventDraft({ title: 'Grandma visiting', date: '2026-11-21', allDay: true, lastDate: '2026-11-22', repeat: { frequency: 'yearly' } }, opts);
    const lines = w.unfoldIcsLines(w.buildICloudEvent(event, { uid: 'u@homescreens.dev', now: NOW }));
    expect(lines).toEqual(expect.arrayContaining(['DTSTART;VALUE=DATE:20261121', 'DTEND;VALUE=DATE:20261123', 'RRULE:FREQ=YEARLY']));
    expect(lines.some((l) => l.startsWith('BEGIN:VTIMEZONE'))).toBe(false);
    expect(lines.some((l) => l.startsWith('LOCATION'))).toBe(false);
  });

  it('reads back through the wall parser with every awkward character intact', () => {
    const title = 'Piano, theory; and \\ "notes" 🎹 für Zoë at the Conservatory';
    const location = 'Room 4, 2nd floor; ring twice';
    const event = normalizeEventDraft({ title, location, date: '2026-11-23', allDay: false, startTime: '16:00', endTime: '16:45' }, opts);
    const text = w.buildICloudEvent(event, { uid: 'p@homescreens.dev', now: NOW });
    for (const physical of text.split('\r\n')) expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    const [read1] = read(text);
    expect(read1).toMatchObject({ title, location, allDay: false, start: '2026-11-23T22:00:00.000Z', end: '2026-11-23T22:45:00.000Z' });
  });

  it('keeps a next-day end on the next day', () => {
    const event = normalizeEventDraft({ title: 'Sleepover', date: '2026-11-27', allDay: false, startTime: '18:00', endTime: '10:00' }, opts);
    const [read1] = read(w.buildICloudEvent(event, { uid: 's@homescreens.dev', now: NOW }));
    expect(read1).toMatchObject({ start: '2026-11-28T00:00:00.000Z', end: '2026-11-28T16:00:00.000Z' });
  });
});

// ── VTIMEZONE ─────────────────────────────────────────────────────────

/** The zone's offset at an instant, in minutes east of UTC, from Intl: the reference the generated rules are held to. */
function intlOffset(zone: string, ms: number): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(ms))
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

function offsetText(text: string): number {
  const m = /([+-])(\d{2})(\d{2})/.exec(text)!;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Where a yearly `BYMONTH=..;BYDAY=nXX` rule lands in `year`, evaluated independently of the builder. */
function ruleDay(year: number, month: number, byDay: string): number {
  const m = /^(-?\d)(SU|MO|TU|WE|TH|FR|SA)$/.exec(byDay)!;
  const n = Number(m[1]);
  const weekday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(m[2]);
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastWeekday = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return lastDay - ((lastWeekday - weekday + 7) % 7);
}

/** Every observance's rule, checked against Intl for ten years: the clocks change exactly at the onset it names. */
function expectRulesMatchIntl(zone: string) {
  const vtz = w.vtimezoneFor(zone, 2026);
  for (const part of vtz.children) {
    const get = (name: string) => part.props.find((p) => p.startsWith(`${name}:`))!.slice(name.length + 1);
    const from = offsetText(get('TZOFFSETFROM'));
    const to = offsetText(get('TZOFFSETTO'));
    const rule = /BYMONTH=(\d+);BYDAY=([-\d]+[A-Z]{2})/.exec(get('RRULE'))!;
    const start = get('DTSTART');
    for (let year = 2026; year <= 2036; year++) {
      const day = ruleDay(year, Number(rule[1]), rule[2]);
      const localAsUtc = Date.UTC(year, Number(rule[1]) - 1, day, Number(start.slice(9, 11)), Number(start.slice(11, 13)));
      const at = localAsUtc - from * 60_000;
      expect(intlOffset(zone, at - 60_000)).toBe(from);
      expect(intlOffset(zone, at)).toBe(to);
    }
  }
}

describe('vtimezoneFor', () => {
  it('writes Chicago as the second Sunday of March and the first of November', () => {
    expect(w.unfoldIcsLines(w.serializeIcsDocument(w.vtimezoneFor('America/Chicago', 2026)))).toEqual([
      'BEGIN:VTIMEZONE',
      'TZID:America/Chicago',
      'BEGIN:DAYLIGHT',
      'DTSTART:20250309T020000',
      'TZOFFSETFROM:-0600',
      'TZOFFSETTO:-0500',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'DTSTART:20251102T020000',
      'TZOFFSETFROM:-0500',
      'TZOFFSETTO:-0600',
      'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
      'END:STANDARD',
      'END:VTIMEZONE',
    ]);
    expectRulesMatchIntl('America/Chicago');
  });

  it('writes Berlin as the last Sundays of March and October', () => {
    const lines = w.unfoldIcsLines(w.serializeIcsDocument(w.vtimezoneFor('Europe/Berlin', 2026)));
    expect(lines).toEqual(expect.arrayContaining([
      'DTSTART:20250330T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      'DTSTART:20251026T030000',
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'TZOFFSETTO:+0200',
      'TZOFFSETTO:+0100',
    ]));
    expectRulesMatchIntl('Europe/Berlin');
  });

  it('writes Sydney with daylight saving starting in October and ending in April', () => {
    const vtz = w.vtimezoneFor('Australia/Sydney', 2026);
    const daylight = vtz.children.find((c) => c.name === 'DAYLIGHT')!;
    const standard = vtz.children.find((c) => c.name === 'STANDARD')!;
    expect(daylight.props).toEqual(['DTSTART:20251005T020000', 'TZOFFSETFROM:+1000', 'TZOFFSETTO:+1100', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU']);
    expect(standard.props).toEqual(['DTSTART:20250406T030000', 'TZOFFSETFROM:+1100', 'TZOFFSETTO:+1000', 'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU']);
    expectRulesMatchIntl('Australia/Sydney');
  });

  it('writes Tokyo, which has no daylight saving, as one STANDARD', () => {
    const vtz = w.vtimezoneFor('Asia/Tokyo', 2026);
    expect(vtz.children).toEqual([{ name: 'STANDARD', props: ['DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900'], children: [] }]);
  });

  it('lists the changes one by one for a zone whose rule is not a plain nth or last weekday', () => {
    // Israel moves on the Friday before the last Sunday of March: the 4th Friday most years, the 5th in 2030.
    const vtz = w.vtimezoneFor('Asia/Jerusalem', 2026);
    expect(vtz.children.some((c) => c.props.some((p) => p.startsWith('RRULE')))).toBe(false);
    expect(vtz.children.find((c) => c.props.includes('DTSTART:20300329T020000'))?.name).toBe('DAYLIGHT');
  });

  it.each([
    // [zone, the Monday a week before the change, its 9:00 in UTC, the Monday after, its 9:00 in UTC]
    ['America/Chicago', '2026-10-26', '2026-10-26T14:00:00.000Z', '2026-11-02T15:00:00.000Z'],
    ['Europe/Berlin', '2026-10-19', '2026-10-19T07:00:00.000Z', '2026-10-26T08:00:00.000Z'],
    ['Australia/Sydney', '2026-09-28', '2026-09-27T23:00:00.000Z', '2026-10-04T22:00:00.000Z'],
    ['Asia/Tokyo', '2026-10-26', '2026-10-26T00:00:00.000Z', '2026-11-02T00:00:00.000Z'],
  ])('a weekly 9:00 in %s stays at 9:00 across the change', (zone, date, before, after) => {
    const event = normalizeEventDraft(
      { title: 'Swim', date, allDay: false, startTime: '09:00', endTime: '10:00', repeat: { frequency: 'weekly' } },
      { timezone: zone, now: NOW },
    );
    const text = w.buildICloudEvent(event, { uid: 'swim@homescreens.dev', now: NOW });
    expect(text).toContain(`TZID:${zone}`);
    const starts = read(text, `${date}T00:00:00Z`, '2026-11-08T00:00:00Z', zone).map((e) => e.start);
    expect(starts[0]).toBe(before);
    expect(starts[1]).toBe(after);
  });
});

// ── Ids ───────────────────────────────────────────────────────────────

describe('splitICloudEventId', () => {
  it('reads the occurrence from the end, so a UID may hold colons', () => {
    expect(w.splitICloudEventId('urn:uuid:abc:2026-11-21T15:00:00.000Z')).toEqual({ uid: 'urn:uuid:abc', occurrence: '2026-11-21T15:00:00.000Z' });
    expect(w.splitICloudEventId(`${UID}:2026-11-21`)).toEqual({ uid: UID, occurrence: '2026-11-21' });
    expect(w.splitICloudEventId('no-occurrence')).toBeNull();
    expect(w.splitICloudEventId(':2026-11-21')).toBeNull();
  });
});

// ── Changing stored text ──────────────────────────────────────────────

const change = (
  scope: 'instance' | 'series',
  event: ReturnType<typeof timed>,
  dayWas: string,
  repeatChanged = false,
  extra: { timesChanged?: boolean; timeWas?: import('../calendar-write').TimeWas } = {},
) => ({ scope, event, dayWas, repeatChanged, timesChanged: true, timezone: TZ, now: NOW, ...extra }) as const;

describe('locateOccurrence', () => {
  it('finds one day of a series by its start and names it as RECURRENCE-ID would', () => {
    const located = w.locateOccurrence(appleSeries(), `${UID}:2026-11-21T15:00:00.000Z`, TZ);
    expect(located).toMatchObject({
      uid: UID,
      series: true,
      recurrenceId: { instant: Date.parse('2026-11-21T15:00:00.000Z') },
      seriesStart: { dateTime: '2026-09-05T14:00:00.000Z' },
      masterZone: TZ,
      shown: { title: 'Soccer', start: '2026-11-21T15:00:00.000Z' },
    });
  });

  it('finds a changed day by where it sits now, and names it by where it was', () => {
    const text = appleSeries([], [changedDay('20261121T090000', '20261121T113000', '20261121T123000', 'Soccer (late)')]);
    const located = w.locateOccurrence(text, `${UID}:2026-11-21T17:30:00.000Z`, TZ);
    expect(located.recurrenceId).toEqual({ instant: Date.parse('2026-11-21T15:00:00.000Z') });
  });

  it('answers gone for a day the object no longer holds', () => {
    const text = appleSeries(['EXDATE;TZID=America/Chicago:20261121T090000']);
    expect(() => w.locateOccurrence(text, `${UID}:2026-11-21T15:00:00.000Z`, TZ)).toThrow(expect.objectContaining({ code: 'calendarWrite.gone', status: 404 }));
    expect(() => w.locateOccurrence(text, `other-uid:2026-11-28T15:00:00.000Z`, TZ)).toThrow(expect.objectContaining({ code: 'calendarWrite.gone' }));
  });
});

describe('changeICloudObject: a one-off', () => {
  const oneOff = ics([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Apple Inc.//macOS 15.1//EN',
    ...CHICAGO_VTIMEZONE,
    'BEGIN:VEVENT',
    `UID:${UID}`,
    'DTSTAMP:20261101T120000Z',
    'DTSTART;TZID=America/Chicago:20261124T150000',
    'DURATION:PT1H',
    'SUMMARY:Dentist',
    'LOCATION:Main St Dental',
    'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-TITLE=Main St Dental:geo:44.7,-93.4',
    'ATTENDEE;CN=Mom;PARTSTAT=ACCEPTED:mailto:mom@example.com',
    'DESCRIPTION:Bring the insurance card',
    'X-CUSTOM-THING:keep me',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]);

  it('changes the name, place and times in place and keeps alarms, invitees, notes and other properties', () => {
    const located = w.locateOccurrence(oneOff, `${UID}:2026-11-24T21:00:00.000Z`, TZ);
    const event = normalizeEventDraft({ title: 'Dentist (Ava)', location: 'Oak Ave Dental', date: '2026-11-25', allDay: false, startTime: '08:30', endTime: '09:15' }, opts);
    const text = w.changeICloudObject(oneOff, located, change('instance', event, '2026-11-24'));
    const lines = w.unfoldIcsLines(text);
    expect(lines).toEqual(expect.arrayContaining([
      'SUMMARY:Dentist (Ava)',
      'LOCATION:Oak Ave Dental',
      'DTSTART;TZID=America/Chicago:20261125T083000',
      'DTEND;TZID=America/Chicago:20261125T091500',
      'ATTENDEE;CN=Mom;PARTSTAT=ACCEPTED:mailto:mom@example.com',
      'DESCRIPTION:Bring the insurance card',
      'X-CUSTOM-THING:keep me',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'DTSTAMP:20261121T160000Z',
      'SEQUENCE:1',
      'PRODID:-//Apple Inc.//macOS 15.1//EN',
    ]));
    expect(lines.some((l) => l.startsWith('DURATION'))).toBe(false);
    // The map pin belonged to the old place.
    expect(lines.some((l) => l.startsWith('X-APPLE-STRUCTURED-LOCATION'))).toBe(false);
    // Only one VTIMEZONE: the object already had Chicago's.
    expect(lines.filter((l) => l === 'BEGIN:VTIMEZONE')).toHaveLength(1);
    expect(read(text)).toMatchObject([{ title: 'Dentist (Ava)', start: '2026-11-25T14:30:00.000Z', end: '2026-11-25T15:15:00.000Z' }]);
  });

  it('keeps the map pin when the place did not change, and drops a cleared place', () => {
    const located = w.locateOccurrence(oneOff, `${UID}:2026-11-24T21:00:00.000Z`, TZ);
    const same = normalizeEventDraft({ title: 'Dentist', location: 'Main St Dental', date: '2026-11-24', allDay: false, startTime: '15:00', endTime: '16:00' }, opts);
    expect(w.changeICloudObject(oneOff, located, change('instance', same, '2026-11-24'))).toContain('X-APPLE-STRUCTURED-LOCATION');
    const cleared = normalizeEventDraft({ title: 'Dentist', date: '2026-11-24', allDay: false, startTime: '15:00', endTime: '16:00' }, opts);
    const text = w.changeICloudObject(oneOff, located, change('instance', cleared, '2026-11-24'));
    expect(text).not.toMatch(/^LOCATION/m);
  });

  it('adds a VTIMEZONE when the object has none for the household zone', () => {
    const utcOneOff = ics(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//x//EN', 'BEGIN:VEVENT', `UID:${UID}`, 'DTSTAMP:20261101T120000Z',
      'DTSTART:20261124T210000Z', 'DTEND:20261124T220000Z', 'SUMMARY:Dentist', 'END:VEVENT', 'END:VCALENDAR']);
    const located = w.locateOccurrence(utcOneOff, `${UID}:2026-11-24T21:00:00.000Z`, TZ);
    const text = w.changeICloudObject(utcOneOff, located, change('instance', timed('2026-11-24', '15:00', '16:30'), '2026-11-24'));
    const lines = w.unfoldIcsLines(text);
    expect(lines.indexOf('BEGIN:VTIMEZONE')).toBeLessThan(lines.indexOf('BEGIN:VEVENT'));
    expect(lines).toContain('DTSTART;TZID=America/Chicago:20261124T150000');
  });

  it('turns a one-off into a series when the repeat changed', () => {
    const located = w.locateOccurrence(oneOff, `${UID}:2026-11-24T21:00:00.000Z`, TZ);
    const event = normalizeEventDraft({ title: 'Dentist', date: '2026-11-24', allDay: false, startTime: '15:00', endTime: '16:00', repeat: { frequency: 'monthly' } }, opts);
    expect(w.changeICloudObject(oneOff, located, change('series', event, '2026-11-24', true))).toContain('RRULE:FREQ=MONTHLY');
  });
});

describe('changeICloudObject: "Just this day"', () => {
  it('writes a changed day for that occurrence that carries everything but the series timing', () => {
    const text0 = appleSeries();
    const located = w.locateOccurrence(text0, `${UID}:2026-11-21T15:00:00.000Z`, TZ);
    const event = normalizeEventDraft({ title: 'Soccer (away)', location: 'Eagan Fields', date: '2026-11-21', allDay: false, startTime: '09:30', endTime: '10:30' }, opts);
    const text = w.changeICloudObject(text0, located, change('instance', event, '2026-11-21'));
    const [master, day] = veventBlocks(text);
    expect(master).toContain('RRULE:FREQ=WEEKLY');
    expect(master).toContain('SUMMARY:Soccer\r\n');
    expect(day).toContain(`UID:${UID}`);
    expect(day).toContain('RECURRENCE-ID;TZID=America/Chicago:20261121T090000');
    expect(day).toContain('DTSTART;TZID=America/Chicago:20261121T093000');
    expect(day).toContain('SUMMARY:Soccer (away)');
    expect(day).toContain('ATTENDEE;CN="Lee: Sam"');
    expect(day).toContain('BEGIN:VALARM');
    expect(day).not.toContain('RRULE');
    expect(day).not.toContain('X-APPLE-STRUCTURED-LOCATION');

    const shown = read(text, '2026-11-14T00:00:00Z', '2026-11-29T00:00:00Z').map((e) => [e.title, e.start]);
    expect(shown).toEqual([
      ['Soccer', '2026-11-14T15:00:00.000Z'],
      ['Soccer (away)', '2026-11-21T15:30:00.000Z'],
      ['Soccer', '2026-11-28T15:00:00.000Z'],
    ]);
  });

  it('replaces a changed day that already exists rather than adding a second', () => {
    const text0 = appleSeries([], [changedDay('20261121T090000', '20261121T093000', '20261121T103000', 'Soccer (away)')]);
    const located = w.locateOccurrence(text0, `${UID}:2026-11-21T15:30:00.000Z`, TZ);
    const event = normalizeEventDraft({ title: 'Soccer (away)', date: '2026-11-21', allDay: false, startTime: '10:00', endTime: '11:00' }, opts);
    const text = w.changeICloudObject(text0, located, change('instance', event, '2026-11-21'));
    expect(veventBlocks(text)).toHaveLength(2);
    expect(read(text, '2026-11-21T00:00:00Z', '2026-11-22T00:00:00Z')).toMatchObject([{ start: '2026-11-21T16:00:00.000Z' }]);
  });

  it('writes the occurrence in the series own TZID, even one that is not an IANA name', () => {
    const windows = appleSeries().replace(/TZID=America\/Chicago/g, 'TZID=Central Standard Time');
    const located = w.locateOccurrence(windows, `${UID}:2026-11-21T15:00:00.000Z`, TZ);
    const text = w.changeICloudObject(windows, located, change('instance', timed('2026-11-21', '11:00', '12:00'), '2026-11-21'));
    expect(text).toContain('RECURRENCE-ID;TZID=Central Standard Time:20261121T090000');
    expect(read(text, '2026-11-14T00:00:00Z', '2026-11-29T00:00:00Z').map((e) => e.start)).toEqual([
      '2026-11-14T15:00:00.000Z',
      '2026-11-21T17:00:00.000Z',
      '2026-11-28T15:00:00.000Z',
    ]);
  });

  it('can make one day of a timed series all day, and the wall shows it all day', () => {
    const text0 = appleSeries();
    const located = w.locateOccurrence(text0, `${UID}:2026-11-21T15:00:00.000Z`, TZ);
    const event = normalizeEventDraft({ title: 'Tournament', date: '2026-11-21', allDay: true }, opts);
    const text = w.changeICloudObject(text0, located, change('instance', event, '2026-11-21'));
    expect(text).toContain('DTSTART;VALUE=DATE:20261121');
    const day = read(text, '2026-11-21T00:00:00Z', '2026-11-22T00:00:00Z');
    expect(day).toMatchObject([{ title: 'Tournament', allDay: true, start: '2026-11-21', end: '2026-11-22' }]);
  });
});

describe('changeICloudObject: "Every time"', () => {
  it('keeps the first day, moved by the days this day moved, and takes the new times', () => {
    const text0 = appleSeries();
    const located = w.locateOccurrence(text0, `${UID}:2026-11-21T15:00:00.000Z`, TZ);
    // Saturday 9:00 becomes Sunday 10:00.
    const text = w.changeICloudObject(text0, located, change('series', timed('2026-11-22', '10:00', '11:00'), '2026-11-21'));
    expect(text).toContain('DTSTART;TZID=America/Chicago:20260906T100000');
    expect(text).toContain('DTEND;TZID=America/Chicago:20260906T110000');
    expect(text).toContain('SEQUENCE:1');
    expect(text).toContain('BEGIN:VALARM');
    const starts = read(text, '2026-09-01T00:00:00Z', '2026-09-14T00:00:00Z').map((e) => e.start);
    // September is daylight time, so 10:00 is 15:00 UTC; the RRULE keeps it 10:00 into November.
    expect(starts).toEqual(['2026-09-06T15:00:00.000Z', '2026-09-13T15:00:00.000Z']);
    expect(read(text, '2026-11-22T00:00:00Z', '2026-11-23T00:00:00Z')[0].start).toBe('2026-11-22T16:00:00.000Z');
  });

  it('moves skipped and changed days with the series, and lets unchanged names and times follow', () => {
    const text0 = appleSeries(['EXDATE;TZID=America/Chicago:20261010T090000'], [
      // Renamed only: its times are the series' times, so it follows the new ones.
      changedDay('20261017T090000', '20261017T090000', '20261017T100000', 'Soccer (pictures)'),
      // Moved to the afternoon: keeps its own times, but stays this day of the series.
      changedDay('20261024T090000', '20261024T140000', '20261024T150000', 'Soccer'),
    ]);
    const located = w.locateOccurrence(text0, `${UID}:2026-11-21T15:00:00.000Z`, TZ);
    const event = normalizeEventDraft({ title: 'Football', location: 'Lakefront Park', date: '2026-11-22', allDay: false, startTime: '10:00', endTime: '11:00' }, opts);
    const text = w.changeICloudObject(text0, located, change('series', event, '2026-11-21'));
    expect(text).toContain('EXDATE;TZID=America/Chicago:20261011T100000');
    const [, renamed, movedDay] = veventBlocks(text);
    expect(renamed).toContain('RECURRENCE-ID;TZID=America/Chicago:20261018T100000');
    expect(renamed).toContain('DTSTART;TZID=America/Chicago:20261018T100000');
    expect(renamed).toContain('SUMMARY:Soccer (pictures)');
    expect(movedDay).toContain('RECURRENCE-ID;TZID=America/Chicago:20261025T100000');
    expect(movedDay).toContain('DTSTART;TZID=America/Chicago:20261024T140000');
    expect(movedDay).toContain('SUMMARY:Football');

    const october = read(text, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z').map((e) => [e.title, e.start]);
    expect(october).toEqual([
      ['Football', '2026-10-04T15:00:00.000Z'],
      // October 11 stays skipped.
      ['Soccer (pictures)', '2026-10-18T15:00:00.000Z'],
      ['Football', '2026-10-24T19:00:00.000Z'],
    ]);
  });

  it('leaves skipped days alone when only the name changes', () => {
    const text0 = appleSeries(['EXDATE;TZID=America/Chicago:20261010T090000']);
    const located = w.locateOccurrence(text0, `${UID}:2026-11-21T15:00:00.000Z`, TZ);
    const event = normalizeEventDraft({ title: 'Football', location: 'Lakefront Park', date: '2026-11-21', allDay: false, startTime: '09:00', endTime: '10:00' }, opts);
    const text = w.changeICloudObject(text0, located, change('series', event, '2026-11-21'));
    expect(text).toContain('EXDATE;TZID=America/Chicago:20261010T090000');
    expect(text).toContain('SUMMARY:Football');
    expect(text).toContain('DTSTART;TZID=America/Chicago:20260905T090000');
    expect(text).toContain('SEQUENCE:0');
  });

  it('writes a new rule only when the repeat changed, keeping skipped days', () => {
    const text0 = appleSeries(['EXDATE;TZID=America/Chicago:20261010T090000']);
    const located = w.locateOccurrence(text0, `${UID}:2026-11-21T15:00:00.000Z`, TZ);
    const biweekly = timed('2026-11-21', '09:00', '10:00', { repeat: { frequency: 'biweekly' } });
    const text = w.changeICloudObject(text0, located, change('series', biweekly, '2026-11-21', true));
    expect(text).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2');
    expect(text).not.toContain('RRULE:FREQ=WEEKLY\r\n');
    expect(text).toContain('EXDATE;TZID=America/Chicago:20261010T090000');
    // Not told the repeat changed: the old rule stays, whatever the form carried.
    expect(w.changeICloudObject(text0, located, change('series', biweekly, '2026-11-21', false))).toContain('RRULE:FREQ=WEEKLY\r\n');
  });

  it('drops the rule, skipped days and changed days when it stops repeating', () => {
    const text0 = appleSeries(['EXDATE;TZID=America/Chicago:20261010T090000'], [changedDay('20261017T090000', '20261017T090000', '20261017T100000', 'Soccer (pictures)')]);
    const located = w.locateOccurrence(text0, `${UID}:2026-11-21T15:00:00.000Z`, TZ);
    const text = w.changeICloudObject(text0, located, change('series', timed('2026-11-21', '09:00', '10:00'), '2026-11-21', true));
    const events = veventBlocks(text);
    expect(events).toHaveLength(1);
    expect(events[0]).not.toContain('RRULE');
    expect(events[0]).not.toContain('EXDATE');
  });

  it('turns a timed series all day, rewriting its skipped days and its UNTIL as dates', () => {
    const text0 = appleSeries(['EXDATE;TZID=America/Chicago:20261010T090000']).replace('RRULE:FREQ=WEEKLY', 'RRULE:FREQ=WEEKLY;UNTIL=20261227T055959Z');
    const located = w.locateOccurrence(text0, `${UID}:2026-11-21T15:00:00.000Z`, TZ);
    const event = normalizeEventDraft({ title: 'Soccer', date: '2026-11-21', allDay: true, repeat: { frequency: 'weekly', until: '2026-12-26' } }, opts);
    const text = w.changeICloudObject(text0, located, change('series', event, '2026-11-21'));
    expect(text).toContain('DTSTART;VALUE=DATE:20260905');
    expect(text).toContain('RRULE:FREQ=WEEKLY;UNTIL=20261226');
    expect(text).toContain('EXDATE;VALUE=DATE:20261010');
    const days = read(text, '2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z').map((e) => e.start);
    expect(days).toEqual(['2026-10-03', '2026-10-17']);
  });
});

describe('changeICloudObject: times are written only when they changed', () => {
  /** The draft the Change form gets for the day at `eventId`, built the way `getICloudEventForEdit` builds it. */
  function loadedDraft(text: string, eventId: string) {
    const located = w.locateOccurrence(text, eventId, TZ);
    const when = (value: string) => (located.shown.allDay ? { date: value } : { dateTime: value });
    const draft = draftFromGoogle({ summary: located.shown.title, start: when(located.shown.start), end: when(located.shown.end) }, TZ, { kind: 'none' });
    return { located, draft };
  }
  const renamed = (draft: import('../calendar-write').EventDraft, title: string) =>
    normalizeEventDraft({ ...draft, title }, { ...opts, timesChanged: false });
  const untouched = { timesChanged: false } as const;

  const longOneOff = (start: string, end: string) => ics([
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Apple Inc.//macOS 15.1//EN', ...CHICAGO_VTIMEZONE,
    'BEGIN:VEVENT', `UID:${UID}`, 'DTSTAMP:20261101T120000Z',
    `DTSTART;TZID=America/Chicago:${start}`, `DTEND;TZID=America/Chicago:${end}`,
    'SUMMARY:Cabin trp', 'SEQUENCE:2', 'END:VEVENT', 'END:VCALENDAR',
  ]);

  it('renames a Friday 6 PM to Sunday 4 PM event without touching its end', () => {
    const text0 = longOneOff('20261127T180000', '20261129T160000');
    const { located, draft } = loadedDraft(text0, `${UID}:2026-11-28T00:00:00.000Z`);
    expect(draft).toMatchObject({ date: '2026-11-27', startTime: '18:00', endTime: '16:00', endDate: '2026-11-29' });
    const text = w.changeICloudObject(text0, located, change('instance', renamed(draft, 'Cabin trip'), '2026-11-27', false, untouched));
    const lines = w.unfoldIcsLines(text);
    expect(lines).toEqual(expect.arrayContaining([
      'SUMMARY:Cabin trip',
      'DTSTART;TZID=America/Chicago:20261127T180000',
      'DTEND;TZID=America/Chicago:20261129T160000',
      // Nothing about when it happens moved, so its revision count stays.
      'SEQUENCE:2',
    ]));
    expect(read(text)).toMatchObject([{ title: 'Cabin trip', start: '2026-11-28T00:00:00.000Z', end: '2026-11-29T22:00:00.000Z' }]);
  });

  it('renames a 26 hour event and one of exactly 48 hours, both kept whole', () => {
    const day26 = longOneOff('20261127T100000', '20261128T120000');
    const a = loadedDraft(day26, `${UID}:2026-11-27T16:00:00.000Z`);
    expect(w.changeICloudObject(day26, a.located, change('instance', renamed(a.draft, 'Lake day'), '2026-11-27', false, untouched)))
      .toContain('DTEND;TZID=America/Chicago:20261128T120000');

    const day48 = longOneOff('20261127T180000', '20261129T180000');
    const b = loadedDraft(day48, `${UID}:2026-11-28T00:00:00.000Z`);
    // Starts and ends at the same clock time: the form could never have made it, and can still rename it.
    expect(b.draft).toMatchObject({ startTime: '18:00', endTime: '18:00', endDate: '2026-11-29' });
    const text = w.changeICloudObject(day48, b.located, change('instance', renamed(b.draft, 'Lake weekend'), '2026-11-27', false, untouched));
    expect(text).toContain('SUMMARY:Lake weekend');
    expect(text).toContain('DTEND;TZID=America/Chicago:20261129T180000');
  });

  it('keeps a DURATION as it was when only the place changes', () => {
    const text0 = ics(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//x//EN', ...CHICAGO_VTIMEZONE, 'BEGIN:VEVENT', `UID:${UID}`, 'DTSTAMP:20261101T120000Z',
      'DTSTART;TZID=America/Chicago:20261127T180000', 'DURATION:P1DT22H', 'SUMMARY:Cabin trip', 'END:VEVENT', 'END:VCALENDAR']);
    const { located, draft } = loadedDraft(text0, `${UID}:2026-11-28T00:00:00.000Z`);
    const event = normalizeEventDraft({ ...draft, location: 'Up north' }, { ...opts, timesChanged: false });
    const lines = w.unfoldIcsLines(w.changeICloudObject(text0, located, change('instance', event, '2026-11-27', false, untouched)));
    expect(lines).toContain('DURATION:P1DT22H');
    expect(lines).toContain('LOCATION:Up north');
    expect(lines.some((l) => l.startsWith('DTEND'))).toBe(false);
  });

  const longSeries = (extraEvents: string[][] = []) => ics([
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Apple Inc.//iOS 18.1//EN', ...CHICAGO_VTIMEZONE,
    'BEGIN:VEVENT', `UID:${UID}`, 'DTSTAMP:20260901T150000Z',
    'DTSTART;TZID=America/Chicago:20261002T180000', 'DTEND;TZID=America/Chicago:20261004T160000',
    'RRULE:FREQ=WEEKLY', 'SUMMARY:Cabin weekend', 'END:VEVENT',
    ...extraEvents.flat(),
    'END:VCALENDAR',
  ]);

  it('"Every time" on a weekly Friday to Sunday series renames it and leaves every weekend whole', () => {
    const text0 = longSeries();
    const { located, draft } = loadedDraft(text0, `${UID}:2026-11-28T00:00:00.000Z`);
    const text = w.changeICloudObject(text0, located, change('series', renamed(draft, 'Cabin'), '2026-11-27', false, untouched));
    const lines = w.unfoldIcsLines(text);
    expect(lines).toEqual(expect.arrayContaining(['SUMMARY:Cabin', 'DTSTART;TZID=America/Chicago:20261002T180000', 'DTEND;TZID=America/Chicago:20261004T160000']));
    expect(read(text, '2026-11-27T00:00:00Z', '2026-11-28T12:00:00Z')).toMatchObject([{ title: 'Cabin', start: '2026-11-28T00:00:00.000Z', end: '2026-11-29T22:00:00.000Z' }]);
  });

  it('"Just this day" on that series writes the day with its true start and end', () => {
    const text0 = longSeries();
    const { located, draft } = loadedDraft(text0, `${UID}:2026-11-28T00:00:00.000Z`);
    const text = w.changeICloudObject(text0, located, change('instance', renamed(draft, 'Cabin with the Lees'), '2026-11-27', false, untouched));
    const [, day] = veventBlocks(text);
    expect(day).toContain('RECURRENCE-ID;TZID=America/Chicago:20261127T180000');
    expect(day).toContain('DTSTART;TZID=America/Chicago:20261127T180000');
    expect(day).toContain('DTEND;TZID=America/Chicago:20261129T160000');
    expect(day).toContain('SUMMARY:Cabin with the Lees');
    expect(read(text, '2026-11-27T00:00:00Z', '2026-11-28T12:00:00Z')).toMatchObject([{ title: 'Cabin with the Lees', end: '2026-11-29T22:00:00.000Z' }]);
  });

  it('"Just this day" keeps the times of a day that was already changed', () => {
    const text0 = appleSeries([], [changedDay('20261121T090000', '20261121T113000', '20261121T123000', 'Soccer (late)')]);
    const { located, draft } = loadedDraft(text0, `${UID}:2026-11-21T17:30:00.000Z`);
    const text = w.changeICloudObject(text0, located, change('instance', renamed(draft, 'Soccer (late, away)'), '2026-11-21', false, untouched));
    const [, day] = veventBlocks(text);
    expect(day).toContain('DTSTART;TZID=America/Chicago:20261121T113000');
    expect(day).toContain('DTEND;TZID=America/Chicago:20261121T123000');
    expect(day).toContain('SUMMARY:Soccer (late\\, away)');
  });

  it('"Just this day" on an all-day series writes that day as dates', () => {
    const allDaySeries = ics(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//x//EN', 'BEGIN:VEVENT', `UID:${UID}`, 'DTSTAMP:20260901T150000Z',
      'DTSTART;VALUE=DATE:20261102', 'DTEND;VALUE=DATE:20261104', 'RRULE:FREQ=WEEKLY', 'SUMMARY:Grandma here', 'END:VEVENT', 'END:VCALENDAR']);
    const { located, draft } = loadedDraft(allDaySeries, `${UID}:2026-11-23`);
    const text = w.changeICloudObject(allDaySeries, located, change('instance', renamed(draft, 'Grandma and Grandpa here'), '2026-11-23', false, untouched));
    const [, day] = veventBlocks(text);
    expect(day).toContain('RECURRENCE-ID;VALUE=DATE:20261123');
    expect(day).toContain('DTSTART;VALUE=DATE:20261123');
    expect(day).toContain('DTEND;VALUE=DATE:20261125');
  });

  it('"Every time" from a day that was moved to another time renames the series and moves nothing', () => {
    // Saturdays 9 to 10, one skipped day, and Nov 21 moved to 11:30 on its own.
    const text0 = appleSeries(['EXDATE;TZID=America/Chicago:20261107T090000'], [changedDay('20261121T090000', '20261121T113000', '20261121T123000', 'Soccer')]);
    const { located, draft } = loadedDraft(text0, `${UID}:2026-11-21T17:30:00.000Z`);
    const text = w.changeICloudObject(text0, located, change('series', renamed(draft, 'Soccer practice'), '2026-11-21', false, untouched));
    const lines = w.unfoldIcsLines(text);
    expect(lines).toEqual(expect.arrayContaining([
      'DTSTART;TZID=America/Chicago:20260905T090000',
      'DTEND;TZID=America/Chicago:20260905T100000',
      'EXDATE;TZID=America/Chicago:20261107T090000',
      'RECURRENCE-ID;TZID=America/Chicago:20261121T090000',
      'DTSTART;TZID=America/Chicago:20261121T113000',
    ]));
    expect(lines.filter((l) => l === 'SUMMARY:Soccer practice')).toHaveLength(2);
  });

  it('"Every time" from a moved day with a new time moves the series by as much as that day moved', () => {
    const text0 = appleSeries(['EXDATE;TZID=America/Chicago:20261107T090000'], [changedDay('20261121T090000', '20261121T113000', '20261121T123000', 'Soccer')]);
    const { located } = loadedDraft(text0, `${UID}:2026-11-21T17:30:00.000Z`);
    // The moved day ran 11:30 to 12:30; the family makes it 12:00 to 13:30: half an hour later, half an hour longer.
    const event = timed('2026-11-21', '12:00', '13:30');
    const timeWas = { allDay: false, startMinute: 11 * 60 + 30, minutes: 60 } as const;
    const text = w.changeICloudObject(text0, located, change('series', event, '2026-11-21', false, { timeWas }));
    const lines = w.unfoldIcsLines(text);
    expect(lines).toEqual(expect.arrayContaining([
      // Every other Saturday: 9:30 to 11:00, not noon.
      'DTSTART;TZID=America/Chicago:20260905T093000',
      'DTEND;TZID=America/Chicago:20260905T110000',
      'EXDATE;TZID=America/Chicago:20261107T093000',
      'RECURRENCE-ID;TZID=America/Chicago:20261121T093000',
      // The moved day stays where it was moved to.
      'DTSTART;TZID=America/Chicago:20261121T113000',
    ]));
  });
});

describe('removeICloudOccurrence', () => {
  it('skips that day with an EXDATE in the series own form', () => {
    const text0 = appleSeries();
    const located = w.locateOccurrence(text0, `${UID}:2026-11-21T15:00:00.000Z`, TZ);
    const text = w.removeICloudOccurrence(text0, located, { timezone: TZ, now: NOW });
    const lines = w.unfoldIcsLines(text);
    expect(lines[lines.indexOf('RRULE:FREQ=WEEKLY') + 1]).toBe('EXDATE;TZID=America/Chicago:20261121T090000');
    expect(lines).toContain('BEGIN:VALARM');
    expect(read(text, '2026-11-14T00:00:00Z', '2026-11-29T00:00:00Z').map((e) => e.start)).toEqual([
      '2026-11-14T15:00:00.000Z',
      '2026-11-28T15:00:00.000Z',
    ]);
  });

  it('drops the changed day for it too', () => {
    const text0 = appleSeries([], [changedDay('20261121T090000', '20261121T113000', '20261121T123000', 'Soccer (late)')]);
    const located = w.locateOccurrence(text0, `${UID}:2026-11-21T17:30:00.000Z`, TZ);
    const text = w.removeICloudOccurrence(text0, located, { timezone: TZ, now: NOW });
    expect(veventBlocks(text)).toHaveLength(1);
    expect(text).toContain('EXDATE;TZID=America/Chicago:20261121T090000');
    expect(read(text, '2026-11-21T00:00:00Z', '2026-11-22T00:00:00Z')).toEqual([]);
  });

  it('writes a date for an all-day series', () => {
    const allDay = ics(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//x//EN', 'BEGIN:VEVENT', `UID:${UID}`, 'DTSTAMP:20261101T120000Z',
      'DTSTART;VALUE=DATE:20261102', 'DTEND;VALUE=DATE:20261103', 'RRULE:FREQ=WEEKLY', 'SUMMARY:Trash day', 'END:VEVENT', 'END:VCALENDAR']);
    const located = w.locateOccurrence(allDay, `${UID}:2026-11-23`, TZ);
    const text = w.removeICloudOccurrence(allDay, located, { timezone: TZ, now: NOW });
    expect(text).toContain('EXDATE;VALUE=DATE:20261123');
    expect(read(text, '2026-11-16T00:00:00Z', '2026-12-01T00:00:00Z').map((e) => e.start)).toEqual(['2026-11-16', '2026-11-30']);
  });
});

// ── Where a write may go ──────────────────────────────────────────────

describe('icloudObjectUrl', () => {
  it('takes an object directly inside the source calendar', () => {
    expect(w.icloudObjectUrl(SOURCE, OBJECT_URL)).toBe(OBJECT_URL);
    expect(w.icloudObjectUrl({ ...SOURCE, url: SOURCE.url.slice(0, -1) }, OBJECT_URL)).toBe(OBJECT_URL);
  });

  it.each([
    ['another host', 'https://evil.example.com/123456/calendars/home/x.ics'],
    ['another iCloud host', 'https://p01-caldav.icloud.com/123456/calendars/home/x.ics'],
    ['plain http', 'http://p52-caldav.icloud.com/123456/calendars/home/x.ics'],
    ['another calendar', 'https://p52-caldav.icloud.com/123456/calendars/work/x.ics'],
    ['a calendar whose name starts the same', 'https://p52-caldav.icloud.com/123456/calendars/homework/x.ics'],
    ['a deeper path', 'https://p52-caldav.icloud.com/123456/calendars/home/sub/x.ics'],
    ['a walk out of the calendar', 'https://p52-caldav.icloud.com/123456/calendars/home/../work/x.ics'],
    ['an encoded slash', 'https://p52-caldav.icloud.com/123456/calendars/home/..%2Fwork%2Fx.ics'],
    ['a query', `${OBJECT_URL}?x=1`],
    ['a password in the address', 'https://a:b@p52-caldav.icloud.com/123456/calendars/home/x.ics'],
    ['the calendar itself', SOURCE.url],
    ['not text', 42],
    ['not an address', 'x.ics'],
  ])('refuses %s', (_, ref) => {
    expect(() => w.icloudObjectUrl(SOURCE, ref)).toThrow(expect.objectContaining({ code: 'calendarWrite.notEditable', status: 403 }));
  });

  it('refuses everything for a source that is not an iCloud calendar', () => {
    expect(() => w.icloudObjectUrl({ ...SOURCE, url: 'https://evil.example.com/123456/calendars/home/' }, 'https://evil.example.com/123456/calendars/home/x.ics')).toThrow(
      expect.objectContaining({ code: 'calendarWrite.notEditable' }),
    );
  });
});

// ── Talking to iCloud (tsdav mocked) ──────────────────────────────────

type MockClient = {
  davRequest: ReturnType<typeof vi.fn>;
  createCalendarObject: ReturnType<typeof vi.fn>;
  updateCalendarObject: ReturnType<typeof vi.fn>;
  deleteCalendarObject: ReturnType<typeof vi.fn>;
};

/** A fresh signed-in client; the one before is forgotten, since the writer keeps it for an hour. */
function install(client: Partial<MockClient> = {}): MockClient {
  clearICloudCaches();
  const full: MockClient = {
    davRequest: vi.fn(),
    createCalendarObject: vi.fn().mockResolvedValue(new Response(null, { status: 201 })),
    updateCalendarObject: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    deleteCalendarObject: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    ...client,
  };
  vi.mocked(createDAVClient).mockResolvedValue(full as never);
  return full;
}

/** The multiget answer for the object, as tsdav's davRequest parses it. */
function stored(text: string, etag = '"C=101@U=abc"') {
  return [{ href: new URL(OBJECT_URL).pathname, ok: true, status: 200, statusText: 'OK', props: { getetag: etag, calendarData: { _cdata: text } } }];
}

const missing = [{ href: new URL(OBJECT_URL).pathname, ok: false, status: 404, statusText: 'Not Found', props: {} }];

const SERIES_DAY = `${UID}:2026-11-21T15:00:00.000Z`;

describe('createICloudEvent', () => {
  it('puts a new object in the calendar and answers the id the wall will read back', async () => {
    const client = install();
    const event = timed('2026-11-23', '16:00', '16:45', { title: 'Piano' });
    const { id } = await w.createICloudEvent(SOURCE, ACCOUNT, event);
    const [{ calendar, filename, iCalString }] = client.createCalendarObject.mock.calls[0];
    expect(calendar.url).toBe(SOURCE.url);
    expect(filename).toMatch(/^[0-9a-f-]{36}\.ics$/);
    expect(iCalString).toContain(`UID:${filename.replace('.ics', '')}@homescreens.dev`);
    expect(iCalString).toContain('X-HOME-SCREENS:1');
    expect(read(iCalString).map((e) => e.id)).toEqual([id]);
  });

  it('uses a calendar address with its trailing slash, so the object lands inside it', async () => {
    const client = install();
    await w.createICloudEvent({ ...SOURCE, url: SOURCE.url.slice(0, -1) }, ACCOUNT, timed('2026-11-23', '16:00', '16:45'));
    expect(client.createCalendarObject.mock.calls[0][0].calendar.url).toBe(SOURCE.url);
  });

  it('refuses a birthdays source or another account without asking iCloud', async () => {
    const client = install();
    const event = timed('2026-11-23', '16:00', '16:45');
    await expect(w.createICloudEvent({ ...SOURCE, kind: 'birthdays', url: '' }, ACCOUNT, event)).rejects.toMatchObject({ code: 'calendarWrite.notEditable' });
    await expect(w.createICloudEvent(SOURCE, { ...ACCOUNT, id: 'other' }, event)).rejects.toMatchObject({ code: 'calendarWrite.notEditable' });
    expect(client.createCalendarObject).not.toHaveBeenCalled();
    expect(createDAVClient).not.toHaveBeenCalled();
  });

  it('turns a read-only calendar into "not allowed"', async () => {
    install({ createCalendarObject: vi.fn().mockResolvedValue(new Response(null, { status: 403 })) });
    await expect(w.createICloudEvent(SOURCE, ACCOUNT, timed('2026-11-23', '16:00', '16:45'))).rejects.toMatchObject({ code: 'calendarWrite.notAllowed', status: 403 });
  });
});

describe('getICloudEventForEdit', () => {
  it('opens one day of a series on the household clock, with the series and its version', async () => {
    const client = install({ davRequest: vi.fn().mockResolvedValue(stored(appleSeries())) });
    const editable = await w.getICloudEventForEdit(SOURCE, ACCOUNT, { eventId: SERIES_DAY, sourceRef: OBJECT_URL, timezone: TZ });
    expect(editable).toEqual({
      calendarId: SOURCE.id,
      eventId: SERIES_DAY,
      etag: '"C=101@U=abc"',
      sourceRef: OBJECT_URL,
      seriesId: UID,
      seriesEtag: '"C=101@U=abc"',
      draft: { title: 'Soccer', location: 'Lakefront Park', allDay: false, date: '2026-11-21', startTime: '09:00', endTime: '10:00', repeat: { frequency: 'weekly' } },
      repeat: { kind: 'known', rule: { frequency: 'weekly' } },
    });
    const [{ url, init }] = client.davRequest.mock.calls[0];
    expect(url).toBe(SOURCE.url);
    expect(init.method).toBe('REPORT');
    expect(init.body['calendar-multiget']['d:href']).toEqual([new URL(OBJECT_URL).pathname]);
  });

  it('opens a changed day with its own name, and a one-off with no series', async () => {
    install({ davRequest: vi.fn().mockResolvedValue(stored(appleSeries([], [changedDay('20261121T090000', '20261121T113000', '20261121T123000', 'Soccer (late)')]))) });
    const day = await w.getICloudEventForEdit(SOURCE, ACCOUNT, { eventId: `${UID}:2026-11-21T17:30:00.000Z`, sourceRef: OBJECT_URL, timezone: TZ });
    expect(day.draft).toMatchObject({ title: 'Soccer (late)', startTime: '11:30', endTime: '12:30' });

    const oneOff = appleSeries().replace('RRULE:FREQ=WEEKLY\r\n', '');
    install({ davRequest: vi.fn().mockResolvedValue(stored(oneOff)) });
    const single = await w.getICloudEventForEdit(SOURCE, ACCOUNT, { eventId: `${UID}:2026-09-05T14:00:00.000Z`, sourceRef: OBJECT_URL, timezone: TZ });
    expect(single).not.toHaveProperty('seriesId');
    expect(single.repeat).toEqual({ kind: 'none' });
  });

  it('answers gone for an object that is no longer there', async () => {
    install({ davRequest: vi.fn().mockResolvedValue(missing) });
    await expect(w.getICloudEventForEdit(SOURCE, ACCOUNT, { eventId: SERIES_DAY, sourceRef: OBJECT_URL, timezone: TZ })).rejects.toMatchObject({ code: 'calendarWrite.gone', status: 404 });
  });
});

describe('updateICloudEvent', () => {
  const input = (overrides: Record<string, unknown> = {}) => ({
    eventId: SERIES_DAY,
    sourceRef: OBJECT_URL,
    etag: '"C=101@U=abc"',
    scope: 'instance' as const,
    dayWas: '2026-11-21',
    timesChanged: true,
    event: timed('2026-11-21', '09:30', '10:30'),
    repeatChanged: false,
    timezone: TZ,
    ...overrides,
  });

  it('writes the changed text back with the version it read', async () => {
    const client = install({ davRequest: vi.fn().mockResolvedValue(stored(appleSeries())) });
    await w.updateICloudEvent(SOURCE, ACCOUNT, input());
    const [{ calendarObject }] = client.updateCalendarObject.mock.calls[0];
    expect(calendarObject.url).toBe(OBJECT_URL);
    expect(calendarObject.etag).toBe('"C=101@U=abc"');
    expect(calendarObject.data).toContain('RECURRENCE-ID;TZID=America/Chicago:20261121T090000');
  });

  it('refuses when the event changed since the form opened, without writing', async () => {
    const client = install({ davRequest: vi.fn().mockResolvedValue(stored(appleSeries(), '"C=102@U=abc"')) });
    await expect(w.updateICloudEvent(SOURCE, ACCOUNT, input())).rejects.toMatchObject({ code: 'calendarWrite.changedElsewhere', status: 409 });
    expect(client.updateCalendarObject).not.toHaveBeenCalled();
  });

  it('refuses a sourceRef outside the calendar before asking iCloud anything', async () => {
    const client = install();
    await expect(w.updateICloudEvent(SOURCE, ACCOUNT, input({ sourceRef: 'https://p52-caldav.icloud.com/123456/calendars/work/x.ics' }))).rejects.toMatchObject({
      code: 'calendarWrite.notEditable',
    });
    expect(client.davRequest).not.toHaveBeenCalled();
  });

  describe('maps what iCloud answers', () => {
    silenceConsole(['warn', 'error']);

    it.each([
      [412, 'calendarWrite.changedElsewhere', 409],
      [404, 'calendarWrite.gone', 404],
      [410, 'calendarWrite.gone', 404],
      [403, 'calendarWrite.notAllowed', 403],
      [401, 'calendarWrite.signInNeeded', 403],
      [500, 'calendarWrite.unreachable', 502],
      [503, 'calendarWrite.unreachable', 502],
    ])('HTTP %i to %s', async (status, code, answer) => {
      install({
        davRequest: vi.fn().mockResolvedValue(stored(appleSeries())),
        updateCalendarObject: vi.fn().mockResolvedValue(new Response(null, { status })),
      });
      await expect(w.updateICloudEvent(SOURCE, ACCOUNT, input())).rejects.toMatchObject({ code, status: answer });
    });

    it('a request that never got an answer to unreachable', async () => {
      install({ davRequest: vi.fn().mockRejectedValue(new TypeError('fetch failed')) });
      await expect(w.updateICloudEvent(SOURCE, ACCOUNT, input())).rejects.toMatchObject({ code: 'calendarWrite.unreachable', status: 502 });
    });

    it('a failed sign-in to unreachable', async () => {
      vi.mocked(createDAVClient).mockRejectedValue(new Error('Invalid credentials'));
      await expect(w.updateICloudEvent(SOURCE, ACCOUNT, input())).rejects.toMatchObject({ code: 'calendarWrite.unreachable' });
    });

    it('a refused read of the object the same way', async () => {
      install({ davRequest: vi.fn().mockResolvedValue([{ href: SOURCE.url, ok: false, status: 403, statusText: 'Forbidden' }]) });
      await expect(w.updateICloudEvent(SOURCE, ACCOUNT, input())).rejects.toMatchObject({ code: 'calendarWrite.notAllowed' });
    });

    it('a 401 signs in afresh on the next request', async () => {
      install({
        davRequest: vi.fn().mockResolvedValue(stored(appleSeries())),
        updateCalendarObject: vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValue(new Response(null, { status: 204 })),
      });
      await expect(w.updateICloudEvent(SOURCE, ACCOUNT, input())).rejects.toMatchObject({ code: 'calendarWrite.signInNeeded' });
      await w.updateICloudEvent(SOURCE, ACCOUNT, input());
      expect(createDAVClient).toHaveBeenCalledTimes(2);
    });
  });
});

describe('deleteICloudEvent', () => {
  it('removes the whole object for "Every time", with the version it read', async () => {
    const client = install({ davRequest: vi.fn().mockResolvedValue(stored(appleSeries())) });
    await w.deleteICloudEvent(SOURCE, ACCOUNT, { eventId: SERIES_DAY, sourceRef: OBJECT_URL, scope: 'series', timezone: TZ });
    expect(client.deleteCalendarObject.mock.calls[0][0].calendarObject).toEqual({ url: OBJECT_URL, etag: '"C=101@U=abc"' });
    expect(client.updateCalendarObject).not.toHaveBeenCalled();
  });

  it('skips the one day for "Just this day"', async () => {
    const client = install({ davRequest: vi.fn().mockResolvedValue(stored(appleSeries())) });
    await w.deleteICloudEvent(SOURCE, ACCOUNT, { eventId: SERIES_DAY, sourceRef: OBJECT_URL, scope: 'instance', timezone: TZ });
    expect(client.updateCalendarObject.mock.calls[0][0].calendarObject.data).toContain('EXDATE;TZID=America/Chicago:20261121T090000');
    expect(client.deleteCalendarObject).not.toHaveBeenCalled();
  });

  it('removes a one-off whatever the scope', async () => {
    const oneOff = appleSeries().replace('RRULE:FREQ=WEEKLY\r\n', '');
    const client = install({ davRequest: vi.fn().mockResolvedValue(stored(oneOff)) });
    await w.deleteICloudEvent(SOURCE, ACCOUNT, { eventId: `${UID}:2026-09-05T14:00:00.000Z`, sourceRef: OBJECT_URL, scope: 'instance', timezone: TZ });
    expect(client.deleteCalendarObject).toHaveBeenCalledTimes(1);
  });

  it('counts an event that is already gone as done', async () => {
    install({ davRequest: vi.fn().mockResolvedValue(missing) });
    await expect(w.deleteICloudEvent(SOURCE, ACCOUNT, { eventId: SERIES_DAY, sourceRef: OBJECT_URL, scope: 'series', timezone: TZ })).resolves.toBeUndefined();
    install({ davRequest: vi.fn().mockResolvedValue(stored(appleSeries())), deleteCalendarObject: vi.fn().mockResolvedValue(new Response(null, { status: 404 })) });
    await expect(w.deleteICloudEvent(SOURCE, ACCOUNT, { eventId: SERIES_DAY, sourceRef: OBJECT_URL, scope: 'series', timezone: TZ })).resolves.toBeUndefined();
    // A day already skipped elsewhere is gone too.
    install({ davRequest: vi.fn().mockResolvedValue(stored(appleSeries(['EXDATE;TZID=America/Chicago:20261121T090000']))) });
    await expect(w.deleteICloudEvent(SOURCE, ACCOUNT, { eventId: SERIES_DAY, sourceRef: OBJECT_URL, scope: 'instance', timezone: TZ })).resolves.toBeUndefined();
  });

  it('refuses with a version that is out of date, and when iCloud refuses', async () => {
    install({ davRequest: vi.fn().mockResolvedValue(stored(appleSeries(), '"C=102@U=abc"')) });
    await expect(w.deleteICloudEvent(SOURCE, ACCOUNT, { eventId: SERIES_DAY, sourceRef: OBJECT_URL, scope: 'series', timezone: TZ, etag: '"C=101@U=abc"' })).rejects.toMatchObject({
      code: 'calendarWrite.changedElsewhere',
    });
    install({ davRequest: vi.fn().mockResolvedValue(stored(appleSeries())), deleteCalendarObject: vi.fn().mockResolvedValue(new Response(null, { status: 412 })) });
    await expect(w.deleteICloudEvent(SOURCE, ACCOUNT, { eventId: SERIES_DAY, sourceRef: OBJECT_URL, scope: 'series', timezone: TZ })).rejects.toMatchObject({
      code: 'calendarWrite.changedElsewhere',
    });
  });
});
