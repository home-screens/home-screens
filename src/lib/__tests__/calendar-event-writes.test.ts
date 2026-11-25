import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { ScreenConfiguration } from '@/types/config';
import type { LoadedEvent } from '@/lib/calendar-event-form';

let config: ScreenConfiguration;
vi.mock('@/lib/config', () => ({ readConfig: vi.fn(async () => config) }));
vi.mock('@/lib/household-day', () => ({ householdTimezone: vi.fn(async () => 'America/Chicago') }));

let signedIn = true;
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {
    if (!signedIn) throw new Response('no', { status: 401 });
  }),
}));

let entryState = 'ready';
vi.mock('@/lib/google-auth', () => ({ getGoogleEntryState: vi.fn(async () => entryState) }));

const createGoogleEvent = vi.fn(async (calendarId: string) => ({ id: `${calendarId}:new1` }));
const updateGoogleEvent = vi.fn(async () => {});
const deleteGoogleEvent = vi.fn(async () => {});
vi.mock('@/lib/google-calendar-write', () => ({ createGoogleEvent, updateGoogleEvent, deleteGoogleEvent, getGoogleEventForEdit: vi.fn() }));

const googleCalendarLabels = vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { name: id.split('@')[0], color: '#4073ff', writable: true }])));
vi.mock('@/lib/google-calendar', () => ({ googleCalendarLabels }));

const bump = vi.fn();
vi.mock('@/lib/calendar-revision', () => ({ bumpCalendarRevision: () => bump() }));

const { addEvent, changeEvent, removeEvent, clearWriteLimits, calendarEntryInfo } = await import('../calendar-event-writes');
const { CalendarWriteError } = await import('../calendar-write');
const { saveScope, changeRequestBody } = await import('../calendar-event-form');

const draft = { title: 'Playdate with Sam', date: '2026-11-23', allDay: false, startTime: '15:30', endTime: '17:00' };
const request = () => new NextRequest('http://hub.local/api/calendar/events', { method: 'POST' });

function baseConfig(): ScreenConfiguration {
  return {
    settings: {
      calendar: {
        googleCalendarIds: ['family@group.calendar.google.com', 'primary'],
        icalSources: [],
        daysAhead: 7,
        eventEntry: { enabled: true, calendarIds: ['family@group.calendar.google.com'] },
      },
    },
  } as unknown as ScreenConfiguration;
}

async function refusal(promise: Promise<unknown>): Promise<{ code: string; status: number }> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(CalendarWriteError);
    return { code: (e as InstanceType<typeof CalendarWriteError>).code, status: (e as InstanceType<typeof CalendarWriteError>).status };
  }
  throw new Error('expected a refusal');
}

beforeEach(() => {
  config = baseConfig();
  signedIn = true;
  entryState = 'ready';
  createGoogleEvent.mockClear();
  updateGoogleEvent.mockClear();
  deleteGoogleEvent.mockClear();
  bump.mockClear();
  clearWriteLimits();
});

