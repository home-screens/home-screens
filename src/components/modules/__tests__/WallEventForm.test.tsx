// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { CalendarEvent } from '@/types/config';
import type { CalendarEntryInfo } from '@/lib/calendar-event-writes';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import enUSCore from '@/translations/en-US/core.json';
import { getThemeTokens } from '@/lib/fullscreen-themes';

const displayFetch = vi.fn();
vi.mock('@/lib/display-fetch', () => ({ displayFetch: (...args: unknown[]) => displayFetch(...args) }));
const refreshWhere = vi.fn();
vi.mock('@/lib/display-cache', () => ({ displayCache: { refreshWhere: (...args: unknown[]) => refreshWhere(...args) } }));
vi.mock('@/hooks/useDisplayId', () => ({ useDisplayId: () => 'main' }));

import { WallEventForm } from '../shared/WallEventForm';
import { WALL_KEYBOARD_IDLE_MS } from '../shared/WallKeyboard';

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ modules: enUSModules, core: enUSCore }}>
      {children}
    </I18nProvider>
  );
}

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
const event: CalendarEvent = {
  id: `${CAL}:trip`,
  title: 'Cabin trip',
  start: '2026-11-28T00:00:00.000Z',
  end: '2026-11-29T22:00:00.000Z',
  allDay: false,
  sourceId: CAL,
  sourceName: 'Family',
  calendarColor: '#10b981',
};
/** Friday 6 PM to Sunday 4 PM, as the hub answers it for Change. */
const weekend = {
  etag: '"t1"',
  draft: { title: 'Cabin trip', allDay: false, date: '2026-11-27', startTime: '18:00', endTime: '16:00', endDate: '2026-11-29' },
  repeat: { kind: 'none' },
};
const dentist = {
  etag: '"d1"',
  draft: { title: 'Dentist', allDay: false, date: '2026-11-24', startTime: '15:00', endTime: '16:00' },
  repeat: { kind: 'none' },
};

const answer = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function renderForm(props: { onDone?: () => void; onClose?: () => void } = {}) {
  const onDone = props.onDone ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  render(
    <Wrapper>
      <WallEventForm mode="change" date="2026-11-27" event={event} entry={entry} theme={getThemeTokens('linen')} accent="#10b981" timeFormat="12h" onDone={onDone} onClose={onClose} />
    </Wrapper>,
  );
  return { onDone, onClose };
}

/** The form draws its grids at once and fills in when the hub answers; wait for the event itself. */
const loaded = (title: string) => waitFor(() => expect(screen.getByTestId('wall-event-title').textContent).toContain(title));

const patches = () => displayFetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');

