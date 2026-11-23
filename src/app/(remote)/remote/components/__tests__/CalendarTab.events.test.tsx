// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import type { CalendarEvent } from '@/types/config';
import type { CalendarEntryInfo } from '@/lib/calendar-event-writes';

const TZ = 'America/Chicago';
const CAL = 'family@group.calendar.google.com';
const entry: CalendarEntryInfo = {
  enabled: true,
  google: 'ready',
  googleIfOn: 'ready',
  calendars: [{ id: CAL, name: 'Family', color: '#10b981', source: 'google' }],
  defaultCalendarId: CAL,
  defaultMinutes: 60,
  timezone: TZ,
  wallDefault: true,
};

let events: CalendarEvent[] = [];
const write = vi.fn();
const reload = vi.fn(async () => {});
vi.mock('../../hooks/useCalendarTab', () => ({ useCalendarTab: () => ({ entry, events, reload, write }) }));
vi.mock('../../household-clock', () => ({
  useHouseholdToday: () => '2026-11-21',
  useHouseholdTimezone: () => 'America/Chicago',
  useHouseholdClockFormat: () => '12h',
}));
// The page of days is its own component; here it only has to draw one day's event rows.
vi.mock('../DayNotesPage', () => ({
  default: ({ events: e }: { events: { rows: (date: string) => ReactNode } }) => <div>{e.rows(shownDay)}</div>,
}));
let shownDay = '2026-11-27';

import CalendarTab from '../CalendarTab';

function render(children: ReactNode) {
  return renderUI(children, {
    wrapper: ({ children }) => <I18nProvider locale="en-US" blob={{ core, modules, remote }}>{children}</I18nProvider>,
  });
}

const row = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: `${CAL}:ev`, title: 'Event', start: '2026-11-28T00:00:00.000Z', end: '2026-11-28T01:00:00.000Z', allDay: false,
  sourceId: CAL, sourceName: 'Family', calendarColor: '#10b981', canEdit: true, ...over,
});

/** A write the test finishes by hand, so a second press can land while the first is still out. */
function pendingWrite() {
  let finish: (value: unknown) => void = () => {};
  const promise = new Promise((resolve) => { finish = resolve; });
  return { promise, finish: (value: unknown) => finish(value) };
}

async function openEvent() {
  await act(async () => { fireEvent.click(screen.getByTestId('calendar-event')); });
}

const sent = (method: string) => write.mock.calls.filter((call) => call[1] === method);

beforeEach(() => {
  write.mockReset();
  reload.mockClear();
  try { localStorage.clear(); } catch { /* no storage in this run */ }
});

afterEach(cleanup);

