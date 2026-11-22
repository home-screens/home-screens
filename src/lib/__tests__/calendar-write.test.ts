import { describe, expect, it } from 'vitest';
import {
  CALENDAR_WRITE_LIMITS,
  CalendarWriteError,
  GOOGLE_EVENTS_SCOPE,
  checkChangeScope,
  draftMinutes,
  endsNextDay,
  googleEntryState,
  grantedScopes,
  normalizeEventDraft,
  repeatFrequenciesFor,
  repeatFromRecurrence,
  repeatToRRule,
  splitGoogleEventId,
  type EventDraft,
} from '../calendar-write';

const TZ = 'America/Chicago';
// Saturday, November 21 2026, mid-morning in Chicago.
const NOW = new Date('2026-11-21T16:00:00Z');
const opts = { timezone: TZ, now: NOW };

const timed = (over: Partial<EventDraft> = {}): EventDraft => ({
  title: 'Playdate with Sam',
  date: '2026-11-23',
  allDay: false,
  startTime: '15:30',
  endTime: '17:00',
  ...over,
});

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(CalendarWriteError);
    expect((e as CalendarWriteError).status).toBe(400);
    return (e as CalendarWriteError).code;
  }
  throw new Error('expected a refusal');
}

describe('normalizeEventDraft: names and places', () => {
  it('makes the name one line and keeps a place', () => {
    const e = normalizeEventDraft(timed({ title: '  Playdate \n with   Sam ', location: " Sam's  house " }), opts);
    expect(e.title).toBe('Playdate with Sam');
    expect(e.location).toBe("Sam's house");
  });

  it('drops an empty place', () => {
    expect(normalizeEventDraft(timed({ location: '   ' }), opts)).not.toHaveProperty('location');
  });

  it('needs a name', () => {
    expect(code(() => normalizeEventDraft(timed({ title: ' \n ' }), opts))).toBe('calendarWrite.titleRequired');
  });

  it('counts an emoji as one, up to the cap', () => {
    const atCap = '🎂'.repeat(CALENDAR_WRITE_LIMITS.maxTitleLength);
    expect(normalizeEventDraft(timed({ title: atCap }), opts).title).toBe(atCap);
    expect(code(() => normalizeEventDraft(timed({ title: `${atCap}a` }), opts))).toBe('calendarWrite.titleTooLong');
  });

  it('caps the place', () => {
    const place = 'x'.repeat(CALENDAR_WRITE_LIMITS.maxLocationLength + 1);
    expect(code(() => normalizeEventDraft(timed({ location: place }), opts))).toBe('calendarWrite.placeTooLong');
  });
});

describe('normalizeEventDraft: timed events', () => {
  it('keeps the times on the household clock', () => {
    expect(normalizeEventDraft(timed(), opts)).toEqual({
      title: 'Playdate with Sam',
      allDay: false,
      startLocal: '2026-11-23T15:30:00',
      endLocal: '2026-11-23T17:00:00',
      timeZone: TZ,
    });
  });

  it('reads an end earlier than the start as the next day', () => {
    const e = normalizeEventDraft(timed({ date: '2026-11-27', startTime: '18:00', endTime: '10:00' }), opts);
    expect(e).toMatchObject({ startLocal: '2026-11-27T18:00:00', endLocal: '2026-11-28T10:00:00' });
  });

  it('turns down an end equal to the start', () => {
    expect(code(() => normalizeEventDraft(timed({ endTime: '15:30' }), opts))).toBe('calendarWrite.endsWhenItStarts');
  });

  it.each(['3:30', '24:00', '15:60', '', undefined])('turns down the time %s', (t) => {
    expect(code(() => normalizeEventDraft(timed({ startTime: t }), opts))).toBe('calendarWrite.badTime');
  });

  it('turns down a day that is not a day', () => {
    expect(code(() => normalizeEventDraft(timed({ date: '2026-02-30' }), opts))).toBe('calendarWrite.badDate');
  });

  it('allows past days within the range and turns down far ones', () => {
    expect(() => normalizeEventDraft(timed({ date: '2022-01-01' }), opts)).not.toThrow();
    expect(code(() => normalizeEventDraft(timed({ date: '2021-11-20' }), opts))).toBe('calendarWrite.dayTooFar');
    expect(code(() => normalizeEventDraft(timed({ date: '2031-11-22' }), opts))).toBe('calendarWrite.dayTooFar');
  });
});