beforeEach(() => {
  displayFetch.mockReset();
  refreshWhere.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WallEventForm: an event of a day or more', () => {
  it('shows its real start and end, and offers nothing that would change them', async () => {
    displayFetch.mockResolvedValue(answer(200, weekend));
    renderForm();
    const locked = await screen.findByTestId('wall-event-locked-times');
    expect(locked.textContent).toContain('Friday, November 27');
    expect(locked.textContent).toContain('6:00 PM');
    expect(locked.textContent).toContain('Sunday, November 29');
    expect(locked.textContent).toContain('4:00 PM');
    expect(locked.textContent).toContain(enUSCore.calendarChange.longNote);
    expect(document.querySelector('[data-hour]')).toBeNull();
    expect(screen.queryByTestId('wall-event-length')).toBeNull();
    expect((screen.getByTestId('wall-event-all-day') as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves with its times marked untouched and its end day carried along', async () => {
    displayFetch.mockImplementation(async (_url: string, init?: RequestInit) => (init?.method === 'PATCH' ? answer(200, { ok: true }) : answer(200, weekend)));
    const { onDone } = renderForm();
    await screen.findByTestId('wall-event-locked-times');
    const save = screen.getByTestId('wall-event-save') as HTMLButtonElement;
    // Friday 6 PM to Sunday 4 PM is nothing the form could make, and it is still no problem to save.
    expect(save.disabled).toBe(false);
    expect(screen.queryByTestId('wall-event-problem')).toBeNull();
    await act(async () => { fireEvent.click(save); });
    expect(patches()).toHaveLength(1);
    const body = JSON.parse(String((patches()[0][1] as RequestInit).body));
    expect(body).toMatchObject({
      timesChanged: false,
      scope: 'instance',
      etag: '"t1"',
      dayWas: '2026-11-27',
      draft: { title: 'Cabin trip', date: '2026-11-27', startTime: '18:00', endTime: '16:00', endDate: '2026-11-29' },
    });
    expect(body).not.toHaveProperty('timeWas');
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('says the times changed once a shorter event is moved', async () => {
    displayFetch.mockImplementation(async (_url: string, init?: RequestInit) => (init?.method === 'PATCH' ? answer(200, { ok: true }) : answer(200, dentist)));
    renderForm();
    await loaded('Dentist');
    fireEvent.click(document.querySelector('[data-hour="16"]')!);
    await act(async () => { fireEvent.click(screen.getByTestId('wall-event-save')); });
    expect(JSON.parse(String((patches()[0][1] as RequestInit).body))).toMatchObject({
      timesChanged: true,
      timeWas: { allDay: false, startTime: '15:00', endTime: '16:00' },
      draft: { startTime: '16:00', endTime: '17:00' },
    });
  });
});

describe('WallEventForm: a change the hub turns down', () => {
  it('stops at "already removed" with one way out, where "Try again" could only fail', async () => {
    displayFetch.mockImplementation(async (_url: string, init?: RequestInit) =>
      (init?.method === 'PATCH' ? answer(404, { code: 'calendarWrite.gone', error: 'That event was already removed.' }) : answer(200, dentist)));
    const { onDone, onClose } = renderForm();
    await loaded('Dentist');
    await act(async () => { fireEvent.click(screen.getByTestId('wall-event-save')); });

    expect(screen.getByTestId('wall-event-gone').textContent).toContain(enUSCore.refusals.calendarWrite.gone);
    expect(screen.queryByTestId('wall-event-save')).toBeNull();
    // The calendar behind the sheet is read again at once, so the event leaves it.
    expect(refreshWhere).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('wall-event-gone-done'));
    expect(onDone).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the form and its words for any other refusal', async () => {
    displayFetch.mockImplementation(async (_url: string, init?: RequestInit) =>
      (init?.method === 'PATCH' ? answer(403, { code: 'calendarWrite.notAllowed' }) : answer(200, dentist)));
    renderForm();
    await loaded('Dentist');
    await act(async () => { fireEvent.click(screen.getByTestId('wall-event-save')); });
    expect(screen.getByTestId('wall-event-notice').textContent).toContain(enUSCore.refusals.calendarWrite.notAllowed);
    expect(screen.getByTestId('wall-event-save').textContent).toBe(enUSModules.calendar.eventForm.tryAgain);
  });
});

describe('WallEventForm: closing itself', () => {
  it('waits while a save is out (the grown-up pad may be up), and closes when left alone', async () => {
    let finish: (value: unknown) => void = () => {};
    displayFetch.mockImplementation((_url: string, init?: RequestInit) =>
      (init?.method === 'PATCH' ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(answer(200, dentist))));
    const { onClose } = renderForm();
    await loaded('Dentist');

    vi.useFakeTimers();
    await act(async () => { fireEvent.click(screen.getByTestId('wall-event-save')); });
    act(() => { vi.advanceTimersByTime(WALL_KEYBOARD_IDLE_MS * 3); });
    expect(onClose).not.toHaveBeenCalled();

    // The hub says no: the form is back, and its minute starts over.
    await act(async () => { finish(answer(403, { code: 'calendarWrite.notAllowed' })); });
    expect(screen.getByTestId('wall-event-notice')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(WALL_KEYBOARD_IDLE_MS - 1); });
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('WallEventForm: a double tap', () => {
  // jsdom still fires a click on a button in a disabled fieldset; Chromium does not.
  // So this checks the hold itself; the wall E2E drives the taps.
  const held = () => (document.querySelector('[data-testid="wall-event-step"]') as HTMLFieldSetElement).disabled;

  it('holds the new step\'s buttons for a double tap after each step change', async () => {
    displayFetch.mockResolvedValue(answer(200, dentist));
    renderForm();
    await loaded('Dentist');
    await waitFor(() => expect(held()).toBe(false));
    // Repeats replaces the details where Save was.
    fireEvent.click(screen.getByTestId('wall-event-repeats'));
    expect(held()).toBe(true);
    await waitFor(() => expect(held()).toBe(false));
    // And Done puts Save back under the same finger.
    fireEvent.click(screen.getByTestId('wall-event-repeat-done'));
    expect(held()).toBe(true);
  });
});
