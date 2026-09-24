// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import modules from '@/translations/en-US/modules.json';
import { I18nProvider } from '@/i18n/provider';
import type { TimetableData, TimetableSource } from '@/types/timetables';
import type { ScreenConfiguration } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';

vi.mock('@/lib/editor-fetch', () => ({ isSessionExpired: () => false }));

import SourcePanel from '../SourcePanel';
import type { SheetCheckOutcome } from '../use-timetable-draft';

const SHEET = 'https://docs.google.com/spreadsheets/d/abc/edit';

/**
 * Midday rather than midnight, so the date the panel writes is the fourth of
 * September in every timezone a machine running this might be set to.
 */
function source(over: Partial<TimetableSource> = {}): TimetableSource {
  return { kind: 'sheet', url: SHEET, importedAt: '2026-09-04T12:00:00.000Z', sync: true, ...over };
}

/** A time in the recent past, as the store would have written it. */
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** The document the panel is editing: one person, one week, one sheet. */
function documentWith(from: TimetableSource): TimetableData {
  return {
    schools: [
      {
        id: 'school-1',
        name: 'Gymnasium',
        slots: [{ kind: 'period', n: 1, start: '07:50', end: '08:35' }],
        weekCycle: { mode: 'off' },
        specialDays: [],
      },
    ],
    subjects: [{ id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'triangle' }],
    timetables: [{ memberId: 'leon', schoolId: 'school-1', weeks: { A: {} }, source: from }],
  };
}

function render(over: Partial<TimetableSource> = {}, outcome: SheetCheckOutcome = 'unchanged') {
  const from = source(over);
  const changes: ((data: TimetableData) => TimetableData)[] = [];
  const importAgain = vi.fn();
  const checked = vi.fn(async () => outcome);
  renderUI(
    <SourcePanel
      memberId="leon"
      source={from}
      onImportAgain={importAgain}
      onCheck={checked}
      update={(change) => changes.push(change)}
    />,
    {
      wrapper: ({ children }) => (
        <I18nProvider locale="en-US" blob={{ core, editor, modules }}>
          {children}
        </I18nProvider>
      ),
    },
  );
  // The panel lives behind a pill in the header row: as a card above the grid it
  // took a quarter of a window whose point is the grid. Every case here is about
  // what it says once it is open, so open it.
  fireEvent.click(screen.getByRole('button', { name: /From a spreadsheet/ }));

  /** The document as the panel's one edit would leave it. */
  const saved = () => {
    expect(changes).toHaveLength(1);
    return changes[0](documentWith(from)).timetables[0].source;
  };
  return { importAgain, checked, saved };
}

afterEach(cleanup);

