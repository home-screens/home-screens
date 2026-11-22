import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/google-auth', () => ({ getAuthenticatedClient: vi.fn() }));

const { draftFromGoogle, seriesTimes, toGoogleBody, withNewRRule, writeRefusal } = await import('../google-calendar-write');
const { normalizeEventDraft } = await import('../calendar-write');

const TZ = 'America/Chicago';
const opts = { timezone: TZ, now: new Date('2026-11-21T16:00:00Z') };

describe('toGoogleBody', () => {
  it('writes a timed event on the household clock with its zone', () => {
    const e = normalizeEventDraft({ title: 'Piano', date: '2026-11-23', allDay: false, startTime: '16:00', endTime: '16:45', repeat: { frequency: 'weekly' } }, opts);
    expect(toGoogleBody(e)).toEqual({
      summary: 'Piano',
      location: '',
      start: { dateTime: '2026-11-23T16:00:00', timeZone: TZ },
      end: { dateTime: '2026-11-23T16:45:00', timeZone: TZ },
      recurrence: ['RRULE:FREQ=WEEKLY'],
    });
  });

  it('writes an all-day event with its exclusive end and a place', () => {
    const e = normalizeEventDraft({ title: 'Grandma visiting', date: '2026-11-21', allDay: true, lastDate: '2026-11-22', location: 'Here' }, opts);
    expect(toGoogleBody(e)).toEqual({ summary: 'Grandma visiting', location: 'Here', start: { date: '2026-11-21' }, end: { date: '2026-11-23' } });
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
    expect(seriesTimes(timed('2026-11-21', '09:30', '11:00'), { dateTime: '2026-09-05T09:00:00-05:00', timeZone: TZ }, '2026-11-21', TZ)).toEqual({
      start: { dateTime: '2026-09-05T09:30:00', timeZone: TZ },
      end: { dateTime: '2026-09-05T11:00:00', timeZone: TZ },
    });
  });

  it('moves the whole series by the days this day moved', () => {
    expect(seriesTimes(timed('2026-11-22', '09:00', '10:30'), { dateTime: '2026-09-05T14:00:00Z' }, '2026-11-21', TZ)).toMatchObject({
      start: { dateTime: '2026-09-06T09:00:00' },
    });
  });

  it('keeps a next-day end a day after the series start', () => {
    expect(seriesTimes(timed('2026-11-27', '18:00', '10:00'), { dateTime: '2026-10-02T18:00:00-05:00' }, '2026-11-27', TZ)).toMatchObject({
      start: { dateTime: '2026-10-02T18:00:00' },
      end: { dateTime: '2026-10-03T10:00:00' },
    });
  });

  it('keeps an all-day series as long as the day was', () => {
    const e = normalizeEventDraft({ title: 'Camp', date: '2026-11-23', allDay: true, lastDate: '2026-11-24' }, opts);
    expect(seriesTimes(e, { date: '2026-01-05' }, '2026-11-23', TZ)).toEqual({ start: { date: '2026-01-05' }, end: { date: '2026-01-07' } });
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
});