describe('adding', () => {
  it('adds to a ticked Google calendar on the household clock and tells the walls', async () => {
    expect(await addEvent(request(), { calendarId: 'family@group.calendar.google.com', draft })).toEqual({
      id: 'family@group.calendar.google.com:new1',
    });
    expect(createGoogleEvent).toHaveBeenCalledWith('family@group.calendar.google.com', expect.objectContaining({
      title: 'Playdate with Sam',
      startLocal: '2026-11-23T15:30:00',
      timeZone: 'America/Chicago',
    }));
    expect(bump).toHaveBeenCalledOnce();
  });

  it('refuses while adding is off', async () => {
    config.settings.calendar.eventEntry = { enabled: false, calendarIds: ['family@group.calendar.google.com'] };
    expect(await refusal(addEvent(request(), { calendarId: 'family@group.calendar.google.com', draft }))).toEqual({ code: 'calendarWrite.notOffered', status: 403 });
    expect(createGoogleEvent).not.toHaveBeenCalled();
  });

  it('refuses a calendar not ticked for adding, or ticked but no longer shown', async () => {
    expect((await refusal(addEvent(request(), { calendarId: 'primary', draft }))).code).toBe('calendarWrite.calendarNotTicked');
    config.settings.calendar.googleCalendarIds = ['primary'];
    expect((await refusal(addEvent(request(), { calendarId: 'family@group.calendar.google.com', draft }))).code).toBe('calendarWrite.calendarNotTicked');
  });

  it('refuses while Google cannot write yet', async () => {
    entryState = 'scopeMissing';
    expect((await refusal(addEvent(request(), { calendarId: 'family@group.calendar.google.com', draft }))).code).toBe('calendarWrite.notOffered');
  });

  it('checks the draft before writing', async () => {
    expect((await refusal(addEvent(request(), { calendarId: 'family@group.calendar.google.com', draft: { ...draft, title: ' ' } }))).code).toBe(
      'calendarWrite.titleRequired',
    );
    expect(createGoogleEvent).not.toHaveBeenCalled();
  });

  it('lets a wall add while the walls may, and refuses once every wall is off', async () => {
    signedIn = false;
    await addEvent(request(), { calendarId: 'family@group.calendar.google.com', draft });
    config.settings.calendarWallEntry = false;
    expect((await refusal(addEvent(request(), { calendarId: 'family@group.calendar.google.com', draft }))).code).toBe('calendarWrite.notOffered');
    // One display turned back on for itself is enough for the hub; that wall checks its own switch.
    config.displays = [{ id: 'kitchen', name: 'Kitchen', screens: [], settings: { calendarWallEntry: true } }] as never;
    await addEvent(request(), { calendarId: 'family@group.calendar.google.com', draft });
    // The household on, and every display off for itself: nothing holding the display token may write.
    config.settings.calendarWallEntry = true;
    config.displays = [
      { id: 'kitchen', name: 'Kitchen', screens: [], settings: { calendarWallEntry: false } },
      { id: 'hall', name: 'Hall', screens: [], settings: { calendarWallEntry: false } },
    ] as never;
    expect((await refusal(addEvent(request(), { calendarId: 'family@group.calendar.google.com', draft }))).code).toBe('calendarWrite.notOffered');
    // A phone is never held to the walls' switch.
    signedIn = true;
    config.displays = [];
    await addEvent(request(), { calendarId: 'family@group.calendar.google.com', draft });
    expect(createGoogleEvent).toHaveBeenCalledTimes(3);
  });

  it('caps writes per minute', async () => {
    for (let i = 0; i < 20; i++) await addEvent(request(), { calendarId: 'family@group.calendar.google.com', draft });
    expect(await refusal(addEvent(request(), { calendarId: 'family@group.calendar.google.com', draft }))).toMatchObject({ status: 429 });
  });
});

