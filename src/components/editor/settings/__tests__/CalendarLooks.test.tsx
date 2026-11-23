// @vitest-environment jsdom

/**
 * Settings > Calendar: a household's own name and colour for a Google or
 * iCloud calendar. The pencil is on ticked calendars only, the strip writes
 * through `withCalendarOverride`, a calendar that is unticked takes its name
 * with it, and clicking a calendar's name still ticks it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';
import { useEditorStore } from '@/stores/editor-store';
import type { CalendarOverride, ICloudSource } from '@/types/config';

const editorFetch = vi.fn();
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => editorFetch(...args),
  isSessionExpired: () => false,
}));

import CalendarSection from '../CalendarSection';
import { icloudSourceId } from '@/lib/icloud-source-id';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>{children}</I18nProvider>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const FAMILY = 'family@group.calendar.google.com';
const TEAM = 'team@group.calendar.google.com';
const HOME_URL = 'https://caldav.icloud.com/1/calendars/home/';
const WORK_URL = 'https://caldav.icloud.com/1/calendars/work/';
const HOME: ICloudSource = { id: 'ic-home', accountId: 'acct', kind: 'calendar', url: HOME_URL, name: 'Home', color: '#ef4444', enabled: true };

type Values = Parameters<typeof CalendarSection>[0]['values'];

const BASE: Values = {
  selectedCalendarIds: [FAMILY],
  icalSources: [],
  icloudSources: [HOME],
  personSources: {},
  daysAhead: 14,
  hideDeclined: false,
  eventEntry: null,
  wallEntry: true,
};

/** The page's form: every staged edit lands in the values the section is drawn from. */
function page(initial: Partial<Values> = {}) {
  const staged: Partial<Values>[] = [];
  function Harness() {
    const [values, setValues] = useState<Values>({ ...BASE, ...initial });
    return (
      <CalendarSection
        values={values}
        onChange={(updates) => {
          staged.push(updates);
          setValues((v) => ({ ...v, ...updates }));
        }}
      />
    );
  }
  const view = render(<Harness />, { wrapper: Wrapper });
  const looks = () => {
    const last = [...staged].reverse().find((u) => 'calendarOverrides' in u);
    return last?.calendarOverrides as Record<string, CalendarOverride> | undefined;
  };
  return { view, staged, looks };
}

const googleRow = (view: ReturnType<typeof render>, name: string) =>
  view.getAllByTestId('google-calendar-row').find((r) => r.textContent?.includes(name))!;
const icloudRow = (view: ReturnType<typeof render>, name: string) =>
  view.getAllByTestId('icloud-calendar-row').find((r) => r.textContent?.includes(name))!;

beforeEach(() => {
  editorFetch.mockReset();
  useEditorStore.setState({ config: null });
  editorFetch.mockImplementation(async (url: string) => {
    if (url === '/api/auth/google/status') return jsonResponse({ connected: true, credentialsConfigured: true, mode: 'own' });
    if (url === '/api/calendars') {
      return jsonResponse([
        { id: FAMILY, summary: 'Family', backgroundColor: '#4073ff', primary: true, writable: true },
        { id: TEAM, summary: 'Team schedule', backgroundColor: '#fb4f14', primary: false, writable: false },
      ]);
    }
    if (url === '/api/icloud/accounts') return jsonResponse([{ id: 'acct', appleId: 'parent@icloud.com' }]);
    if (url.startsWith('/api/icloud/calendars')) {
      return jsonResponse({ calendars: [{ url: HOME_URL, name: 'Home', color: '#ef4444' }, { url: WORK_URL, name: 'Work', color: '#a855f7' }], birthdaysAvailable: false });
    }
    if (url === '/api/calendar/status') return jsonResponse({ sourceStatus: [] });
    if (url.startsWith('/api/holidays')) return jsonResponse([]);
    return jsonResponse({});
  });
});
afterEach(() => {
  cleanup();
});