describe('SourcePanel', () => {
  it('says which sheet the week came from and when it was last looked at', () => {
    render({ lastCheckedAt: minutesAgo(22) });

    expect(screen.getByText('In sync')).toBeTruthy();
    expect(screen.getByText(/Read September 4/)).toBeTruthy();
    expect(screen.getByText(/Last checked 22 minutes ago/)).toBeTruthy();

    // The way back to the sheet is the point of the panel, and it opens in its
    // own tab rather than taking the editor off a window that saves as it goes.
    const open = screen.getByRole('link', { name: 'Open the sheet' });
    expect(open.getAttribute('href')).toBe(SHEET);
    expect(open.getAttribute('target')).toBe('_blank');
    expect(open.getAttribute('rel')).toBe('noopener noreferrer');

    expect(screen.getByRole('button', { name: 'Check now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import again' })).toBeTruthy();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Only this week is replaced/)).toBeTruthy();
  });

  it("dates the read on the household's calendar, not the laptop's", () => {
    // 9 PM on September 3 in Chicago is already September 4 in UTC and further east.
    useEditorStore.setState({
      config: { settings: { timezone: 'America/Chicago' } } as unknown as ScreenConfiguration,
    });
    try {
      render({ importedAt: '2026-09-04T02:00:00.000Z', lastCheckedAt: minutesAgo(5) });
      expect(screen.getByText(/Read September 3/)).toBeTruthy();
    } finally {
      useEditorStore.setState({ config: null });
    }
  });

  it('says the first check has not happened yet rather than leaving the line blank', () => {
    render();

    expect(screen.getByText(/Not checked yet/)).toBeTruthy();
  });

  it('keeps the saved week and says why when the last look at the sheet failed', () => {
    render({ lastCheckedAt: minutesAgo(120), lastError: 'sheetUnreachable' });

    expect(screen.getByText('Could not check')).toBeTruthy();
    expect(screen.getByText('Google did not answer. Try again in a minute.')).toBeTruthy();
    expect(screen.getByText(/still showing the week we already had/)).toBeTruthy();

    // Looking again is the only useful thing to do with a sheet that would not
    // answer, so importing from it again is not offered beside it.
    expect(screen.getByRole('button', { name: 'Try now' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import again' })).toBeNull();

    // One failed look is not a reason to stop following the sheet.
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/We will keep trying every hour/)).toBeTruthy();
  });

  it('says the week is theirs once it has stopped following the sheet', () => {
    render({ sync: false, lastCheckedAt: minutesAgo(22), lastError: 'sheetUnreachable' });

    expect(screen.getByText('Not following the sheet')).toBeTruthy();
    expect(screen.getByText(/This week is yours now/)).toBeTruthy();
    // Nothing is checking it, so neither the last check nor why it failed is
    // anything the household has to act on.
    expect(screen.queryByText(/Last checked/)).toBeNull();
    expect(screen.queryByText(/Google did not answer/)).toBeNull();

    expect(screen.getByRole('button', { name: 'Import again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/Turning this on replaces this week/)).toBeTruthy();
  });

  it('shows a check the household asked for while it is happening', async () => {
    let answer: (result: SheetCheckOutcome) => void = () => {};
    const { checked } = render({ lastCheckedAt: minutesAgo(90) });
    checked.mockReturnValue(new Promise<SheetCheckOutcome>((resolve) => { answer = resolve; }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    });

    expect(screen.getByText('Checking…')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Check now' }) as HTMLButtonElement).disabled).toBe(true);
    expect(checked).toHaveBeenCalledTimes(1);

    await act(async () => {
      answer('unchanged');
    });

    // The check writes straight to the store, so the copy on screen has to be
    // read back whichever way the look went.
    expect(checked).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Checking…')).toBeNull();
  });

  it('says what the check found, rather than leaving a worked check looking dead', async () => {
    // Nothing on screen used to move when a check succeeded: not a word, and
    // not the "last checked" line, which still said ninety minutes.
    render({ lastCheckedAt: minutesAgo(90) }, 'unchanged');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    });

    expect(screen.getByText('Checked just now. The sheet has not changed.')).toBeTruthy();
  });

  it('says the sheet had a new week when the check brought one', async () => {
    render({ lastCheckedAt: minutesAgo(90) }, 'changed');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    });

    expect(screen.getByText('The sheet had a new week. It is in now.')).toBeTruthy();
  });

  it('says nothing about a check whose document could not be read back', async () => {
    render({ lastCheckedAt: minutesAgo(90) }, null);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    });

    expect(screen.queryByText(/Checked just now/)).toBeNull();
    expect(screen.queryByText(/had a new week/)).toBeNull();
  });

  it('says so in plain words when the check itself could not be made', async () => {
    const { checked } = render({ lastCheckedAt: minutesAgo(90) });
    checked.mockRejectedValue(new Error('That sheet is not saved any more.'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    });

    expect(screen.getByRole('alert').textContent).toBe('That sheet is not saved any more.');
    expect(checked).toHaveBeenCalledTimes(1);
  });

  it('stops the week following the sheet when the switch is turned off', () => {
    const { saved } = render({ lastCheckedAt: minutesAgo(22) });

    fireEvent.click(screen.getByRole('switch'));

    expect(saved()?.sync).toBe(false);
  });

  it('puts the week back on the sheet when the switch is turned on again', () => {
    const { saved } = render({ sync: false });

    fireEvent.click(screen.getByRole('switch'));

    expect(saved()?.sync).toBe(true);
  });

  it('opens the import screen from Import again', () => {
    const { importAgain } = render({ sync: false });

    fireEvent.click(screen.getByRole('button', { name: 'Import again' }));

    expect(importAgain).toHaveBeenCalledTimes(1);
  });
});