describe('normalizeEventDraft: all-day events', () => {
  const allDay = (over: Partial<EventDraft> = {}): EventDraft => ({ title: 'Grandma visiting', date: '2026-11-21', allDay: true, ...over });

  it('makes the end exclusive', () => {
    expect(normalizeEventDraft(allDay({ lastDate: '2026-11-22' }), opts)).toEqual({
      title: 'Grandma visiting',
      allDay: true,
      startDate: '2026-11-21',
      endDateExclusive: '2026-11-23',
    });
  });

  it('is one day without a last day, ignoring any times sent along', () => {
    expect(normalizeEventDraft(allDay({ startTime: 'nonsense' }), opts)).toMatchObject({ endDateExclusive: '2026-11-22' });
  });

  it('turns down a last day before the first', () => {
    expect(code(() => normalizeEventDraft(allDay({ lastDate: '2026-11-20' }), opts))).toBe('calendarWrite.lastDayBeforeFirst');
  });

  it('caps how many days it covers', () => {
    expect(() => normalizeEventDraft(allDay({ lastDate: '2027-11-21' }), opts)).not.toThrow();
    expect(code(() => normalizeEventDraft(allDay({ lastDate: '2027-11-22' }), opts))).toBe('calendarWrite.tooManyDays');
  });
});

describe('repeats', () => {
  it('offers every weekday only from a weekday', () => {
    expect(repeatFrequenciesFor('2026-11-23')).toContain('weekdays'); // Monday
    expect(repeatFrequenciesFor('2026-11-21')).not.toContain('weekdays'); // Saturday
    expect(code(() => normalizeEventDraft(timed({ date: '2026-11-21', repeat: { frequency: 'weekdays' } }), opts))).toBe(
      'calendarWrite.weekdaysOnWeekend',
    );
  });

  it('turns down an unknown repeat and a bad stop day', () => {
    expect(code(() => normalizeEventDraft(timed({ repeat: { frequency: 'hourly' as never } }), opts))).toBe('calendarWrite.badRepeat');
    expect(code(() => normalizeEventDraft(timed({ repeat: { frequency: 'weekly', until: '2026-11-22' } }), opts))).toBe(
      'calendarWrite.repeatEndsBeforeStart',
    );
    expect(code(() => normalizeEventDraft(timed({ repeat: { frequency: 'weekly', until: '2036-11-24' } }), opts))).toBe(
      'calendarWrite.repeatTooLong',
    );
  });

  it('writes the family choices as RRULE lines', () => {
    const rule = (frequency: never | string) => repeatToRRule(normalizeEventDraft(timed({ repeat: { frequency: frequency as 'daily' } }), opts));
    expect(rule('daily')).toBe('RRULE:FREQ=DAILY');
    expect(rule('weekdays')).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    expect(rule('weekly')).toBe('RRULE:FREQ=WEEKLY');
    expect(rule('biweekly')).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2');
    expect(rule('monthly')).toBe('RRULE:FREQ=MONTHLY');
    expect(rule('yearly')).toBe('RRULE:FREQ=YEARLY');
    expect(repeatToRRule(normalizeEventDraft(timed(), opts))).toBeNull();
  });

  it('stops a timed repeat at the end of its last day on the household clock', () => {
    // December 18 ends at midnight Chicago time, 06:00 UTC on the 19th.
    const e = normalizeEventDraft(timed({ repeat: { frequency: 'weekly', until: '2026-12-18' } }), opts);
    expect(repeatToRRule(e)).toBe('RRULE:FREQ=WEEKLY;UNTIL=20261219T055959Z');
  });

  it('stops an all-day repeat on a date', () => {
    const e = normalizeEventDraft({ title: 'Trash', date: '2026-11-23', allDay: true, repeat: { frequency: 'weekly', until: '2027-06-01' } }, opts);
    expect(repeatToRRule(e)).toBe('RRULE:FREQ=WEEKLY;UNTIL=20270601');
  });

  it('reads the family choices back, with or without a stop', () => {
    expect(repeatFromRecurrence(undefined)).toEqual({ kind: 'none' });
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY'])).toEqual({ kind: 'known', rule: { frequency: 'weekly' } });
    expect(repeatFromRecurrence(['RRULE:INTERVAL=2;FREQ=WEEKLY;WKST=SU'])).toEqual({ kind: 'known', rule: { frequency: 'biweekly' } });
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=FR,MO,TU,WE,TH'])).toEqual({ kind: 'known', rule: { frequency: 'weekdays' } });
    expect(repeatFromRecurrence(['RRULE:FREQ=DAILY;INTERVAL=1'])).toEqual({ kind: 'known', rule: { frequency: 'daily' } });
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY;UNTIL=20261219T055959Z'], TZ)).toEqual({
      kind: 'known',
      rule: { frequency: 'weekly', until: '2026-12-18' },
    });
    expect(repeatFromRecurrence(['RRULE:FREQ=MONTHLY;UNTIL=20270601'])).toEqual({ kind: 'known', rule: { frequency: 'monthly', until: '2027-06-01' } });
  });

  it('reads what it cannot edit as other', () => {
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=TU,TH'])).toEqual({ kind: 'other' });
    expect(repeatFromRecurrence(['RRULE:FREQ=MONTHLY;BYDAY=1MO'])).toEqual({ kind: 'other' });
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY;COUNT=10'])).toEqual({ kind: 'other' });
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY;INTERVAL=3'])).toEqual({ kind: 'other' });
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY', 'RDATE:20261201'])).toEqual({ kind: 'other' });
  });

  it('keeps EXDATE lines out of the reading: a skipped day is still every week', () => {
    expect(repeatFromRecurrence(['EXDATE;TZID=America/Chicago:20261128T090000', 'RRULE:FREQ=WEEKLY'])).toEqual({
      kind: 'known',
      rule: { frequency: 'weekly' },
    });
  });
});

