import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { calendar_v3 } from '@googleapis/calendar';

vi.mock('@/lib/google-auth', () => ({ getAuthenticatedClient: vi.fn(async () => ({})) }));

/** A stand-in Google: the events it holds, and every call the writer makes. */
const held = new Map<string, calendar_v3.Schema$Event>();
const calls: { method: 'get' | 'patch' | 'insert'; eventId?: string; fields?: string; body?: calendar_v3.Schema$Event; ifMatch?: string }[] = [];
const fakeCalendar = {
  events: {
    get: vi.fn(async ({ eventId, fields }: { eventId: string; fields?: string }) => {
      calls.push({ method: 'get', eventId, ...(fields ? { fields } : {}) });
      const data = held.get(eventId);
      if (!data) throw Object.assign(new Error('Not Found'), { code: 404 });
      return { data };
    }),
    patch: vi.fn(async ({ eventId, requestBody }: { eventId: string; requestBody: calendar_v3.Schema$Event }, options: { headers: Record<string, string> }) => {
      calls.push({ method: 'patch', eventId, body: requestBody, ifMatch: options.headers['If-Match'] });
      return { data: {} };
    }),
    insert: vi.fn(async ({ requestBody }: { requestBody: calendar_v3.Schema$Event }) => {
      calls.push({ method: 'insert', body: requestBody });
      return { data: { id: 'new1' } };
    }),
  },
};
vi.mock('@/lib/google-calendar', () => ({ calendarApi: () => fakeCalendar }));

const { createGoogleEvent, describeWriteFailure, draftFromGoogle, getGoogleEventForEdit, seriesTimes, toGoogleBody, updateGoogleEvent, withNewRRule, writeRefusal } =
  await import('../google-calendar-write');
const { normalizeEventDraft } = await import('../calendar-write');

const TZ = 'America/Chicago';
const opts = { timezone: TZ, now: new Date('2026-11-21T16:00:00Z') };

describe('toGoogleBody', () => {
  it('writes a timed event on the household clock with its zone', () => {
    const e = normalizeEventDraft({ title: 'Piano', date: '2026-11-23', allDay: false, startTime: '16:00', endTime: '16:45', repeat: { frequency: 'weekly' } }, opts);
    expect(toGoogleBody(e)).toEqual({
      summary: 'Piano',
      location: '',
      // The other shape is cleared by name, so a patch that turns an all-day event timed leaves no `date` behind.
      start: { date: null, dateTime: '2026-11-23T16:00:00', timeZone: TZ },
      end: { date: null, dateTime: '2026-11-23T16:45:00', timeZone: TZ },
      recurrence: ['RRULE:FREQ=WEEKLY'],
    });
  });

  it('writes an all-day event with its exclusive end and a place', () => {
    const e = normalizeEventDraft({ title: 'Grandma visiting', date: '2026-11-21', allDay: true, lastDate: '2026-11-22', location: 'Here' }, opts);
    expect(toGoogleBody(e)).toEqual({
      summary: 'Grandma visiting',
      location: 'Here',
      start: { date: '2026-11-21', dateTime: null, timeZone: null },
      end: { date: '2026-11-23', dateTime: null, timeZone: null },
    });
  });
});

