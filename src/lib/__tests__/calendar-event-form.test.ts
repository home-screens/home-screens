import { describe, expect, it } from 'vitest';
import {
  afterChangeRefusal,
  changeRequestBody,
  defaultStartMinutes,
  draftToSend,
  minutesOfTime,
  repeatEditable,
  repeatWasChanged,
  saveScope,
  timeOfMinutes,
  timesWereChanged,
  type LoadedEvent,
} from '../calendar-event-form';
import type { EventDraft } from '../calendar-write';

const TZ = 'America/Chicago';

describe('defaultStartMinutes', () => {
  // 3:10 PM on Monday November 23 in Chicago: 9:10 PM in UTC, 10:10 PM in Berlin.
  const now = new Date('2026-11-23T21:10:00Z');

  it('offers the next whole hour on the household clock, whatever zone the device keeps', () => {
    expect(defaultStartMinutes('2026-11-23', now, TZ)).toBe(16 * 60);
    expect(defaultStartMinutes('2026-11-23', now, 'Europe/Berlin')).toBe(23 * 60);
  });

  it('offers 9:00 on any other day, and knows which day is today in the household', () => {
    expect(defaultStartMinutes('2026-11-24', now, TZ)).toBe(9 * 60);
    // Already the 24th in UTC, still the 23rd at home.
    const lateEvening = new Date('2026-11-24T03:30:00Z');
    expect(defaultStartMinutes('2026-11-23', lateEvening, TZ)).toBe(22 * 60);
    expect(defaultStartMinutes('2026-11-24', lateEvening, TZ)).toBe(9 * 60);
  });

  it('answers midnight after 11 PM, for each form to hold to what it can show', () => {
    expect(defaultStartMinutes('2026-11-23', new Date('2026-11-24T05:20:00Z'), TZ)).toBe(24 * 60);
  });
});

describe('clock times', () => {
  it('turns a time into minutes and back, wrapping past the day', () => {
    expect(minutesOfTime('18:30')).toBe(1110);
    expect(timeOfMinutes(1110)).toBe('18:30');
    expect(timeOfMinutes(1500)).toBe('01:00');
    expect(timeOfMinutes(-30)).toBe('23:30');
  });
});

const timed: EventDraft = { title: 'Practice', date: '2026-11-24', allDay: false, startTime: '18:00', endTime: '19:00', location: 'Gym', repeat: { frequency: 'weekly' } };
const allDay: EventDraft = { title: 'Camp', date: '2026-11-23', allDay: true };

describe('timesWereChanged', () => {
  it('is false for a new name, place or repeat', () => {
    expect(timesWereChanged({ ...timed, title: 'Soccer practice', location: 'Field 2', repeat: null }, timed)).toBe(false);
  });

  it('is true for a new day, start, end, or all day', () => {
    expect(timesWereChanged({ ...timed, date: '2026-11-25' }, timed)).toBe(true);
    expect(timesWereChanged({ ...timed, startTime: '18:30' }, timed)).toBe(true);
    expect(timesWereChanged({ ...timed, endTime: '19:30' }, timed)).toBe(true);
    expect(timesWereChanged({ ...timed, allDay: true }, timed)).toBe(true);
  });

  it('reads an all-day event with no last day as one day, and ignores clock times left in the form', () => {
    expect(timesWereChanged({ ...allDay, lastDate: '2026-11-23', startTime: '09:00', endTime: '10:00' }, allDay)).toBe(false);
    expect(timesWereChanged({ ...allDay, lastDate: '2026-11-24' }, allDay)).toBe(true);
  });
});

describe('repeats', () => {
  const known = { repeat: { kind: 'known', rule: { frequency: 'weekly' } } } as const;

  it('counts a changed or removed repeat, and not one left as it was', () => {
    expect(repeatWasChanged({ frequency: 'weekly' }, known)).toBe(false);
    expect(repeatWasChanged({ frequency: 'daily' }, known)).toBe(true);
    expect(repeatWasChanged(null, known)).toBe(true);
    expect(repeatWasChanged(undefined, { repeat: { kind: 'none' } })).toBe(false);
  });

  it('never counts a repeat the form cannot change, or a new event', () => {
    expect(repeatEditable({ repeat: { kind: 'other' } })).toBe(false);
    expect(repeatWasChanged(null, { repeat: { kind: 'other' } })).toBe(false);
    expect(repeatWasChanged({ frequency: 'daily' }, null)).toBe(false);
    expect(repeatEditable(null)).toBe(true);
  });
});

