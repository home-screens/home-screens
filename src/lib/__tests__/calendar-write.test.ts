import { describe, expect, it } from 'vitest';
import {
  addingReadiness,
  CALENDAR_WRITE_LIMITS,
  CalendarWriteError,
  GOOGLE_EVENTS_SCOPE,
  anyWallMayWrite,
  checkChangeScope,
  checkDayWas,
  draftMinutes,
  endKeepingLength,
  endsNextDay,
  googleEntryState,
  googleEntryStateWithSetting,
  grantedScopes,
  isLongTimed,
  spansDays,
  normalizeEventDraft,
  readOnlyCalendars,
  readTimeWas,
  repeatFrequenciesFor,
  repeatFromRecurrence,
  seriesRuleFollows,
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
    // Monday, November 23: the day each choice is worded from.
    expect(rule('weekly')).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(rule('biweekly')).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO');
    expect(rule('monthly')).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=23');
    expect(rule('yearly')).toBe('RRULE:FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=23');
    expect(repeatToRRule(normalizeEventDraft(timed(), opts))).toBeNull();
  });

  it('names the day the choice is worded from, so a repeat changed from another day of a series lands where the form says', () => {
    // "Every week on Wednesday" from a Wednesday of a series that began on a Tuesday.
    expect(repeatToRRule(normalizeEventDraft(timed({ date: '2026-11-25', repeat: { frequency: 'weekly' } }), opts))).toBe('RRULE:FREQ=WEEKLY;BYDAY=WE');
    // "Every month on the 22nd" from November 22, a series that began on the 15th.
    expect(repeatToRRule(normalizeEventDraft({ title: 'Book club', date: '2026-11-22', allDay: true, repeat: { frequency: 'monthly' } }, opts))).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=22');
  });

  it('writes the rule again when the series moves to another day, so the named day follows', () => {
    const moved = normalizeEventDraft(timed({ date: '2026-11-26', repeat: { frequency: 'weekly' } }), opts);
    expect(seriesRuleFollows(moved, { repeatChanged: false, timesChanged: true, dayWas: '2026-11-25' })).toBe(true);
    // The same day at another time, a rule naming no day, or no times sent: the rule stays.
    expect(seriesRuleFollows(moved, { repeatChanged: false, timesChanged: true, dayWas: '2026-11-26' })).toBe(false);
    const daily = normalizeEventDraft(timed({ date: '2026-11-26', repeat: { frequency: 'daily' } }), opts);
    expect(seriesRuleFollows(daily, { repeatChanged: false, timesChanged: true, dayWas: '2026-11-25' })).toBe(false);
    expect(seriesRuleFollows(moved, { repeatChanged: false, timesChanged: false, dayWas: '2026-11-25' })).toBe(false);
    expect(seriesRuleFollows(moved, { repeatChanged: true, timesChanged: false, dayWas: '2026-11-26' })).toBe(true);
  });

  it('reads back every choice it writes', () => {
    for (const frequency of ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'] as const) {
      const line = repeatToRRule(normalizeEventDraft(timed({ date: '2026-11-25', repeat: { frequency } }), opts))!;
      expect(repeatFromRecurrence([line]), line).toEqual({ kind: 'known', rule: { frequency } });
    }
  });

  it('stops a timed repeat at the end of its last day on the household clock', () => {
    // December 18 ends at midnight Chicago time, 06:00 UTC on the 19th.
    const e = normalizeEventDraft(timed({ repeat: { frequency: 'weekly', until: '2026-12-18' } }), opts);
    expect(repeatToRRule(e)).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261219T055959Z');
  });

  it('stops an all-day repeat on a date', () => {
    const e = normalizeEventDraft({ title: 'Trash', date: '2026-11-23', allDay: true, repeat: { frequency: 'weekly', until: '2027-06-01' } }, opts);
    expect(repeatToRRule(e)).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20270601');
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

  it('reads a rule anchored to one day as the family choice, the way Google writes every weekly event', () => {
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=TU'])).toEqual({ kind: 'known', rule: { frequency: 'weekly' } });
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY;WKST=SU;INTERVAL=2;BYDAY=WE'])).toEqual({ kind: 'known', rule: { frequency: 'biweekly' } });
    expect(repeatFromRecurrence(['RRULE:FREQ=MONTHLY;BYMONTHDAY=22'])).toEqual({ kind: 'known', rule: { frequency: 'monthly' } });
    expect(repeatFromRecurrence(['RRULE:FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=23'])).toEqual({ kind: 'known', rule: { frequency: 'yearly' } });
  });

  it('reads what it cannot edit as other', () => {
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=TU,TH'])).toEqual({ kind: 'other' });
    expect(repeatFromRecurrence(['RRULE:FREQ=MONTHLY;BYDAY=1MO'])).toEqual({ kind: 'other' });
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY;COUNT=10'])).toEqual({ kind: 'other' });
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY;INTERVAL=3'])).toEqual({ kind: 'other' });
    expect(repeatFromRecurrence(['RRULE:FREQ=WEEKLY', 'RDATE:20261201'])).toEqual({ kind: 'other' });
    expect(repeatFromRecurrence(['RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15'])).toEqual({ kind: 'other' });
    expect(repeatFromRecurrence(['RRULE:FREQ=DAILY;BYDAY=MO'])).toEqual({ kind: 'other' });
    expect(repeatFromRecurrence(['RRULE:FREQ=YEARLY;BYMONTHDAY=23'])).toEqual({ kind: 'other' });
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

  it('keeps the length when Starts moves', () => {
    // An hour and a half, moved half an hour earlier, still ends an hour and a half later.
    expect(endKeepingLength('23:00', '00:30', '22:30', 60)).toBe('00:00');
    expect(endKeepingLength('10:00', '11:00', '15:15', 60)).toBe('16:15');
    // Moving late enough carries Ends past midnight, which the form shows as the next day.
    expect(endKeepingLength('21:00', '23:00', '23:00', 60)).toBe('01:00');
    // No length yet (Ends equal to Starts): the usual length stands in.
    expect(endKeepingLength('09:00', '09:00', '10:00', 90)).toBe('11:30');
    // A half-typed start leaves Ends alone.
    expect(endKeepingLength('09:00', '10:00', '1', 60)).toBe('10:00');
  });

  it('lets only every time change how a series repeats', () => {
    expect(() => checkChangeScope('series', true, true)).not.toThrow();
    expect(() => checkChangeScope('instance', false, true)).not.toThrow();
    expect(code(() => checkChangeScope('instance', true, true))).toBe('calendarWrite.repeatNeedsEveryTime');
  });

  it('lets a one-off be given a repeat', () => {
    expect(() => checkChangeScope('instance', true, false)).not.toThrow();
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

  it('gives the same answer from the with-adding-on state and the switch as from the full inputs', () => {
    const variants = [
      ready,
      { ...ready, clientMode: 'hosted' as const },
      { ...ready, clientMode: 'hosted' as const, hostedEventsEnabled: true },
      { ...ready, clientMode: null },
      { ...ready, webClientSaved: false },
      { ...ready, grant: null },
      { ...ready, grant: { kind: 'web' as const, scopes: ['https://www.googleapis.com/auth/calendar.readonly'] } },
    ];
    for (const input of variants) {
      const ifOn = googleEntryState({ ...input, settingOn: true });
      for (const settingOn of [true, false]) {
        expect(googleEntryStateWithSetting(ifOn, settingOn)).toBe(googleEntryState({ ...input, settingOn }));
      }
    }
  });

  it('reads Google\'s scope string', () => {
    expect(grantedScopes(` a  b\n${GOOGLE_EVENTS_SCOPE} `)).toEqual(['a', 'b', GOOGLE_EVENTS_SCOPE]);
    expect(grantedScopes(undefined)).toEqual([]);
  });
});

describe('normalizeEventDraft: a change that leaves the times alone', () => {
  // Friday 6 PM to Sunday 4 PM, as the Change form loads it.
  const weekend: EventDraft = { title: 'Cabin trip', date: '2026-11-27', allDay: false, startTime: '18:00', endTime: '16:00', endDate: '2026-11-29' };
  const code = (run: () => unknown) => {
    try {
      run();
    } catch (e) {
      return (e as CalendarWriteError).code;
    }
    return null;
  };

  it('keeps the real end day of an event of a day or more', () => {
    expect(isLongTimed(weekend)).toBe(true);
    expect(normalizeEventDraft(weekend, { ...opts, timesChanged: false })).toMatchObject({
      startLocal: '2026-11-27T18:00:00',
      endLocal: '2026-11-29T16:00:00',
    });
  });

  it('lets an event of exactly 48 hours be renamed, though it starts and ends at the same clock time', () => {
    const two = { ...weekend, title: 'Lake weekend', endTime: '18:00' };
    expect(normalizeEventDraft(two, { ...opts, timesChanged: false })).toMatchObject({ title: 'Lake weekend', endLocal: '2026-11-29T18:00:00' });
  });

  it('refuses new times for an event of a day or more, said or left unsaid', () => {
    expect(code(() => normalizeEventDraft(weekend, { ...opts, timesChanged: true }))).toBe('calendarWrite.notEditable');
    expect(code(() => normalizeEventDraft(weekend, opts))).toBe('calendarWrite.notEditable');
    try {
      normalizeEventDraft(weekend, opts);
    } catch (e) {
      expect((e as CalendarWriteError).status).toBe(403);
    }
  });

  it('refuses an end day that is no day, or before the start', () => {
    expect(code(() => normalizeEventDraft({ ...weekend, endDate: 'soon' }, { ...opts, timesChanged: false }))).toBe('calendarWrite.badDate');
    expect(code(() => normalizeEventDraft({ ...weekend, endDate: '2026-11-26' }, { ...opts, timesChanged: false }))).toBe('calendarWrite.badDate');
  });

  it('lets an event that ends the moment it starts be renamed, and still refuses to make one', () => {
    const instant = timed({ startTime: '15:30', endTime: '15:30' });
    expect(normalizeEventDraft(instant, { ...opts, timesChanged: false })).toMatchObject({ startLocal: '2026-11-23T15:30:00', endLocal: '2026-11-23T15:30:00' });
    expect(code(() => normalizeEventDraft(instant, { ...opts, timesChanged: true }))).toBe('calendarWrite.endsWhenItStarts');
    expect(code(() => normalizeEventDraft(instant, opts))).toBe('calendarWrite.endsWhenItStarts');
  });

  it('is not a long event when it is all day or has no end day', () => {
    expect(isLongTimed(timed())).toBe(false);
    expect(isLongTimed({ allDay: true, endDate: '2026-11-29' })).toBe(false);
  });

  it('keeps an event across days its shape, all day or timed', () => {
    expect(spansDays(weekend)).toBe(true);
    expect(spansDays({ allDay: true, date: '2026-11-27', lastDate: '2026-11-28' })).toBe(true);
    expect(spansDays({ allDay: true, date: '2026-11-27', lastDate: '2026-11-27' })).toBe(false);
    expect(spansDays(timed())).toBe(false);
  });
});

describe('repeatToRRule: whose shape the end takes', () => {
  it('writes the end as a time for a timed series changed from a day that was made all day', () => {
    const day = normalizeEventDraft({ title: 'Practice', date: '2026-11-24', allDay: true, repeat: { frequency: 'weekly', until: '2026-12-15' } }, opts);
    // Tuesday the 24th, and Monday the 23rd for the timed one.
    expect(repeatToRRule(day)).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261215');
    expect(repeatToRRule(day, { allDay: false, timeZone: TZ })).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261216T055959Z');
    const timedDay = normalizeEventDraft(timed({ repeat: { frequency: 'weekly', until: '2026-12-15' } }), opts);
    expect(repeatToRRule(timedDay, { allDay: true })).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261215');
  });
});

describe('checkDayWas', () => {
  const today = '2026-11-21';
  const code = (value: unknown) => {
    try {
      checkDayWas(value, today);
    } catch (e) {
      return (e as CalendarWriteError).code;
    }
    return null;
  };

  it('takes a real day near today', () => {
    expect(checkDayWas('2026-11-24', today)).toBe('2026-11-24');
    expect(checkDayWas('2021-11-21', today)).toBe('2021-11-21');
  });

  it('refuses anything that is not a day, where a shift of nothing used to pass quietly', () => {
    expect(code('not-a-date')).toBe('calendarWrite.badDate');
    expect(code('2026-02-30')).toBe('calendarWrite.badDate');
    expect(code(undefined)).toBe('calendarWrite.badDate');
    expect(code(20261124)).toBe('calendarWrite.badDate');
  });

  it('refuses a day further away than an event may start, which would carry a series decades off', () => {
    expect(code('1990-01-01')).toBe('calendarWrite.dayTooFar');
    expect(code('2031-11-22')).toBe('calendarWrite.dayTooFar');
  });
});

describe('readTimeWas', () => {
  it('reads a timed day as its start and length, next-day end included', () => {
    expect(readTimeWas({ allDay: false, startTime: '18:00', endTime: '19:00' }, '2026-11-24')).toEqual({ allDay: false, startMinute: 1080, minutes: 60 });
    expect(readTimeWas({ allDay: false, startTime: '18:00', endTime: '10:00' }, '2026-11-24')).toEqual({ allDay: false, startMinute: 1080, minutes: 960 });
  });

  it('reads an all-day day as its days, one when no last day is named', () => {
    expect(readTimeWas({ allDay: true, lastDate: '2026-11-25' }, '2026-11-24')).toEqual({ allDay: true, days: 2 });
    expect(readTimeWas({ allDay: true }, '2026-11-24')).toEqual({ allDay: true, days: 1 });
  });

  it('answers nothing when none was sent or the day had no length', () => {
    expect(readTimeWas(undefined, '2026-11-24')).toBeUndefined();
    expect(readTimeWas({ allDay: false, startTime: '18:00', endTime: '18:00' }, '2026-11-24')).toBeUndefined();
  });

  it('refuses times that are not times and a last day before the first', () => {
    expect(() => readTimeWas({ allDay: false, startTime: '25:00', endTime: '26:00' }, '2026-11-24')).toThrow(expect.objectContaining({ code: 'calendarWrite.badTime' }));
    expect(() => readTimeWas('18:00', '2026-11-24')).toThrow(expect.objectContaining({ code: 'calendarWrite.badTime' }));
    expect(() => readTimeWas({ allDay: true, lastDate: '2026-11-20' }, '2026-11-24')).toThrow(expect.objectContaining({ code: 'calendarWrite.badDate' }));
  });
});

describe('anyWallMayWrite', () => {
  const display = (calendarWallEntry?: boolean) => ({ settings: calendarWallEntry === undefined ? {} : { calendarWallEntry } });

  it('goes by the household before any displays exist', () => {
    expect(anyWallMayWrite({}, undefined)).toBe(true);
    expect(anyWallMayWrite({}, [])).toBe(true);
    expect(anyWallMayWrite({ calendarWallEntry: false }, [])).toBe(false);
  });

  it('refuses once every display has turned it off, even with the household on', () => {
    expect(anyWallMayWrite({}, [display(false), display(false)])).toBe(false);
    expect(anyWallMayWrite({ calendarWallEntry: true }, [display(false)])).toBe(false);
  });

  it('allows while one display is on, by its own switch or the household', () => {
    expect(anyWallMayWrite({}, [display(false), display()])).toBe(true);
    expect(anyWallMayWrite({ calendarWallEntry: false }, [display(false), display(true)])).toBe(true);
    expect(anyWallMayWrite({ calendarWallEntry: false }, [display(), display(false)])).toBe(false);
  });
});

describe('addingReadiness', () => {
  it('is off, waits on Google, waits on a picked calendar, or is ready', () => {
    expect(addingReadiness({ enabled: false, google: 'ready', calendars: 2 })).toBe('off');
    expect(addingReadiness({ enabled: true, google: 'needsSignIn', calendars: 0 })).toBe('needsGoogle');
    // Right after the switch is first turned on: signed in, nothing ticked.
    expect(addingReadiness({ enabled: true, google: 'ready', calendars: 0 })).toBe('noCalendars');
    expect(addingReadiness({ enabled: true, google: null, calendars: 0 })).toBe('noCalendars');
    // An iCloud calendar can take events while Google waits on its sign-in.
    expect(addingReadiness({ enabled: true, google: 'needsSignIn', calendars: 1 })).toBe('ready');
    // Signed in, but Google could not be asked: not "no calendar is picked".
    expect(addingReadiness({ enabled: true, google: 'ready', calendars: 0, googleUnreachable: true })).toBe('googleUnreachable');
  });
});

describe('readOnlyCalendars', () => {
  const link = { id: 'ical-school', type: 'ical' as const, name: 'School', url: 'https://example.com/school.ics', color: '#f97316', enabled: true };
  const birthdays = { id: 'ic-bd', accountId: 'acct', kind: 'birthdays' as const, url: '', name: 'Birthdays', color: '#ef4444', enabled: true };
  const home = { id: 'ic-home', accountId: 'acct', kind: 'calendar' as const, url: 'https://caldav.example.com/home/', name: 'Home', color: '#ef4444', enabled: true };
  const writable = (id: string) => ({ family: true, team: false } as Record<string, boolean | undefined>)[id];

  it('names calendar links, calendars that can only be read, or both', () => {
    expect(readOnlyCalendars({ googleCalendarIds: ['family'], icalSources: [link] }, writable)).toBe('links');
    expect(readOnlyCalendars({ googleCalendarIds: ['family', 'team'], icalSources: [] }, writable)).toBe('readOnly');
    expect(readOnlyCalendars({ googleCalendarIds: ['family', 'team'], icalSources: [link] }, writable)).toBe('both');
    // A birthdays calendar comes from Contacts and never takes an event.
    expect(readOnlyCalendars({ googleCalendarIds: [], icalSources: [], icloudSources: [home, birthdays] }, writable)).toBe('readOnly');
  });

  it('counts only calendars the screens show', () => {
    expect(readOnlyCalendars({ googleCalendarIds: ['family'], icalSources: [{ ...link, enabled: false }], icloudSources: [{ ...birthdays, enabled: false }] }, writable)).toBeNull();
  });

  it('does not count a Google calendar nobody can say about yet, nor one that can take events', () => {
    // Google not answering, or its sign-in still needing the extra step.
    expect(readOnlyCalendars({ googleCalendarIds: ['unknown'], icalSources: [] }, writable)).toBeNull();
    expect(readOnlyCalendars({ googleCalendarIds: ['family'], icalSources: [], icloudSources: [home] }, writable)).toBeNull();
  });
});