describe('draftFromGoogle', () => {
  it('reads a timed event onto the household clock, next-day end included', () => {
    const draft = draftFromGoogle(
      { summary: 'Sleepover', location: "The Lees'", start: { dateTime: '2026-11-28T00:00:00Z' }, end: { dateTime: '2026-11-28T16:00:00Z' } },
      TZ,
      { kind: 'none' },
    );
    expect(draft).toEqual({ title: 'Sleepover', location: "The Lees'", allDay: false, date: '2026-11-27', startTime: '18:00', endTime: '10:00' });
  });

  it('reads a time without an offset on the event\'s own clock', () => {
    expect(draftFromGoogle(
      { summary: 'Soccer', start: { dateTime: '2026-11-21T09:00:00', timeZone: TZ }, end: { dateTime: '2026-11-21T10:30:00', timeZone: TZ } },
      TZ,
      { kind: 'none' },
    )).toMatchObject({ date: '2026-11-21', startTime: '09:00', endTime: '10:30' });
  });

  it('marks a timed event of 24 hours or more with the day it ends, and no shorter one', () => {
    const read = (start: string, end: string) =>
      draftFromGoogle({ summary: 'Cabin', start: { dateTime: start, timeZone: TZ }, end: { dateTime: end, timeZone: TZ } }, TZ, { kind: 'none' });
    // Friday 6 PM to Sunday 4 PM.
    expect(read('2026-11-27T18:00:00', '2026-11-29T16:00:00')).toEqual({
      title: 'Cabin', allDay: false, date: '2026-11-27', startTime: '18:00', endTime: '16:00', endDate: '2026-11-29',
    });
    // 26 hours, and exactly 24 and 48.
    expect(read('2026-11-27T10:00:00', '2026-11-28T12:00:00')).toMatchObject({ endTime: '12:00', endDate: '2026-11-28' });
    expect(read('2026-11-27T10:00:00', '2026-11-28T10:00:00')).toMatchObject({ endTime: '10:00', endDate: '2026-11-28' });
    expect(read('2026-11-27T18:00:00', '2026-11-29T18:00:00')).toMatchObject({ endTime: '18:00', endDate: '2026-11-29' });
    // A minute under a day is one the form can make itself.
    expect(read('2026-11-27T10:00:00', '2026-11-28T09:59:00')).not.toHaveProperty('endDate');
  });

  it('reads an all-day event back to its real last day, and carries a known repeat', () => {
    expect(draftFromGoogle({ summary: 'Trip', start: { date: '2026-12-20' }, end: { date: '2026-12-24' } }, TZ, { kind: 'known', rule: { frequency: 'yearly' } })).toEqual({
      title: 'Trip',
      allDay: true,
      date: '2026-12-20',
      lastDate: '2026-12-23',
      repeat: { frequency: 'yearly' },
    });
    expect(draftFromGoogle({ summary: 'Day', start: { date: '2026-12-20' }, end: { date: '2026-12-21' } }, TZ, { kind: 'other' })).not.toHaveProperty('lastDate');
  });
});