describe('draftToSend', () => {
  it('sends only the fields the shape has', () => {
    expect(draftToSend({ ...timed, lastDate: '2026-11-24' }, { repeatEditable: true })).toEqual({
      title: 'Practice', date: '2026-11-24', allDay: false, startTime: '18:00', endTime: '19:00', location: 'Gym', repeat: { frequency: 'weekly' },
    });
    expect(draftToSend({ ...allDay, startTime: '09:00', endTime: '10:00' }, { repeatEditable: true })).toEqual({
      title: 'Camp', date: '2026-11-23', allDay: true, lastDate: '2026-11-23', location: undefined, repeat: null,
    });
  });

  it('carries the end day of an event of a day or more, and leaves out a repeat set up elsewhere', () => {
    const sent = draftToSend({ ...timed, endDate: '2026-11-26' }, { repeatEditable: false });
    expect(sent.endDate).toBe('2026-11-26');
    expect(sent).not.toHaveProperty('repeat');
  });
});

describe('saveScope', () => {
  it('asks which days for one day of a repeating event', () => {
    expect(saveScope({ seriesId: 'soccer' }, false)).toBe('ask');
  });

  it('means every time when the repeat itself changed, and the one event otherwise', () => {
    expect(saveScope({ seriesId: 'soccer' }, true)).toBe('series');
    expect(saveScope({}, false)).toBe('instance');
    expect(saveScope({}, true)).toBe('instance');
    expect(saveScope(null, false)).toBe('instance');
  });
});

describe('changeRequestBody', () => {
  const loaded: LoadedEvent = { etag: '"i1"', seriesId: 'practice', seriesEtag: '"s1"', draft: timed, repeat: { kind: 'known', rule: { frequency: 'weekly' } } };

  it('sends a rename with the times marked as untouched', () => {
    const draft = { ...timed, title: 'Soccer practice' };
    expect(changeRequestBody(loaded, { draft, scope: 'instance', repeatChanged: false })).toEqual({
      draft,
      etag: '"i1"',
      scope: 'instance',
      seriesId: 'practice',
      dayWas: '2026-11-24',
      timeWas: { allDay: false, startTime: '18:00', endTime: '19:00' },
      repeatChanged: false,
      timesChanged: false,
    });
  });

  it('sends the series version for every time, and says when the times changed', () => {
    const body = changeRequestBody(loaded, { draft: { ...timed, startTime: '18:30', endTime: '19:30' }, scope: 'series', repeatChanged: false });
    expect(body).toMatchObject({ etag: '"s1"', scope: 'series', timesChanged: true, dayWas: '2026-11-24', timeWas: { startTime: '18:00', endTime: '19:00' } });
  });

  it('names the iCloud object, and the day as it was for an all-day event', () => {
    const icloud: LoadedEvent = { etag: '"o1"', sourceRef: 'https://p52-caldav.icloud.com/1/calendars/home/x.ics', draft: { ...allDay, lastDate: '2026-11-24' }, repeat: { kind: 'none' } };
    expect(changeRequestBody(icloud, { draft: { ...allDay, lastDate: '2026-11-25' }, scope: 'instance', repeatChanged: false })).toMatchObject({
      sourceRef: 'https://p52-caldav.icloud.com/1/calendars/home/x.ics',
      timeWas: { allDay: true, lastDate: '2026-11-24' },
      timesChanged: true,
    });
  });

  it('sends no times to measure from for an event of a day or more', () => {
    const long: LoadedEvent = { etag: '"t1"', draft: { ...timed, date: '2026-11-27', endTime: '16:00', endDate: '2026-11-29' }, repeat: { kind: 'none' } };
    const body = changeRequestBody(long, { draft: { ...long.draft, title: 'Cabin trip' }, scope: 'instance', repeatChanged: false });
    expect(body).not.toHaveProperty('timeWas');
    expect(body.timesChanged).toBe(false);
  });
});

describe('afterChangeRefusal', () => {
  it('reloads on a change made elsewhere, closes on an event that is gone, and stays for the rest', () => {
    expect(afterChangeRefusal('calendarWrite.changedElsewhere')).toBe('reload');
    expect(afterChangeRefusal('calendarWrite.gone')).toBe('close');
    expect(afterChangeRefusal('calendarWrite.unreachable')).toBe('stay');
    expect(afterChangeRefusal('calendarWrite.notAllowed')).toBe('stay');
    expect(afterChangeRefusal(undefined)).toBe('stay');
  });
});