describe('form helpers', () => {
  it('works out the length and the next-day mark', () => {
    expect(draftMinutes('14:00', '16:00')).toBe(120);
    expect(draftMinutes('18:00', '10:00')).toBe(16 * 60);
    expect(draftMinutes('09:00', '09:00')).toBeNull();
    expect(draftMinutes('9', '10:00')).toBeNull();
    expect(endsNextDay('18:00', '10:00')).toBe(true);
    expect(endsNextDay('09:00', '10:00')).toBe(false);
  });

  it('lets only every time change how an event repeats', () => {
    expect(() => checkChangeScope('series', true)).not.toThrow();
    expect(() => checkChangeScope('instance', false)).not.toThrow();
    expect(code(() => checkChangeScope('instance', true))).toBe('calendarWrite.repeatNeedsEveryTime');
  });
});

describe('splitGoogleEventId', () => {
  const ids = ['family@group.calendar.google.com', 'primary'];

  it('splits against the ticked calendars', () => {
    expect(splitGoogleEventId('primary:abc_20261121T150000Z', ids)).toEqual({ calendarId: 'primary', eventId: 'abc_20261121T150000Z' });
    expect(splitGoogleEventId('family@group.calendar.google.com:x1', ids)).toEqual({
      calendarId: 'family@group.calendar.google.com',
      eventId: 'x1',
    });
  });

  it('refuses an id from a calendar that is not ticked, or with no event part', () => {
    expect(splitGoogleEventId('other@example.com:x1', ids)).toBeNull();
    expect(splitGoogleEventId('primary:', ids)).toBeNull();
    expect(splitGoogleEventId('primaryx:1', ids)).toBeNull();
  });
});

describe('googleEntryState', () => {
  const ready = {
    settingOn: true,
    clientMode: 'own' as const,
    hostedEventsEnabled: false,
    webClientSaved: true,
    grant: { kind: 'web' as const, scopes: ['https://www.googleapis.com/auth/calendar.readonly', GOOGLE_EVENTS_SCOPE] },
  };

  it('is ready with a web sign-in that may write', () => {
    expect(googleEntryState(ready)).toBe('ready');
  });

  it('says nothing on Home Screens\' app until its events switch is on', () => {
    expect(googleEntryState({ ...ready, clientMode: 'hosted' })).toBe('notOffered');
    expect(googleEntryState({ ...ready, clientMode: 'hosted', settingOn: false })).toBe('notOffered');
    expect(googleEntryState({ ...ready, clientMode: 'hosted', hostedEventsEnabled: true })).toBe('ready');
    expect(googleEntryState({ ...ready, clientMode: 'hosted', hostedEventsEnabled: true, webClientSaved: false })).toBe('ready');
  });

  it('says nothing with no Google app at all', () => {
    expect(googleEntryState({ ...ready, clientMode: null })).toBe('notOffered');
  });

  it('walks the own-app steps in order', () => {
    expect(googleEntryState({ ...ready, settingOn: false })).toBe('off');
    expect(googleEntryState({ ...ready, webClientSaved: false })).toBe('needsWebClient');
    expect(googleEntryState({ ...ready, grant: null })).toBe('needsSignIn');
    expect(googleEntryState({ ...ready, grant: { kind: 'device', scopes: [GOOGLE_EVENTS_SCOPE] } })).toBe('needsSignIn');
    expect(googleEntryState({ ...ready, grant: { kind: 'web', scopes: ['https://www.googleapis.com/auth/calendar.readonly'] } })).toBe(
      'scopeMissing',
    );
  });

  it('reads Google\'s scope string', () => {
    expect(grantedScopes(` a  b\n${GOOGLE_EVENTS_SCOPE} `)).toEqual(['a', 'b', GOOGLE_EVENTS_SCOPE]);
    expect(grantedScopes(undefined)).toEqual([]);
  });
});