describe('a calendar\'s own name and colour', () => {
  it('puts the pencil on ticked calendars only', async () => {
    const { view } = page();
    await act(async () => {});
    expect(within(googleRow(view, 'Family')).queryByTestId('calendar-look-edit')).toBeTruthy();
    expect(within(googleRow(view, 'Team schedule')).queryByTestId('calendar-look-edit')).toBeNull();
    expect(within(icloudRow(view, 'Home')).queryByTestId('calendar-look-edit')).toBeTruthy();
  });

  it('renames a Google calendar, shows the new name on its row, and Reset goes back to Google\'s', async () => {
    const { view, looks } = page();
    await act(async () => {});
    fireEvent.click(within(googleRow(view, 'Family')).getByTestId('calendar-look-edit'));

    const box = view.getByTestId('calendar-look-name') as HTMLInputElement;
    expect(box.placeholder).toBe('Family');
    // The pencil was pressed to type a name: the box has the typing.
    expect(document.activeElement).toBe(box);
    fireEvent.change(box, { target: { value: 'Smith family' } });
    expect(looks()).toEqual({ [FAMILY]: { name: 'Smith family' } });
    expect(googleRow(view, 'Smith family')).toBeTruthy();

    fireEvent.click(view.getByTestId('calendar-look-reset'));
    expect(looks()).toBeUndefined();
    expect(googleRow(view, 'Family')).toBeTruthy();
  });

  it('recolours an iCloud calendar, with Apple\'s name as the placeholder', async () => {
    const { view, looks } = page();
    await act(async () => {});
    fireEvent.click(within(icloudRow(view, 'Home')).getByTestId('calendar-look-edit'));
    expect((view.getByTestId('calendar-look-name') as HTMLInputElement).placeholder).toBe('Home');
    expect((view.getByTestId('calendar-look-color') as HTMLInputElement).value).toBe('#ef4444');

    fireEvent.change(view.getByTestId('calendar-look-color'), { target: { value: '#10b981' } });
    expect(looks()).toEqual({ 'ic-home': { color: '#10b981' } });
  });

  it('opens one strip at a time across Google and iCloud', async () => {
    const { view } = page();
    await act(async () => {});
    fireEvent.click(within(googleRow(view, 'Family')).getByTestId('calendar-look-edit'));
    fireEvent.click(within(icloudRow(view, 'Home')).getByTestId('calendar-look-edit'));
    expect(view.getAllByTestId('calendar-look-strip')).toHaveLength(1);
    expect(within(icloudRow(view, 'Home')).queryByTestId('calendar-look-strip')).toBeTruthy();
  });

  it('ticks a calendar from its name, and the pencil never unticks it', async () => {
    const { view, staged } = page();
    await act(async () => {});
    fireEvent.click(within(googleRow(view, 'Team schedule')).getByText('Team schedule'));
    expect(staged.at(-1)?.selectedCalendarIds).toEqual([FAMILY, TEAM]);

    const before = staged.length;
    fireEvent.click(within(googleRow(view, 'Family')).getByTestId('calendar-look-edit'));
    expect(staged.slice(before).some((u) => 'selectedCalendarIds' in u)).toBe(false);
  });

  it('keeps a Google calendar\'s name when it is unticked, and shows it again when it is ticked', async () => {
    const { view, staged } = page({ calendarOverrides: { [FAMILY]: { name: 'Smith family' } } });
    await act(async () => {});
    fireEvent.click(within(googleRow(view, 'Smith family')).getByRole('checkbox'));
    expect(staged.some((u) => 'calendarOverrides' in u)).toBe(false);
    // Unticked, the row keeps the household's name, without a pencil.
    expect(within(googleRow(view, 'Smith family')).queryByTestId('calendar-look-edit')).toBeNull();
    fireEvent.click(within(googleRow(view, 'Smith family')).getByRole('checkbox'));
    expect(within(googleRow(view, 'Smith family')).queryByTestId('calendar-look-edit')).toBeTruthy();
  });

  it('asks Google for its calendar list once for the whole page, ticks included', async () => {
    const { view } = page();
    await act(async () => {});
    fireEvent.click(within(googleRow(view, 'Team schedule')).getByRole('checkbox'));
    fireEvent.click(within(googleRow(view, 'Team schedule')).getByRole('checkbox'));
    await act(async () => {});
    // People names Google's calendars from the page's own reading of the list.
    expect(editorFetch.mock.calls.filter(([url]) => url === '/api/calendars')).toHaveLength(1);
  });

  it('keeps who a calendar belongs to when it is unticked, for when it is ticked again', async () => {
    const { view, staged } = page({ personSources: { 'm-sam': [FAMILY, HOME.id] } });
    await act(async () => {});
    fireEvent.click(within(googleRow(view, 'Family')).getByRole('checkbox'));
    fireEvent.click(within(icloudRow(view, 'Home')).getByRole('checkbox'));
    // Nothing takes Sam off them: "Whose calendar?" has Sam back the moment they are ticked again.
    expect(staged.some((u) => 'personSources' in u)).toBe(false);
  });

  it('gives an iCloud calendar ticked again its old id, and with it its name', async () => {
    const id = icloudSourceId('parent@icloud.com', 'calendar', HOME_URL);
    const source = { ...HOME, id };
    const { view, staged } = page({ icloudSources: [source], calendarOverrides: { [id]: { name: 'Our house' } } });
    await act(async () => {});
    fireEvent.click(within(icloudRow(view, 'Our house')).getByRole('checkbox'));
    expect(staged.at(-1)?.icloudSources).toEqual([]);
    fireEvent.click(within(icloudRow(view, 'Home')).getByRole('checkbox'));
    expect((staged.at(-1)?.icloudSources ?? [])[0]?.id).toBe(id);
    expect(icloudRow(view, 'Our house')).toBeTruthy();
  });

  it('closes the strip on Enter, keeping what was typed', async () => {
    const { view, looks } = page();
    await act(async () => {});
    fireEvent.click(within(googleRow(view, 'Family')).getByTestId('calendar-look-edit'));
    const box = view.getByTestId('calendar-look-name');
    fireEvent.change(box, { target: { value: 'Smith family' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(view.queryByTestId('calendar-look-strip')).toBeNull();
    expect(looks()).toEqual({ [FAMILY]: { name: 'Smith family' } });
  });

  it('closes the strip on Escape after a colour is picked, with the name box no longer focused', async () => {
    const { view } = page();
    await act(async () => {});
    fireEvent.click(within(googleRow(view, 'Family')).getByTestId('calendar-look-edit'));
    const strip = view.getByTestId('calendar-look-strip');
    const swatch = within(strip).getAllByRole('radio')[1] ?? within(strip).getAllByRole('button')[1];
    fireEvent.click(swatch);
    fireEvent.keyDown(swatch, { key: 'Escape' });
    expect(view.queryByTestId('calendar-look-strip')).toBeNull();
  });

  it('puts back just the colour from the calendar\'s own swatch, keeping its name', async () => {
    const { view, looks } = page({ calendarOverrides: { [FAMILY]: { name: 'Smith family', color: '#10b981' } } });
    await act(async () => {});
    fireEvent.click(within(googleRow(view, 'Smith family')).getByTestId('calendar-look-edit'));
    fireEvent.click(view.getByTestId('calendar-color-own'));
    expect(looks()).toEqual({ [FAMILY]: { name: 'Smith family' } });
  });

  it('puts a calendar ticked again back in its place in the lists, Google\'s and iCloud\'s', async () => {
    const work = { ...HOME, id: icloudSourceId('parent@icloud.com', 'calendar', WORK_URL), url: WORK_URL, name: 'Work' };
    const home = { ...HOME, id: icloudSourceId('parent@icloud.com', 'calendar', HOME_URL) };
    const { view, staged } = page({ selectedCalendarIds: [FAMILY, TEAM], icloudSources: [home, work] });
    await act(async () => {});
    fireEvent.click(within(googleRow(view, 'Family')).getByRole('checkbox'));
    fireEvent.click(within(googleRow(view, 'Family')).getByRole('checkbox'));
    expect(staged.at(-1)?.selectedCalendarIds).toEqual([FAMILY, TEAM]);
    fireEvent.click(within(icloudRow(view, 'Home')).getByRole('checkbox'));
    fireEvent.click(within(icloudRow(view, 'Home')).getByRole('checkbox'));
    expect((staged.at(-1)?.icloudSources ?? []).map((s) => s.name)).toEqual(['Home', 'Work']);
  });
});