describe('CalendarTab: switching All day', () => {
  const party = (lastDate: string) => ({
    calendarId: CAL, eventId: 'party', etag: '"p1"',
    draft: { title: 'Party', allDay: true, date: '2026-11-27', lastDate },
    repeat: { kind: 'none' },
  });

  beforeEach(() => {
    shownDay = '2026-11-27';
    events = [row({ id: `${CAL}:party`, title: 'Party', allDay: true, start: '2026-11-27', end: '2026-11-28' })];
  });

  it('gives an all-day event a start and the usual length when it is made timed, so it can be saved', async () => {
    write.mockResolvedValue({ ok: true, json: party('2026-11-27') });
    render(<CalendarTab />);
    await openEvent();
    fireEvent.click(screen.getByTestId('event-form-all-day'));
    expect((screen.getByTestId('event-form-start') as HTMLInputElement).value).toMatch(/^\d{2}:00$/);
    expect((screen.getByTestId('event-form-end') as HTMLInputElement).value).toMatch(/^\d{2}:\d{2}$/);
    expect((screen.getByTestId('event-form-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps an all-day event across days all day, where switching would make it one day long', async () => {
    write.mockResolvedValue({ ok: true, json: party('2026-11-28') });
    render(<CalendarTab />);
    await openEvent();
    const allDay = () => screen.getByTestId('event-form-all-day').querySelector('button, input') ?? screen.getByTestId('event-form-all-day');
    expect(allDay().hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(remote.calendarTab.form.allDayLocked)).toBeTruthy();
    // Shortened to its first day, switching loses nothing.
    const lastDay = screen.getByTestId('event-form-last-day') as HTMLInputElement;
    fireEvent.change(lastDay, { target: { value: lastDay.min } });
    expect(allDay().hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(remote.calendarTab.form.allDayLocked)).toBeNull();
  });
});

describe('CalendarTab: an event of a day or more', () => {
  // Friday 6 PM to Sunday 4 PM.
  const weekend = {
    calendarId: CAL, eventId: 'trip', etag: '"t1"',
    draft: { title: 'Cabin trp', allDay: false, date: '2026-11-27', startTime: '18:00', endTime: '16:00', endDate: '2026-11-29' },
    repeat: { kind: 'none' },
  };

  beforeEach(() => {
    shownDay = '2026-11-27';
    events = [row({ id: `${CAL}:trip`, title: 'Cabin trp', end: '2026-11-29T22:00:00.000Z' })];
  });

  it('shows its real start and end and no fields that could change them', async () => {
    write.mockResolvedValue({ ok: true, json: weekend });
    render(<CalendarTab />);
    await openEvent();
    const locked = screen.getByTestId('event-form-locked-times');
    expect(locked.textContent).toContain('Friday, November 27');
    expect(locked.textContent).toContain('6:00 PM');
    expect(locked.textContent).toContain('Sunday, November 29');
    expect(locked.textContent).toContain('4:00 PM');
    expect(locked.textContent).toContain(core.calendarChange.longNote);
    for (const id of ['event-form-date', 'event-form-all-day', 'event-form-start', 'event-form-end']) expect(screen.queryByTestId(id)).toBeNull();
    // Remove still works for it.
    expect(screen.getByTestId('event-form-remove')).toBeTruthy();
  });

  it('saves a new name with the times marked untouched', async () => {
    write.mockImplementation(async (_url: string, method: string) => (method === 'GET' ? { ok: true, json: weekend } : { ok: true, json: { ok: true } }));
    render(<CalendarTab />);
    await openEvent();
    fireEvent.change(screen.getByTestId('event-form-title'), { target: { value: 'Cabin trip' } });
    const save = screen.getByTestId('event-form-save') as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    await act(async () => { fireEvent.click(save); });
    expect(sent('PATCH')).toHaveLength(1);
    expect(sent('PATCH')[0][2]).toMatchObject({
      timesChanged: false,
      scope: 'instance',
      etag: '"t1"',
      draft: { title: 'Cabin trip', date: '2026-11-27', startTime: '18:00', endTime: '16:00', endDate: '2026-11-29' },
    });
    expect(screen.queryByTestId('event-form')).toBeNull();
  });
});

describe('CalendarTab: one write at a time', () => {
  const soccer = {
    calendarId: CAL, eventId: 'soccer_20261121', etag: '"i1"', seriesId: 'soccer', seriesEtag: '"s1"',
    draft: { title: 'Soccer', allDay: false, date: '2026-11-21', startTime: '09:00', endTime: '10:00', repeat: { frequency: 'weekly' } },
    repeat: { kind: 'known', rule: { frequency: 'weekly' } },
  };
  const dentist = {
    calendarId: CAL, eventId: 'dentist', etag: '"d1"',
    draft: { title: 'Dentist', allDay: false, date: '2026-11-21', startTime: '15:00', endTime: '16:00' },
    repeat: { kind: 'none' },
  };

  beforeEach(() => {
    shownDay = '2026-11-21';
  });

  it('sends one change when "Just this day" is pressed twice, and holds the answers while it is out', async () => {
    events = [row({ id: `${CAL}:soccer_20261121`, title: 'Soccer', start: '2026-11-21T15:00:00.000Z', end: '2026-11-21T16:00:00.000Z', repeats: true })];
    const out = pendingWrite();
    write.mockImplementation((_url: string, method: string) => (method === 'GET' ? Promise.resolve({ ok: true, json: soccer }) : out.promise));
    render(<CalendarTab />);
    await openEvent();
    fireEvent.change(screen.getByTestId('event-form-title'), { target: { value: 'Soccer (away)' } });
    fireEvent.click(screen.getByTestId('event-form-save'));
    const choice = () => screen.getByTestId('event-save-choice').querySelector('[data-choice="instance"]') as HTMLButtonElement;
    // Two presses before anything has drawn: the second finds a write already out.
    await act(async () => {
      fireEvent.click(choice());
      fireEvent.click(choice());
    });
    expect(sent('PATCH')).toHaveLength(1);
    expect(choice().disabled).toBe(true);
    expect((screen.getByTestId('event-save-choice').querySelector('[data-choice="series"]') as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { out.finish({ ok: true, json: { ok: true } }); });
    expect(screen.queryByTestId('event-save-choice')).toBeNull();
    expect(screen.queryByTestId('event-form')).toBeNull();
    expect(sent('PATCH')).toHaveLength(1);
  });

  it('sends one remove when the answer is pressed twice', async () => {
    events = [row({ id: `${CAL}:dentist`, title: 'Dentist', start: '2026-11-21T21:00:00.000Z', end: '2026-11-21T22:00:00.000Z' })];
    const out = pendingWrite();
    write.mockImplementation((_url: string, method: string) => (method === 'GET' ? Promise.resolve({ ok: true, json: dentist }) : out.promise));
    render(<CalendarTab />);
    await openEvent();
    fireEvent.click(screen.getByTestId('event-form-remove'));
    const confirm = () => screen.getByTestId('confirm-sheet').querySelector('button') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(confirm());
      fireEvent.click(confirm());
    });
    expect(sent('DELETE')).toHaveLength(1);
    expect(confirm().disabled).toBe(true);
    await act(async () => { out.finish({ ok: true, json: { ok: true } }); });
    expect(screen.queryByTestId('confirm-sheet')).toBeNull();
  });

  it('sends one new event when Add is pressed twice', async () => {
    events = [];
    const out = pendingWrite();
    write.mockImplementation(() => out.promise);
    render(<CalendarTab openAdd={{ date: '2026-11-24' }} />);
    fireEvent.change(screen.getByTestId('event-form-title'), { target: { value: 'Piano' } });
    const save = screen.getByTestId('event-form-save');
    await act(async () => {
      fireEvent.click(save);
      fireEvent.click(save);
    });
    expect(sent('POST')).toHaveLength(1);
    // Any day but today starts at 9, whatever the phone's own clock says.
    expect(sent('POST')[0][2]).toMatchObject({ calendarId: CAL, draft: { title: 'Piano', date: '2026-11-24', startTime: '09:00', endTime: '10:00' } });
    await act(async () => { out.finish({ ok: true, json: { id: `${CAL}:new1` } }); });
  });
});