describe('seriesTimes ("Every time")', () => {
  const timed = (date: string, startTime: string, endTime: string) =>
    normalizeEventDraft({ title: 'Soccer', date, allDay: false, startTime, endTime }, opts);

  it('keeps the series first day and takes the new times', () => {
    // The series started September 5; the family moved Nov 21's practice from 9:00 to 9:30.
    expect(seriesTimes(timed('2026-11-21', '09:30', '11:00'), { start: { dateTime: '2026-09-05T09:00:00-05:00', timeZone: TZ } }, '2026-11-21', TZ)).toEqual({
      start: { date: null, dateTime: '2026-09-05T09:30:00', timeZone: TZ },
      end: { date: null, dateTime: '2026-09-05T11:00:00', timeZone: TZ },
    });
  });

  it('moves the whole series by the days this day moved', () => {
    expect(seriesTimes(timed('2026-11-22', '09:00', '10:30'), { start: { dateTime: '2026-09-05T14:00:00Z' } }, '2026-11-21', TZ)).toMatchObject({
      start: { dateTime: '2026-09-06T09:00:00' },
    });
  });

  it('keeps a next-day end a day after the series start', () => {
    expect(seriesTimes(timed('2026-11-27', '18:00', '10:00'), { start: { dateTime: '2026-10-02T18:00:00-05:00' } }, '2026-11-27', TZ)).toMatchObject({
      start: { dateTime: '2026-10-02T18:00:00' },
      end: { dateTime: '2026-10-03T10:00:00' },
    });
  });

  it('keeps an all-day series as long as the day was', () => {
    const e = normalizeEventDraft({ title: 'Camp', date: '2026-11-23', allDay: true, lastDate: '2026-11-24' }, opts);
    expect(seriesTimes(e, { start: { date: '2026-01-05' } }, '2026-11-23', TZ)).toEqual({
      start: { date: '2026-01-05', dateTime: null, timeZone: null },
      end: { date: '2026-01-07', dateTime: null, timeZone: null },
    });
  });

  describe('from a day that was moved on its own', () => {
    // Tuesdays 5 to 6 PM from September 1; November 24 was moved to 6 to 7 PM.
    const series = { start: { dateTime: '2026-09-01T17:00:00', timeZone: TZ }, end: { dateTime: '2026-09-01T18:00:00', timeZone: TZ } };
    const movedDay = { allDay: false, startMinute: 18 * 60, minutes: 60 } as const;

    it('moves the series by as much as the family moved that day, not onto that day', () => {
      // 6:00 to 7:00 becomes 6:30 to 7:30 on the moved day: every Tuesday goes half an hour later.
      expect(seriesTimes(timed('2026-11-24', '18:30', '19:30'), series, '2026-11-24', TZ, movedDay)).toMatchObject({
        start: { dateTime: '2026-09-01T17:30:00' },
        end: { dateTime: '2026-09-01T18:30:00' },
      });
    });

    it('grows the series by as much as that day grew', () => {
      expect(seriesTimes(timed('2026-11-24', '18:00', '19:30'), series, '2026-11-24', TZ, movedDay)).toMatchObject({
        start: { dateTime: '2026-09-01T17:00:00' },
        end: { dateTime: '2026-09-01T18:30:00' },
      });
    });

    it('gives the same answer as before for a day that was never moved', () => {
      const unmoved = { allDay: false, startMinute: 17 * 60, minutes: 60 } as const;
      expect(seriesTimes(timed('2026-11-25', '16:15', '18:00'), series, '2026-11-24', TZ, unmoved))
        .toEqual(seriesTimes(timed('2026-11-25', '16:15', '18:00'), series, '2026-11-24', TZ));
    });

    it('falls back to the new length when shortening the day would leave the series none', () => {
      // The moved day ran three hours and is cut to one; the series only ever ran one.
      const longDay = { allDay: false, startMinute: 18 * 60, minutes: 180 } as const;
      expect(seriesTimes(timed('2026-11-24', '18:00', '19:00'), series, '2026-11-24', TZ, longDay)).toMatchObject({
        start: { dateTime: '2026-09-01T17:00:00' },
        end: { dateTime: '2026-09-01T18:00:00' },
      });
    });

    it('carries a move past midnight onto the next day', () => {
      const late = { start: { dateTime: '2026-09-01T23:30:00', timeZone: TZ }, end: { dateTime: '2026-09-02T00:30:00', timeZone: TZ } };
      const day = { allDay: false, startMinute: 22 * 60, minutes: 60 } as const;
      expect(seriesTimes(timed('2026-11-24', '23:00', '00:00'), late, '2026-11-24', TZ, day)).toMatchObject({
        start: { dateTime: '2026-09-02T00:30:00' },
        end: { dateTime: '2026-09-02T01:30:00' },
      });
    });

    it('grows an all-day series by the days that day grew', () => {
      const camp = { start: { date: '2026-01-05' }, end: { date: '2026-01-06' } };
      const e = normalizeEventDraft({ title: 'Camp', date: '2026-11-23', allDay: true, lastDate: '2026-11-25' }, opts);
      // That day had been stretched to two days elsewhere; a third is one more for everyone.
      expect(seriesTimes(e, camp, '2026-11-23', TZ, { allDay: true, days: 2 })).toMatchObject({ start: { date: '2026-01-05' }, end: { date: '2026-01-07' } });
    });

    it('takes the new times as they are when the day turns all day', () => {
      const e = normalizeEventDraft({ title: 'Soccer', date: '2026-11-24', allDay: true }, opts);
      expect(seriesTimes(e, series, '2026-11-24', TZ, movedDay)).toMatchObject({ start: { date: '2026-09-01' }, end: { date: '2026-09-02' } });
    });
  });
});