describe('changing and removing', () => {
  const id = 'family@group.calendar.google.com:soccer_20261121T150000Z';

  it('changes one day, sending the version the form loaded', async () => {
    await changeEvent(request(), id, { draft, etag: '"e1"', scope: 'instance', seriesId: 'soccer', dayWas: '2026-11-21', repeatChanged: false });
    expect(updateGoogleEvent).toHaveBeenCalledWith(expect.objectContaining({
      calendarId: 'family@group.calendar.google.com',
      eventId: 'soccer_20261121T150000Z',
      etag: '"e1"',
      scope: 'instance',
      seriesId: 'soccer',
    }));
    expect(bump).toHaveBeenCalledOnce();
  });

  it('tells the writer whether the times changed, and to check a wall is not aiming at a series', async () => {
    const body = { draft, etag: '"e1"', scope: 'instance', seriesId: 'soccer', dayWas: '2026-11-21', repeatChanged: false };
    await changeEvent(request(), id, { ...body, timesChanged: false, timeWas: { allDay: false, startTime: '15:00', endTime: '16:00' } });
    expect(updateGoogleEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      timesChanged: false,
      refuseSeriesId: false,
      dayWas: '2026-11-21',
      timeWas: { allDay: false, startMinute: 900, minutes: 60 },
    }));
    // Left unsaid, the times count as changed; and a wall is checked.
    signedIn = false;
    await changeEvent(request(), id, body);
    expect(updateGoogleEvent).toHaveBeenLastCalledWith(expect.objectContaining({ timesChanged: true, refuseSeriesId: true }));
  });

  it('renames an event of a day or more, and refuses new times for it', async () => {
    const weekend = { title: 'Cabin trip', date: '2026-11-27', allDay: false, startTime: '18:00', endTime: '18:00', endDate: '2026-11-29' };
    const body = { draft: weekend, etag: '"e1"', scope: 'instance', dayWas: '2026-11-27', repeatChanged: false };
    await changeEvent(request(), id, { ...body, timesChanged: false });
    expect(updateGoogleEvent).toHaveBeenCalledOnce();
    expect(await refusal(changeEvent(request(), id, { ...body, timesChanged: true }))).toEqual({ code: 'calendarWrite.notEditable', status: 403 });
    expect(await refusal(changeEvent(request(), id, body))).toEqual({ code: 'calendarWrite.notEditable', status: 403 });
    expect(updateGoogleEvent).toHaveBeenCalledOnce();
  });

  it('refuses a day the form could not have opened on', async () => {
    const body = { draft, etag: '"e1"', scope: 'series', seriesId: 'soccer', repeatChanged: false };
    expect((await refusal(changeEvent(request(), id, { ...body, dayWas: '1990-01-01' }))).code).toBe('calendarWrite.dayTooFar');
    expect((await refusal(changeEvent(request(), id, { ...body, dayWas: 'not-a-date' }))).code).toBe('calendarWrite.badDate');
    expect((await refusal(changeEvent(request(), id, body))).code).toBe('calendarWrite.badDate');
    expect(updateGoogleEvent).not.toHaveBeenCalled();
  });

  it('refuses a new repeat for just one day of a series', async () => {
    const body = { draft, etag: '"e1"', scope: 'instance', seriesId: 'soccer', dayWas: '2026-11-21', repeatChanged: true };
    expect((await refusal(changeEvent(request(), id, body))).code).toBe('calendarWrite.repeatNeedsEveryTime');
    expect(updateGoogleEvent).not.toHaveBeenCalled();
  });

  it('gives a one-off a repeat, with the body the forms send', async () => {
    // The forms' own rules decide the scope and the body, so the two sides are tested together.
    const loaded: LoadedEvent = { etag: '"e7"', draft, repeat: { kind: 'none' } };
    const changed = { ...draft, repeat: { frequency: 'weekly' as const } };
    const scope = saveScope(loaded, true);
    if (scope === 'ask') throw new Error('a one-off has no days to ask about');
    expect(scope).toBe('instance');
    await changeEvent(request(), 'family@group.calendar.google.com:pizza1', changeRequestBody(loaded, { draft: changed, scope, repeatChanged: true }));
    expect(updateGoogleEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'pizza1',
      scope: 'instance',
      seriesId: undefined,
      repeatChanged: true,
      event: expect.objectContaining({ repeat: { frequency: 'weekly' } }),
    }));
  });

  it('refuses an event on a calendar that does not take changes', async () => {
    expect((await refusal(removeEvent(request(), 'primary:x1', { scope: 'instance' }))).code).toBe('calendarWrite.notEditable');
    expect(deleteGoogleEvent).not.toHaveBeenCalled();
  });

  it('removes every time through the series', async () => {
    await removeEvent(request(), id, { scope: 'series', seriesId: 'soccer' });
    expect(deleteGoogleEvent).toHaveBeenCalledWith({
      calendarId: 'family@group.calendar.google.com',
      eventId: 'soccer_20261121T150000Z',
      scope: 'series',
      seriesId: 'soccer',
    });
  });
});

