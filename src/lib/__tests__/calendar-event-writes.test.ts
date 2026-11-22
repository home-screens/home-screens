import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { ScreenConfiguration } from '@/types/config';

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

  it('refuses a new repeat for just one day', async () => {
    expect((await refusal(changeEvent(request(), id, { draft, etag: '"e1"', scope: 'instance', dayWas: '2026-11-21', repeatChanged: true }))).code).toBe(
      'calendarWrite.repeatNeedsEveryTime',
    );
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