describe('updateGoogleEvent', () => {
  const CAL = 'family@group.calendar.google.com';
  const household = { timezone: TZ, now: new Date('2026-11-21T16:00:00Z') };
  const patches = () => calls.filter((c) => c.method === 'patch');
  /** Load an event the way the Change form does, rename it, and send it back with its times untouched. */
  async function rename(eventId: string, title: string, scope: 'instance' | 'series') {
    const loaded = await getGoogleEventForEdit(CAL, eventId, TZ);
    calls.length = 0;
    await updateGoogleEvent({
      calendarId: CAL,
      eventId,
      etag: scope === 'series' ? loaded.seriesEtag! : loaded.etag,
      scope,
      seriesId: loaded.seriesId,
      dayWas: loaded.draft.date,
      event: normalizeEventDraft({ ...loaded.draft, title }, { ...household, timesChanged: false }),
      repeatChanged: false,
      timesChanged: false,
      timezone: TZ,
    });
    return loaded;
  }
  const at = (dateTime: string) => ({ dateTime, timeZone: TZ });

  beforeEach(() => {
    held.clear();
    calls.length = 0;
  });

  it('renames a Friday 6 PM to Sunday 4 PM event without sending its times', async () => {
    held.set('trip', { id: 'trip', etag: '"t1"', summary: 'Cabin trp', start: at('2026-11-27T18:00:00'), end: at('2026-11-29T16:00:00') });
    const loaded = await rename('trip', 'Cabin trip', 'instance');
    expect(loaded.draft.endDate).toBe('2026-11-29');
    expect(patches()).toEqual([{ method: 'patch', eventId: 'trip', body: { summary: 'Cabin trip', location: '' }, ifMatch: '"t1"' }]);
  });

  it('renames a 26 hour event, and one of exactly 48 hours, the same way', async () => {
    held.set('day', { id: 'day', etag: '"d1"', summary: 'Lake', start: at('2026-11-27T10:00:00'), end: at('2026-11-28T12:00:00') });
    await rename('day', 'Lake day', 'instance');
    expect(patches()[0].body).toEqual({ summary: 'Lake day', location: '' });

    held.set('two', { id: 'two', etag: '"w1"', summary: 'Lake', start: at('2026-11-27T18:00:00'), end: at('2026-11-29T18:00:00') });
    await rename('two', 'Lake weekend', 'instance');
    expect(patches()[0].body).toEqual({ summary: 'Lake weekend', location: '' });
  });

  it('renames one weekend of a weekly Friday to Sunday series, and every weekend, without sending times', async () => {
    held.set('cabin', { id: 'cabin', etag: '"s1"', summary: 'Cabin', start: at('2026-10-02T18:00:00'), end: at('2026-10-04T16:00:00'), recurrence: ['RRULE:FREQ=WEEKLY'] });
    held.set('cabin_20261127', { id: 'cabin_20261127', etag: '"i1"', recurringEventId: 'cabin', summary: 'Cabin', start: at('2026-11-27T18:00:00'), end: at('2026-11-29T16:00:00') });

    await rename('cabin_20261127', 'Cabin with the Lees', 'instance');
    expect(patches()).toEqual([{ method: 'patch', eventId: 'cabin_20261127', body: { summary: 'Cabin with the Lees', location: '' }, ifMatch: '"i1"' }]);

    await rename('cabin_20261127', 'Cabin weekend', 'series');
    expect(patches()).toEqual([{ method: 'patch', eventId: 'cabin', body: { summary: 'Cabin weekend', location: '' }, ifMatch: '"s1"' }]);
  });

  it('"Every time" from a day moved to another time renames the series and moves nothing', async () => {
    held.set('practice', { id: 'practice', etag: '"s1"', summary: 'Practice', start: at('2026-09-01T17:00:00'), end: at('2026-09-01T18:00:00'), recurrence: ['RRULE:FREQ=WEEKLY'] });
    held.set('practice_20261124', { id: 'practice_20261124', etag: '"i1"', recurringEventId: 'practice', summary: 'Practice', start: at('2026-11-24T18:00:00'), end: at('2026-11-24T19:00:00') });
    await rename('practice_20261124', 'Soccer practice', 'series');
    expect(patches()[0].body).toEqual({ summary: 'Soccer practice', location: '' });
  });

  it('sends times once the family changed them, measured from the day as it was loaded', async () => {
    held.set('practice', { id: 'practice', etag: '"s1"', summary: 'Practice', start: at('2026-09-01T17:00:00'), end: at('2026-09-01T18:00:00'), recurrence: ['RRULE:FREQ=WEEKLY'] });
    await updateGoogleEvent({
      calendarId: CAL, eventId: 'practice_20261124', etag: '"s1"', scope: 'series', seriesId: 'practice', dayWas: '2026-11-24',
      timeWas: { allDay: false, startMinute: 18 * 60, minutes: 60 },
      event: normalizeEventDraft({ title: 'Practice', date: '2026-11-24', allDay: false, startTime: '18:30', endTime: '19:30' }, household),
      repeatChanged: false, timesChanged: true, timezone: TZ,
    });
    expect(patches()[0].body).toMatchObject({ start: { date: null, dateTime: '2026-09-01T17:30:00' }, end: { date: null, dateTime: '2026-09-01T18:30:00' } });
  });

  it('turns an all-day event timed by clearing its dates by name', async () => {
    await updateGoogleEvent({
      calendarId: CAL, eventId: 'party', etag: '"p1"', scope: 'instance', dayWas: '2026-11-28',
      event: normalizeEventDraft({ title: 'Party', date: '2026-11-28', allDay: false, startTime: '14:00', endTime: '16:00' }, household),
      repeatChanged: false, timesChanged: true, timezone: TZ,
    });
    expect(patches()[0].body).toMatchObject({
      start: { date: null, dateTime: '2026-11-28T14:00:00', timeZone: TZ },
      end: { date: null, dateTime: '2026-11-28T16:00:00', timeZone: TZ },
    });
  });

  it('keeps a new repeat end in the series own shape when its times are left alone', async () => {
    held.set('practice', { id: 'practice', etag: '"s1"', summary: 'Practice', start: at('2026-09-01T17:00:00'), end: at('2026-09-01T18:00:00'), recurrence: ['RRULE:FREQ=WEEKLY'] });
    // The tapped day was made all day on its own; the series is still timed.
    await updateGoogleEvent({
      calendarId: CAL, eventId: 'practice_20261124', etag: '"s1"', scope: 'series', seriesId: 'practice', dayWas: '2026-11-24',
      event: normalizeEventDraft({ title: 'Practice', date: '2026-11-24', allDay: true, repeat: { frequency: 'weekly', until: '2026-12-15' } }, household),
      repeatChanged: true, timesChanged: false, timezone: TZ,
    });
    expect(patches()[0].body).toEqual({ summary: 'Practice', location: '', recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20261216T055959Z'] });
  });

  describe('a one-day change aimed at a series own id', () => {
    const input = {
      calendarId: CAL, eventId: 'soccer', etag: '"s1"', scope: 'instance' as const, dayWas: '2026-11-24',
      event: normalizeEventDraft({ title: 'Changed', date: '2026-11-24', allDay: false, startTime: '06:00', endTime: '07:00' }, household),
      repeatChanged: false, timesChanged: true, timezone: TZ,
    };

    it('is refused for a wall before anything is written', async () => {
      held.set('soccer', { id: 'soccer', etag: '"s1"', recurrence: ['EXDATE;TZID=America/Chicago:20261110T170000', 'RRULE:FREQ=WEEKLY'] });
      await expect(updateGoogleEvent({ ...input, refuseSeriesId: true })).rejects.toMatchObject({ code: 'calendarWrite.notEditable', status: 403 });
      expect(calls).toEqual([{ method: 'get', eventId: 'soccer', fields: 'recurrence' }]);
    });

    it('lets a wall change a plain event and one day of a series', async () => {
      held.set('dentist', { id: 'dentist', etag: '"d1"' });
      await updateGoogleEvent({ ...input, eventId: 'dentist', etag: '"d1"', refuseSeriesId: true });
      expect(patches()).toHaveLength(1);
    });

    it('costs a phone no extra read', async () => {
      await updateGoogleEvent(input);
      expect(calls.map((c) => c.method)).toEqual(['patch']);
    });
  });
});

describe('createGoogleEvent', () => {
  it('sends a new event only the fields it has', async () => {
    calls.length = 0;
    await createGoogleEvent('family', normalizeEventDraft({ title: 'Piano', date: '2026-11-23', allDay: false, startTime: '16:00', endTime: '16:45' }, opts));
    expect(calls[0].body).toMatchObject({ start: { dateTime: '2026-11-23T16:00:00', timeZone: TZ }, end: { dateTime: '2026-11-23T16:45:00', timeZone: TZ } });
    expect(calls[0].body?.start).not.toHaveProperty('date');
    expect(calls[0].body?.end).not.toHaveProperty('date');
  });
});

describe('withNewRRule', () => {
  it('swaps the rule and keeps skipped days', () => {
    expect(withNewRRule(['EXDATE;TZID=America/Chicago:20261128T090000', 'RRULE:FREQ=WEEKLY'], 'RRULE:FREQ=WEEKLY;INTERVAL=2')).toEqual([
      'EXDATE;TZID=America/Chicago:20261128T090000',
      'RRULE:FREQ=WEEKLY;INTERVAL=2',
    ]);
    expect(withNewRRule(['RRULE:FREQ=DAILY'], null)).toEqual([]);
  });
});

describe('writeRefusal', () => {
  it.each([
    [{ code: 412 }, 'calendarWrite.changedElsewhere', 409],
    [{ response: { status: 404 } }, 'calendarWrite.gone', 404],
    [{ status: 410 }, 'calendarWrite.gone', 404],
    [{ code: 403 }, 'calendarWrite.notAllowed', 403],
    [{ code: 401 }, 'calendarWrite.signInNeeded', 403],
    [{ code: 'ECONNRESET' }, 'calendarWrite.unreachable', 502],
    [{ code: 500 }, 'calendarWrite.unreachable', 502],
  ])('maps %o to %s', (err, code, status) => {
    const refusal = writeRefusal(err);
    expect(refusal.code).toBe(code);
    expect(refusal.status).toBe(status);
  });
  it('logs the status and Google\'s reason, never the event it was sending', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Google's client keeps the request it sent on the error.
    const err = Object.assign(new Error('Bad Request'), {
      status: 400,
      config: { data: { summary: 'Dentist for Sam', location: '42 Maple Ave' } },
      response: { status: 400, data: { error: { errors: [{ reason: 'invalid' }] } } },
    });
    writeRefusal(err);
    const logged = warn.mock.calls.flat().map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ');
    warn.mockRestore();
    expect(logged).toContain('HTTP 400, invalid');
    expect(logged).not.toContain('Dentist');
    expect(logged).not.toContain('Maple');
  });
});

describe('describeWriteFailure', () => {
  it('names a network failure by its code', () => {
    expect(describeWriteFailure(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }), undefined)).toBe('HTTP none, ECONNREFUSED');
    expect(describeWriteFailure(null, 502)).toBe('HTTP 502');
  });
});
