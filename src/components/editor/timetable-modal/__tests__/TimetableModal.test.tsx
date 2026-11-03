// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import modules from '@/translations/en-US/modules.json';
import { I18nProvider } from '@/i18n/provider';
import type { FamilyMember } from '@/types/family';
import type { TimetableData } from '@/types/timetables';

const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (url: string, init?: RequestInit) => state.request(url, init),
  isSessionExpired: () => false,
}));

const family = vi.hoisted(() => ({ members: [] as FamilyMember[] }));
vi.mock('@/hooks/useFamilyData', () => ({
  useFamilyData: () => ({ members: family.members, revision: 'f1', loading: false, error: null, refresh: vi.fn() }),
}));

import TimetableModal from '../index';

function person(id: string, name: string): FamilyMember {
  return { id, name, color: '#60a5fa', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
}

const DATA: TimetableData = {
  schools: [
    {
      id: 'school-1',
      name: 'Gymnasium am Rhein',
      slots: [
        { kind: 'period', n: 1, start: '07:50', end: '08:35' },
        { kind: 'period', n: 2, start: '08:40', end: '09:25' },
      ],
      weekCycle: { mode: 'off' },
      specialDays: [],
    },
  ],
  subjects: [
    { id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'triangle' },
    { id: 'de', code: 'De', name: 'Deutsch', color: '#f26363', icon: 'book' },
  ],
  timetables: [
    { memberId: 'leon', schoolId: 'school-1', className: '7c', weeks: { A: { mon: { 1: { subjectId: 'ma' } } } } },
    { memberId: 'emma', schoolId: 'school-1', className: '10a', weeks: { A: { mon: { 1: { subjectId: 'de' } } } } },
  ],
};

/** The same household, with Emma's week following a spreadsheet. */
const SYNCED: TimetableData = {
  ...DATA,
  timetables: [
    DATA.timetables[0],
    {
      ...DATA.timetables[1],
      source: {
        kind: 'sheet',
        url: 'https://docs.google.com/spreadsheets/d/abc/edit',
        importedAt: '2026-09-01T12:00:00.000Z',
        sync: true,
      },
    },
  ],
};

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function render(memberId?: string, onClose: () => void = () => {}) {
  return renderUI(<TimetableModal memberId={memberId} onClose={onClose} />, {
    wrapper: ({ children }) => (
      <I18nProvider locale="en-US" blob={{ core, editor, modules }}>
        {children}
      </I18nProvider>
    ),
  });
}

async function settle() {
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  family.members = [person('leon', 'Leon'), person('emma', 'Emma'), person('lina', 'Lina')];
  state.request.mockReset();
  state.request.mockResolvedValue(reply(200, { data: DATA, revision: 'r1' }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TimetableModal', () => {
  it('opens on the person it was asked to open on', async () => {
    render('emma');
    await settle();

    expect(screen.getByRole('button', { name: 'Monday, period 1, Deutsch' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Monday, period 1, Mathe' })).toBeNull();
    expect((screen.getByLabelText('Class') as HTMLInputElement).value).toBe('10a');
  });

  it('opens on the first person with a timetable when it was not told one', async () => {
    render();
    await settle();
    expect((screen.getByLabelText('Class') as HTMLInputElement).value).toBe('7c');
  });

  it('lists the people without a timetable under their own heading', async () => {
    render('emma');
    await settle();

    expect(screen.getByText('In your family, no timetable yet')).toBeTruthy();
    const add = screen.getByRole('button', { name: /Lina/ });
    expect(add.textContent).toContain('No timetable');
  });

  it('switches tabs by click and by arrow key, and keeps the draft across them', async () => {
    render('emma');
    await settle();

    const schools = screen.getByRole('tab', { name: 'Schools & times' });
    fireEvent.click(schools);
    expect(schools.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel')).toBeTruthy();
    expect(screen.getByText('Bell times')).toBeTruthy();

    fireEvent.keyDown(schools, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Subjects' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Bring along')).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Subjects' }), { key: 'Home' });
    expect(screen.getByRole('button', { name: 'Monday, period 1, Deutsch' })).toBeTruthy();
  });

  it('says what actually happened when somebody else saved first', async () => {
    render('emma');
    await settle();

    state.request.mockResolvedValueOnce(reply(409, { error: 'nope', code: 'timetables.revision', data: DATA, revision: 'r9' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Tuesday, period 1, Free' }));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    // The other document is already in the draft, so the banner used to send
    // the household off to "check your last change" when that change was
    // gone, behind a Refresh button that could not bring it back.
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('so we loaded theirs');
    expect(alert.textContent).toContain('Your last change did not save');
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });

  // The cell reads out the other week's lesson as part of its own name once a
  // school alternates, so these match the start of the name: what is asserted
  // here is which lesson the cell holds, not what its sibling week says.
  it('puts a second week back when the switch is flicked off and on again', async () => {
    render('emma');
    await settle();

    fireEvent.click(screen.getByRole('radio', { name: 'A and B' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Tuesday, period 1, Free' }));
    expect(screen.getByRole('button', { name: /^Tuesday, period 1, Mathe/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Same each week' }));
    expect(screen.getByRole('button', { name: 'Tuesday, period 1, Free' })).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'A and B' }));
    expect(screen.getByRole('button', { name: /^Tuesday, period 1, Mathe/ })).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
  });

  it('says what turning a school off A and B weeks took away, and puts it back', async () => {
    // One click on Off wiped the second week of every child at that school,
    // and clicking straight back on handed out a copy of week A instead. The
    // weeks are held for the session, and the banner offers them back.
    render('emma');
    await settle();

    fireEvent.click(screen.getByRole('radio', { name: 'A and B' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Tuesday, period 1, Free' }));
    expect(screen.getByRole('button', { name: /^Tuesday, period 1, Mathe/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Schools & times' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(screen.getByRole('status')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Odd week numbers are A' }).getAttribute('aria-checked')).toBe('true');

    // The week that came back is the one that was typed, not a fresh copy of A.
    fireEvent.click(screen.getByRole('tab', { name: 'Timetables' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Week B' }));
    expect(screen.getByRole('button', { name: /^Tuesday, period 1, Mathe/ })).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
  });

  it('puts the second weeks back when the school rule goes straight back on', async () => {
    render('emma');
    await settle();

    fireEvent.click(screen.getByRole('radio', { name: 'A and B' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Tuesday, period 1, Free' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Schools & times' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Even week numbers are A' }));

    fireEvent.click(screen.getByRole('tab', { name: 'Timetables' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Week B' }));
    expect(screen.getByRole('button', { name: /^Tuesday, period 1, Mathe/ })).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
  });

  it('folds the other week into the name of a cell the two weeks disagree on', async () => {
    // The other week showed as a bare "A: De" at 10px. Nothing on screen said
    // what that line was, and the cell's own name did not mention it at all,
    // so a screen reader never learned the two weeks differ here.
    render('emma');
    await settle();

    fireEvent.click(screen.getByRole('radio', { name: 'A and B' }));
    // Week B is shown on the flick and starts as a copy of A, so painting
    // Mathe over Monday's Deutsch is what parts the two weeks.
    fireEvent.pointerDown(screen.getByRole('button', { name: /^Monday, period 1, Deutsch/ }));

    const cell = screen.getByRole('button', { name: /^Monday, period 1, Mathe/ });
    const name = cell.getAttribute('aria-label') ?? '';
    const template = (editor as unknown as { timetableModal: { grid: Record<string, string> } })
      .timetableModal.grid.otherWeek;
    expect(template, 'timetableModal.grid.otherWeek belongs in en-US editor.json').toBeTruthy();
    // One sentence, with the other week's lesson spelled out in full rather
    // than left as the short code the cell has room for.
    expect(name).toBe(
      `Monday, period 1, Mathe, ${template.replace('{letter}', 'A').replace('{lesson}', 'Deutsch')}`,
    );
    expect(cell.getAttribute('title')).toBe(name);

    // And the line has a key, beside the paint hint under the grid.
    const footer = screen.getByText(/Pick a subject, then click or drag/);
    expect(footer.textContent).not.toBe('Pick a subject, then click or drag across the week.');

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
  });

  it('leaves a cell alone when the household has one week', async () => {
    render('emma');
    await settle();

    // Nothing to compare against, so no other-week line, no tooltip, and the
    // name is the cell and its lesson.
    const cell = screen.getByRole('button', { name: 'Monday, period 1, Deutsch' });
    expect(cell.getAttribute('title')).toBeNull();
    expect(screen.getByText(/Pick a subject, then click or drag/).textContent)
      .toBe('Pick a subject, then click or drag across the week.');
  });

  it('offers taking a timetable away in words rather than as a bare bin', async () => {
    // The only way out was an unlabelled bin one gap from the icons toggle, so
    // finding it meant hovering an icon to see whether it was the destructive
    // one. It carries its words now, and they are its accessible name too, so
    // a spoken "remove Emma's timetable" asks for what is drawn.
    render('emma');
    await settle();

    const remove = screen.getByRole('button', { name: "Remove Emma's timetable" });
    expect(remove.textContent).toContain("Remove Emma's timetable");
    expect(remove.getAttribute('aria-label')).toBeNull();
  });

  it('caps the class name at what the store will take, so one long paste cannot jam the save', async () => {
    render('emma');
    await settle();
    expect((screen.getByLabelText('Class') as HTMLInputElement).maxLength).toBe(60);
  });

  it('reports a refused save once', async () => {
    render('emma');
    await settle();

    // The hub's English sentence is for its log; the window shows the
    // household's own words for the code.
    state.request.mockResolvedValue(reply(400, { error: 'Class names can be up to 60 characters', code: 'timetables.invalid' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Tuesday, period 1, Free' }));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getAllByText("Something in the timetables couldn't be saved as it is. Reload the page and make the change again.")).toHaveLength(1);
    expect(screen.queryByText('Class names can be up to 60 characters')).toBeNull();
  });

  it('sends a household with no school to add one before painting a week', async () => {
    state.request.mockReset();
    state.request.mockResolvedValue(
      reply(200, { data: { schools: [], subjects: [], timetables: [] }, revision: 'r1' }),
    );
    render();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: /Lina/ }));
    expect(screen.getByRole('tab', { name: 'Schools & times' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('School name')).toBeTruthy();
  });

  it('paints with the brush the palette has picked', async () => {
    render('emma');
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'De' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Tuesday, period 2, Free' }));

    expect(screen.getByRole('button', { name: 'Tuesday, period 2, Deutsch' })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    const put = state.request.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(put![1].body).data.timetables[1].weeks.A.tue).toEqual({ 2: { subjectId: 'de' } });
  });
});

describe('TimetableModal, closing while a save keeps failing', () => {
  it('offers a way out instead of holding the window open forever', async () => {
    // Every exit routes through the same handler, which waited for the save. A
    // refusal that will not clear - a mistyped bell time, a hub that is down -
    // left no way out but reloading the editor, which discards the draft anyway.
    const onClose = vi.fn();
    render('emma', onClose);
    await settle();

    state.request.mockResolvedValue(reply(400, { error: 'Room names can be up to 16 characters', code: 'timetables.invalid' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Tuesday, period 1, Free' }));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    // First attempt reports the refusal and keeps the window up, so the last
    // edit is not thrown away silently.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => {});
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getAllByText("Something in the timetables couldn't be saved as it is. Reload the page and make the change again.").length).toBeGreaterThan(0);

    // And then the exit is offered outright.
    fireEvent.click(screen.getByRole('button', { name: 'Close without saving' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('TimetableModal, saying what it knows', () => {
  it('gives a first run a real empty state on both tabs instead of a blank pane', async () => {
    // The first thing anybody sees in this window used to be 900 by 1050
    // pixels of nothing, under a footer telling them to pick a subject and
    // drag across a week that was not on screen.
    state.request.mockReset();
    state.request.mockResolvedValue(
      reply(200, { data: { schools: [], subjects: [], timetables: [] }, revision: 'r1' }),
    );
    render();
    await settle();

    expect(screen.getByText('Nobody has a school week yet')).toBeTruthy();
    expect(screen.getByText(/Pick a child on the left to start one/)).toBeTruthy();
    expect(screen.queryByText('Pick a subject, then click or drag across the week.')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Schools & times' }));
    expect(screen.getByText('Add the school first')).toBeTruthy();
    expect(screen.getByText(/Everyone at one school shares its bell times/)).toBeTruthy();
  });

  it('says whose week a school is needed for, and comes back to it once it is added', async () => {
    state.request.mockReset();
    state.request.mockResolvedValue(
      reply(200, { data: { schools: [], subjects: [], timetables: [] }, revision: 'r1' }),
    );
    render();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: /Lina/ }));
    expect(screen.getByRole('status').textContent).toContain('Lina needs a school first');
    expect(screen.getByRole('tab', { name: 'Schools & times' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.change(screen.getByLabelText('School name'), { target: { value: 'Grundschule' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    // Back on the week that was waiting, with the detour over and nothing left
    // for the household to work out for themselves.
    expect(screen.getByRole('tab', { name: 'Timetables' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('status')).toBeNull();
    expect((screen.getByLabelText('School') as HTMLSelectElement).selectedOptions[0].text).toBe('Grundschule');

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    const put = state.request.mock.calls.filter(([, init]) => init?.method === 'PUT').pop();
    const saved = JSON.parse(put![1].body).data as TimetableData;
    expect(saved.timetables.map((timetable) => timetable.memberId)).toEqual(['lina']);
  });

  it('offers adding a school beside the picker rather than as one of the schools', async () => {
    render('emma');
    await settle();

    // An action inside a list of values answered "which school?" with a jump
    // to another tab, and said nothing at all about why.
    const picker = screen.getByLabelText('School') as HTMLSelectElement;
    expect([...picker.options].map((option) => option.text)).toEqual(['Gymnasium am Rhein']);

    fireEvent.click(screen.getByRole('button', { name: '+ Add a school' }));
    expect(screen.getByRole('status').textContent).toContain('Add the school Emma goes to');

    // The add form's own box, in the rail. The second box of that name is the
    // selected school's, on the right.
    const [nameBox] = screen.getAllByLabelText('School name');
    fireEvent.change(nameBox, { target: { value: 'Grundschule' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('tab', { name: 'Timetables' }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByLabelText('School') as HTMLSelectElement).selectedOptions[0].text).toBe('Grundschule');

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    const put = state.request.mock.calls.filter(([, init]) => init?.method === 'PUT').pop();
    const saved = JSON.parse(put![1].body).data as TimetableData;
    const emma = saved.timetables.find((timetable) => timetable.memberId === 'emma');
    expect(saved.schools.find((school) => school.id === emma?.schoolId)?.name).toBe('Grundschule');
  });

  it('says there is nothing to paint with rather than asking for a subject that does not exist', async () => {
    state.request.mockReset();
    state.request.mockResolvedValue(reply(200, { data: { ...DATA, subjects: [] }, revision: 'r1' }));
    render('emma');
    await settle();

    expect(screen.getByText(/No subjects yet, so there is nothing to paint with/)).toBeTruthy();
    expect(screen.queryByText('Pick a subject, then click or drag across the week.')).toBeNull();
    // The eraser was silently the brush, so every click on the grid did
    // nothing at all while the footer asked for a subject.
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('lets the stopped-following banner be put away without undoing it', async () => {
    state.request.mockReset();
    state.request.mockResolvedValue(reply(200, { data: SYNCED, revision: 'r1' }));
    render('emma');
    await settle();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Tuesday, period 1, Free' }));
    expect(screen.getByRole('status').textContent).toContain('no longer following the sheet');

    // Undo was its only control, so a household that was happy with the
    // change kept a bar at the top of the window for the rest of the session.
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('status')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    const put = state.request.mock.calls.filter(([, init]) => init?.method === 'PUT').pop();
    const saved = JSON.parse(put![1].body).data as TimetableData;
    // Put away, not undone: the week really has left the sheet.
    expect(saved.timetables.find((timetable) => timetable.memberId === 'emma')?.source?.sync).toBe(false);
  });

  it('takes the stopped-following banner away when another child is picked', async () => {
    state.request.mockReset();
    state.request.mockResolvedValue(reply(200, { data: SYNCED, revision: 'r1' }));
    render('emma');
    await settle();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Tuesday, period 1, Free' }));
    expect(screen.queryByRole('status')).toBeTruthy();

    // It names one person's week, and another child's week is not the place
    // to read about it or to undo it.
    fireEvent.click(screen.getByRole('button', { name: /Leon/ }));
    expect(screen.queryByRole('status')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
  });
});


describe('checking a sheet with pending edits', () => {
  it('saves before checking and then reloads the changed week', async () => {
    let saved = structuredClone(SYNCED);
    let revision = 'r1';
    const calls: string[] = [];
    let finish: (() => void) | undefined;
    state.request.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push(method);
      if (method === 'PUT') {
        saved = JSON.parse(init!.body as string).data;
        revision = 'r2';
      }
      if (url.endsWith('/sync')) {
        await new Promise<void>((resolve) => { finish = resolve; });
        saved.timetables[1].weeks.A.mon = { 1: { subjectId: 'ma' } };
        revision = 'r3';
        return reply(200, { checked: 1 });
      }
      return reply(200, { data: structuredClone(saved), revision });
    });
    render('emma');
    await settle();
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: '11b' } });
    fireEvent.click(screen.getByRole('button', { name: /From a spreadsheet/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    await settle();
    expect(calls).toEqual(['GET', 'PUT', 'POST']);
    expect(saved.timetables[1].className).toBe('11b');
    expect(screen.getByLabelText('Class').closest('fieldset')?.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Close' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finish!(); });
    expect(calls).toEqual(['GET', 'PUT', 'POST', 'GET']);
    expect((screen.getByLabelText('Class') as HTMLInputElement).value).toBe('11b');
    expect(screen.getByRole('button', { name: 'Monday, period 1, Mathe' })).toBeTruthy();
    expect(screen.getByText('The sheet had a new week. It is in now.')).toBeTruthy();
    expect(screen.getByLabelText('Class').closest('fieldset')?.disabled).toBe(false);
  });

  it('keeps the draft and stops without syncing or reloading when saving fails', async () => {
    state.request.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? reply(409, { error: 'Please finish the school name.', code: 'timetables.member' })
        : reply(200, { data: structuredClone(SYNCED), revision: 'r1' }),
    );
    render('emma');
    await settle();
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: '11b' } });
    fireEvent.click(screen.getByRole('button', { name: /From a spreadsheet/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    await settle();
    expect(state.request.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual(['GET', 'PUT']);
    expect((screen.getByLabelText('Class') as HTMLInputElement).value).toBe('11b');
    expect(screen.getByRole('alert').textContent).toContain('A timetable belongs to somebody who is no longer in the family. Reopen the page and pick a person again.');
    expect(screen.getByRole('alert').textContent).not.toContain('Please finish the school name.');
    expect(screen.getByLabelText('Class').closest('fieldset')?.disabled).toBe(false);
  });

  it('stops without reloading and releases the editor when the check fails', async () => {
    state.request.mockImplementation(async (url: string) =>
      url.endsWith('/sync')
        ? reply(500, { error: 'Could not check the sheet.' })
        : reply(200, { data: structuredClone(SYNCED), revision: 'r1' }),
    );
    render('emma');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /From a spreadsheet/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    await settle();
    expect(state.request.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual(['GET', 'PUT', 'POST']);
    expect(screen.getByRole('alert').textContent).toContain('Could not check the sheet.');
    expect(screen.getByLabelText('Class').closest('fieldset')?.disabled).toBe(false);
  });
});
