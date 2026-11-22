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

const copy = enUSEditor.settings.calendarPage.adding;
const FAMILY = 'family@group.calendar.google.com';

function answer(google: GoogleEntryState) {
  mocks.editorFetch.mockResolvedValue(new Response(JSON.stringify({ enabled: true, google, calendars: [], defaultMinutes: 60, timezone: 'America/Chicago', wallDefault: true })));
}

function renderArea(googleCalendars: GoogleCalendar[]) {
  return render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      <CalendarAddingArea
        eventEntry={{ enabled: true, calendarIds: [FAMILY], defaultCalendarId: FAMILY }}
        wallEntry
        googleCalendars={googleCalendars}
        shownGoogleIds={[FAMILY]}
        icloudSources={[]}
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

  it('lists the calendar by name once Google lists it', async () => {
    answer('ready');
    renderArea([{ id: FAMILY, summary: 'Family', backgroundColor: '#4073ff', primary: false, writable: true }]);
    // Its tick row, and the same calendar under "New events go on".
    await waitFor(() => expect(screen.getAllByText('Family').length).toBeGreaterThan(0));
    expect(screen.getByRole('checkbox', { name: /Family/ })).toBeTruthy();
    expect(screen.queryByTestId('calendar-adding-sign-in')).toBeNull();
  });
});
