// @vitest-environment jsdom

/**
 * The Google sign-in step in Settings > Calendar's "Adding events" area.
 *
 * The sign-in that allows adding also reconnects showing, so it has to appear
 * while Google is signed out too: after switching between Home Screens' app
 * and the household's own, or after a grant was cancelled. Calendars Google
 * can't list right now get no tick until it is back.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({ editorFetch: vi.fn() }));

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
  isSessionExpired: () => false,
}));

import CalendarAddingArea from '../CalendarAddingArea';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';
import type { GoogleEntryState } from '@/lib/calendar-write';
import type { GoogleCalendar } from '@/hooks/useGoogleCalendars';
import type { ICloudSource } from '@/types/config';

const copy = enUSEditor.settings.calendarPage.adding;
const FAMILY = 'family@group.calendar.google.com';

/** The hub's answer: `googleIfOn` is where Google would stand with adding on; `saved` is the switch it has saved. */
function answer(googleIfOn: GoogleEntryState, saved = true) {
  mocks.editorFetch.mockImplementation(async () => new Response(JSON.stringify({
    enabled: saved, google: saved ? googleIfOn : 'off', googleIfOn, calendars: [], defaultMinutes: 60, timezone: 'America/Chicago', wallDefault: true,
  })));
}

const HOME: ICloudSource = { id: 'ic-home', accountId: 'acct', kind: 'calendar', url: 'https://caldav.example.com/home/', name: 'Home', color: '#ef4444', enabled: true };

function renderArea(googleCalendars: GoogleCalendar[], enabled = true, googleUnreadable = false, { googleSignedOut = false, icloudSources = [] as ICloudSource[] } = {}) {
  return render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      <CalendarAddingArea
        eventEntry={{ enabled, calendarIds: [FAMILY], defaultCalendarId: FAMILY }}
        wallEntry
        googleCalendars={googleCalendars}
        googleUnreadable={googleUnreadable}
        googleSignedOut={googleSignedOut}
        shownGoogleIds={[FAMILY]}
        icloudSources={icloudSources}
        onChange={() => {}}
      />
    </I18nProvider>,
  );
}

describe('CalendarAddingArea', () => {
  beforeEach(() => mocks.editorFetch.mockReset());
  afterEach(cleanup);

  it('offers the sign-in while Google is signed out, without ticks for calendars it cannot list', async () => {
    answer('needsSignIn');
    renderArea([]);
    await waitFor(() => expect(screen.getByTestId('calendar-adding-sign-in')).toBeTruthy());
    expect(screen.getByText(copy.signInTitle)).toBeTruthy();
    expect(screen.queryByText(FAMILY)).toBeNull();
  });

  it('shows the sign-in step as soon as the switch is turned on, before the hub has the change saved', async () => {
    // The page has the switch on; the hub still has it off for half a second.
    answer('needsSignIn', false);
    renderArea([]);
    await waitFor(() => expect(screen.getByTestId('calendar-adding-sign-in')).toBeTruthy());
  });

  it('shows no sign-in step while the switch is off', async () => {
    answer('needsSignIn', false);
    renderArea([], false);
    await waitFor(() => expect(mocks.editorFetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(copy.switch)).toBeTruthy());
    expect(screen.queryByTestId('calendar-adding-sign-in')).toBeNull();
  });

  it('lists the calendar by name once Google lists it', async () => {
    answer('ready');
    renderArea([{ id: FAMILY, summary: 'Family', backgroundColor: '#4073ff', primary: false, writable: true }]);
    // Its tick row, and the same calendar under "New events go on".
    await waitFor(() => expect(screen.getAllByText('Family').length).toBeGreaterThan(0));
    expect(screen.getByRole('checkbox', { name: /Family/ })).toBeTruthy();
    expect(screen.queryByTestId('calendar-adding-sign-in')).toBeNull();
  });

  it('says Google is not answering, not that no calendar is picked, while its list cannot be read', async () => {
    answer('ready');
    renderArea([], true, true);
    await waitFor(() => expect(screen.getByText(copy.googleNotAnswering)).toBeTruthy());
    expect(screen.queryByText(copy.pickCalendars)).toBeNull();
  });

  it('asks for a first sign-in, not one more, while Google is signed out', async () => {
    answer('needsSignIn', false);
    renderArea([], false, false, { googleSignedOut: true });
    await waitFor(() => expect(screen.getByText(copy.switchHelpGoogleSignedOut)).toBeTruthy());
    expect(screen.queryByText(copy.switchHelpGoogle)).toBeNull();
  });

  it('says the sign-in step is a first one while Google is signed out, switched on', async () => {
    answer('needsSignIn');
    renderArea([], true, false, { googleSignedOut: true });
    await waitFor(() => expect(screen.getByText(copy.signInTitleSignedOut)).toBeTruthy());
    expect(screen.getByText(copy.switchHelpGoogleSignedOut)).toBeTruthy();
    expect(screen.queryByText(copy.signInTitle)).toBeNull();
  });

  it('says the same beside iCloud calendars', async () => {
    answer('needsSignIn', false);
    renderArea([], false, false, { googleSignedOut: true, icloudSources: [HOME] });
    await waitFor(() => expect(screen.getByText(copy.switchHelpBothSignedOut)).toBeTruthy());
  });

  it('keeps "once more" for a household signed in to show calendars only', async () => {
    answer('needsSignIn', false);
    renderArea([{ id: FAMILY, summary: 'Family', backgroundColor: '#4073ff', primary: false, writable: true }], false);
    await waitFor(() => expect(screen.getByText(copy.switchHelpGoogle)).toBeTruthy());
    expect(screen.queryByText(copy.switchHelpGoogleSignedOut)).toBeNull();
  });
});