describe('what the forms offer', () => {
  it('still answers when Google cannot be asked for its calendar names', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calendar = config.settings.calendar;
    calendar.icloudSources = [{ id: 'ic-home', accountId: 'acct', kind: 'calendar', url: 'https://caldav.example.com/home/', name: 'Home', color: '#ef4444', enabled: true }];
    calendar.eventEntry = { enabled: true, calendarIds: ['family@group.calendar.google.com', 'ic-home'], defaultMinutes: 90 };
    googleCalendarLabels.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND www.googleapis.com'));

    const info = await calendarEntryInfo();
    warn.mockRestore();
    expect(info).toMatchObject({
      enabled: true,
      google: 'ready',
      defaultMinutes: 90,
      timezone: 'America/Chicago',
      calendars: [{ id: 'ic-home', name: 'Home', color: '#ef4444', source: 'icloud' }],
      defaultCalendarId: 'ic-home',
    });
  });

  it('says Google could not be asked when no calendar of it is known, not that none is picked', async () => {
    // A hub restarted while Google is out of reach: no last good read to answer from.
    googleCalendarLabels.mockResolvedValueOnce(new Map());
    const info = await calendarEntryInfo();
    expect(info).toMatchObject({ calendars: [], googleUnreachable: true });
  });

  it('offers the Google calendars it is given from the last good read', async () => {
    // What `googleCalendarLabels` answers during an outage: only the calendars it has seen before.
    googleCalendarLabels.mockResolvedValueOnce(new Map([['family@group.calendar.google.com', { name: 'Family', color: '#4073ff', writable: true }]]));
    expect((await calendarEntryInfo()).calendars).toEqual([{ id: 'family@group.calendar.google.com', name: 'Family', color: '#4073ff', source: 'google' }]);
  });

  it('says why shown calendars are missing from the choice: a calendar link, and a Google calendar that can only be read', async () => {
    const calendar = config.settings.calendar;
    calendar.icalSources = [{ id: 'ical-school', type: 'ical', name: 'School', url: 'https://example.com/school.ics', color: '#f97316', enabled: true }];
    googleCalendarLabels.mockImplementationOnce(async (ids: string[]) => new Map(ids.map((id) => [id, { name: id, color: '#4073ff', writable: id !== 'primary' }])));
    const info = await calendarEntryInfo();
    // Asked about every shown Google calendar, not only the one ticked for adding.
    expect(googleCalendarLabels).toHaveBeenLastCalledWith(['family@group.calendar.google.com', 'primary']);
    expect(info).toMatchObject({ calendars: [{ id: 'family@group.calendar.google.com' }], readOnlyShown: 'both' });
    expect(info.googleUnreachable).toBeUndefined();
  });

  it('says nothing is missing for that reason when every shown calendar can take events', async () => {
    const info = await calendarEntryInfo();
    expect(info.calendars).toHaveLength(1);
    expect(info.readOnlyShown).toBeUndefined();
  });

  it('counts no Google calendar while Google cannot be asked about it, only the calendar links', async () => {
    config.settings.calendar.icalSources = [{ id: 'ical-school', type: 'ical', name: 'School', url: 'https://example.com/school.ics', color: '#f97316', enabled: true }];
    // The last good read knows the ticked calendar, and nothing about the other.
    googleCalendarLabels.mockResolvedValueOnce(new Map([['family@group.calendar.google.com', { name: 'Family', color: '#4073ff', writable: true }]]));
    expect((await calendarEntryInfo()).readOnlyShown).toBe('links');
  });

  it('counts every Google calendar while Home Screens\' own app may not add to them', async () => {
    entryState = 'notOffered';
    const calendar = config.settings.calendar;
    calendar.icloudSources = [{ id: 'ic-home', accountId: 'acct', kind: 'calendar', url: 'https://caldav.example.com/home/', name: 'Home', color: '#ef4444', enabled: true }];
    calendar.eventEntry = { enabled: true, calendarIds: ['ic-home'] };
    const info = await calendarEntryInfo();
    expect(info).toMatchObject({ google: 'notOffered', calendars: [{ id: 'ic-home' }], readOnlyShown: 'readOnly' });
  });

  it('counts no Google calendar while its sign-in still needs the extra step a grown-up can take', async () => {
    entryState = 'needsSignIn';
    const calendar = config.settings.calendar;
    calendar.icloudSources = [{ id: 'ic-home', accountId: 'acct', kind: 'calendar', url: 'https://caldav.example.com/home/', name: 'Home', color: '#ef4444', enabled: true }];
    calendar.eventEntry = { enabled: true, calendarIds: ['family@group.calendar.google.com', 'ic-home'] };
    const info = await calendarEntryInfo();
    expect(info).toMatchObject({ google: 'needsSignIn', calendars: [{ id: 'ic-home' }] });
    expect(info.readOnlyShown).toBeUndefined();
  });

  it('says where Google would stand with adding on, while the saved switch is still off', async () => {
    config.settings.calendar.eventEntry = { enabled: false, calendarIds: [] };
    entryState = 'needsSignIn';
    const info = await calendarEntryInfo();
    expect(info).toMatchObject({ enabled: false, google: 'off', googleIfOn: 'needsSignIn', calendars: [] });
  });

  it('names and colours each calendar as the household set it, the way the wall draws its events', async () => {
    const calendar = config.settings.calendar;
    calendar.icloudSources = [{ id: 'ic-home', accountId: 'acct', kind: 'calendar', url: 'https://caldav.example.com/home/', name: 'Home', color: '#ef4444', enabled: true }];
    calendar.eventEntry = { enabled: true, calendarIds: ['family@group.calendar.google.com', 'ic-home'] };
    calendar.calendarOverrides = {
      'family@group.calendar.google.com': { name: 'Smith family', color: '#10b981' },
      'ic-home': { name: 'Our house' },
    };

    const info = await calendarEntryInfo();
    expect(info.calendars).toEqual([
      { id: 'family@group.calendar.google.com', name: 'Smith family', color: '#10b981', source: 'google' },
      // Only what the form draws: never the calendar's address or account.
      { id: 'ic-home', name: 'Our house', color: '#ef4444', source: 'icloud' },
    ]);
  });
});
