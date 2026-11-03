// @vitest-environment jsdom

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as renderUI, screen, waitFor } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import modules from '@/translations/en-US/modules.json';
import { I18nProvider } from '@/i18n/provider';
import type { FamilyMember } from '@/types/family';
import type { TimetableData } from '@/types/timetables';

const confirm = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@/stores/confirm-store', () => ({
  useConfirmStore: { getState: () => ({ confirm: confirm.ask }) },
}));

import SchoolsTab from '../SchoolsTab';
import SubjectsTab from '../SubjectsTab';
import { withWeekCycle } from '../use-timetable-draft';

function person(id: string, name: string): FamilyMember {
  return { id, name, color: '#60a5fa', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
}

const MEMBERS = [person('leon', 'Leon'), person('emma', 'Emma')];

function household(): TimetableData {
  return {
    schools: [
      {
        id: 'school-1',
        name: 'Gymnasium',
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
    timetables: [{ memberId: 'leon', schoolId: 'school-1', weeks: { A: { mon: { 1: { subjectId: 'ma' } } } } }],
  };
}

function wrap(children: React.ReactNode) {
  return renderUI(children, {
    wrapper: ({ children: inner }) => (
      <I18nProvider locale="en-US" blob={{ core, editor, modules }}>
        {inner}
      </I18nProvider>
    ),
  });
}

/** The tabs read a document and hand back a change, so the test holds it. */
function SchoolsHarness({
  onChange,
  onAdded,
  initial,
}: {
  onChange?: (data: TimetableData) => void;
  onAdded?: (schoolId: string) => void;
  initial?: TimetableData;
}) {
  const [data, setData] = useState(initial ?? household());
  const [schoolId, setSchoolId] = useState<string | null>(initial ? null : 'school-1');
  const [adding, setAdding] = useState(false);
  return (
    <SchoolsTab
      data={data}
      members={MEMBERS}
      selectedSchoolId={schoolId}
      onSelectSchool={setSchoolId}
      adding={adding}
      onAdding={setAdding}
      onAdded={onAdded ?? (() => {})}
      // The window holds this so it can keep the second weeks a rule turned
      // off would take with it; the tab on its own just applies the rule.
      onWeekCycle={(schoolId, weekCycle) =>
        setData((current) => {
          const next = withWeekCycle(current, schoolId, weekCycle);
          onChange?.(next);
          return next;
        })
      }
      update={(change) =>
        setData((current) => {
          const next = change(current);
          onChange?.(next);
          return next;
        })
      }
    />
  );
}

/** Everybody in `members` has Maths, so the used-by column has to place them all. */
function everyoneHasMaths(members: readonly FamilyMember[]): TimetableData {
  return {
    ...household(),
    timetables: members.map((member) => ({
      memberId: member.id,
      schoolId: 'school-1',
      weeks: { A: { mon: { 1: { subjectId: 'ma' } } } },
    })),
  };
}

function SubjectsHarness({
  onChange,
  members = MEMBERS,
  initial,
}: {
  onChange?: (data: TimetableData) => void;
  members?: readonly FamilyMember[];
  initial?: TimetableData;
}) {
  const [data, setData] = useState(initial ?? household());
  return (
    <SubjectsTab
      data={data}
      members={members}
      update={(change) =>
        setData((current) => {
          const next = change(current);
          onChange?.(next);
          return next;
        })
      }
    />
  );
}

beforeEach(() => {
  confirm.ask.mockReset();
  confirm.ask.mockResolvedValue(true);
});

afterEach(cleanup);

describe('SchoolsTab', () => {
  it('describes a school by its bells and by who goes there', () => {
    wrap(<SchoolsHarness />);
    // Bells are stored as 24-hour strings and shown in the household's clock,
    // which is the 12-hour default here because nothing has set one.
    expect(screen.getByText('2 periods · 7:50 AM to 9:25 AM')).toBeTruthy();
    expect(screen.getByText('Leon')).toBeTruthy();
    // The colour dot beside the names says whose it is on hover too.
    expect(screen.getByTitle('Leon')).toBeTruthy();
  });

  it('starts a new school from a bell schedule described by what it says', () => {
    let latest: TimetableData | null = null;
    wrap(<SchoolsHarness onChange={(data) => { latest = data; }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add school' }));
    // The rail's add form comes before the selected school's own name input.
    fireEvent.change(screen.getAllByLabelText('School name')[0], { target: { value: 'GGS Lindenweg' } });
    fireEvent.change(screen.getByLabelText('Start from'), { target: { value: 'short-45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const saved = latest as TimetableData | null;
    expect(saved?.schools).toHaveLength(2);
    expect(saved?.schools[1].name).toBe('GGS Lindenweg');
    expect(saved?.schools[1].slots.filter((slot) => slot.kind === 'period')).toHaveLength(8);
    expect(saved?.schools[1].weekCycle).toEqual({ mode: 'off' });
  });

  it('says what a school is for when there is not one yet, rather than showing an empty pane', () => {
    // The right-hand three quarters of the window used to be nothing at all,
    // beside one dashed button with no heading and no explanation.
    wrap(<SchoolsHarness initial={{ schools: [], subjects: [], timetables: [] }} />);

    expect(screen.getByText('Add the school first')).toBeTruthy();
    expect(screen.getByText(/Everyone at one school shares its bell times/)).toBeTruthy();
  });

  it('hands the new school back, for a week that was waiting on one', () => {
    const added: string[] = [];
    wrap(
      <SchoolsHarness
        initial={{ schools: [], subjects: [], timetables: [] }}
        onAdded={(schoolId) => added.push(schoolId)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add school' }));
    fireEvent.change(screen.getAllByLabelText('School name')[0], { target: { value: 'GGS Lindenweg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(added).toHaveLength(1);
    // And the tab is now showing it, rather than the nothing-yet pane.
    expect(screen.getByRole('button', { name: 'Remove GGS Lindenweg' })).toBeTruthy();
    expect(screen.queryByText('Add the school first')).toBeNull();
  });

  it('names the starting points by the kind of day, and says they are only a start', () => {
    wrap(<SchoolsHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add school' }));

    const startFrom = screen.getByLabelText('Start from') as HTMLSelectElement;
    expect([...startFrom.options].map((option) => option.text)).toEqual([
      'Short lessons (45 min), long day',
      'Short lessons (45 min), shorter day',
      'Hour-long lessons',
      'None of these, we will type our own',
    ]);
    // The bells of the chosen one are a preview under the picker, not its name.
    expect(screen.getByText('10 periods · 7:50 AM to 4:35 PM')).toBeTruthy();
    expect(
      screen.getByText('You can change every period and time afterwards, and everyone at this school shares them.'),
    ).toBeTruthy();
  });

  it('starts a school with one period when none of the offered days fit', () => {
    let latest: TimetableData | null = null;
    wrap(<SchoolsHarness onChange={(data) => { latest = data; }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add school' }));
    fireEvent.change(screen.getAllByLabelText('School name')[0], { target: { value: 'Waldschule' } });
    fireEvent.change(screen.getByLabelText('Start from'), { target: { value: 'blank' } });
    expect(screen.getByText('1 period · 8:00 AM to 8:45 AM')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const saved = latest as TimetableData | null;
    expect(saved?.schools[1].slots).toEqual([{ kind: 'period', n: 1, start: '08:00', end: '08:45' }]);

    // The one period is a row that can be typed over straight away, and the
    // next one lands after it rather than on top of it.
    expect(screen.getByText('Period 1')).toBeTruthy();
    expect((screen.getAllByLabelText('Starts')[0] as HTMLInputElement).value).toBe('08:00');
    fireEvent.click(screen.getByRole('button', { name: '+ Period' }));
    expect((latest as TimetableData | null)?.schools[1].slots[1]).toEqual({
      kind: 'period',
      n: 2,
      start: '08:50',
      end: '09:35',
    });
  });

  it('says a school has no times yet rather than counting down to an empty summary', () => {
    wrap(<SchoolsHarness />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove this period' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove this period' })[0]);

    expect(screen.getByText('No times yet')).toBeTruthy();
    expect(screen.queryByText(/^0 periods/)).toBeNull();
  });

  it('adds a period after the last one rather than on top of it', () => {
    let latest: TimetableData | null = null;
    wrap(<SchoolsHarness onChange={(data) => { latest = data; }} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Period' }));
    const saved = latest as TimetableData | null;
    expect(saved?.schools[0].slots[2]).toEqual({ kind: 'period', n: 3, start: '09:30', end: '10:15' });
  });

  it('never saves a blank school name, and puts the name back when the box is left empty', () => {
    // Clearing the box to retype the name used to delete the school and every
    // child's week at it on the next save, with nothing said and no way back.
    // The bin beside it refuses for exactly that reason; so does the box now.
    let latest: TimetableData | null = null;
    wrap(<SchoolsHarness onChange={(data) => { latest = data; }} />);

    const box = screen.getByLabelText('School name') as HTMLInputElement;
    fireEvent.change(box, { target: { value: '' } });
    expect(latest).toBeNull();
    expect(box.value).toBe('');

    fireEvent.blur(box);
    expect(box.value).toBe('Gymnasium');
    expect(latest).toBeNull();
    // And it says why the name came back, rather than only undoing the typing.
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renames a school as it is typed, so the card beside it keeps up', () => {
    let latest: TimetableData | null = null;
    wrap(<SchoolsHarness onChange={(data) => { latest = data; }} />);

    const box = screen.getByLabelText('School name') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'Gymnasium am Rhein' } });
    expect((latest as TimetableData | null)?.schools[0].name).toBe('Gymnasium am Rhein');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps a break named with the word somebody typed when its name box is emptied', () => {
    // A break saved without a name used to be dropped; that was fixed by never
    // creating one ("+ Break" starts out named "Break"), but a break
    // whose name was cleared to retype it was still thrown away, times and all.
    let latest: TimetableData | null = null;
    wrap(<SchoolsHarness onChange={(data) => { latest = data; }} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Break' }));
    const label = screen.getByLabelText('Break name') as HTMLInputElement;
    expect(label.value).toBe('Break');

    fireEvent.change(label, { target: { value: 'Frühstückspause' } });
    fireEvent.change(label, { target: { value: '' } });
    const slots = (latest as TimetableData | null)?.schools[0].slots ?? [];
    expect(slots[slots.length - 1]).toMatchObject({ kind: 'break', label: 'Frühstückspause' });

    fireEvent.blur(label);
    expect(label.value).toBe('Frühstückspause');
  });

  it('adds a day that is different already named, with its date still to answer', () => {
    // A row with no name was thrown away on the next save while staying on
    // screen looking real, and a date seeded to today read as an answer.
    wrap(<SchoolsHarness />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add a day' }));
    const date = screen.getByLabelText('Date') as HTMLInputElement;
    const names = screen.getAllByLabelText('What is it called?') as HTMLInputElement[];
    const name = names[names.length - 1];

    expect(date.value).toBe('');
    expect(name.value).not.toBe('');
    expect(name.value).toBe(name.placeholder);
  });

  it('spells out which week is which once the weeks alternate', () => {
    wrap(<SchoolsHarness />);
    expect(screen.queryByText(/is week/)).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Odd week numbers are A' }));
    expect(screen.getByText(/This week \(week \d+\) is week [AB]\. Next week is week [AB]\./)).toBeTruthy();
  });
});

describe('SubjectsTab', () => {
  it('renames a subject for everybody at once', () => {
    let latest: TimetableData | null = null;
    wrap(<SubjectsHarness onChange={(data) => { latest = data; }} />);

    const names = screen.getAllByLabelText('Name');
    fireEvent.change(names[0], { target: { value: 'Mathematik' } });
    expect((latest as TimetableData | null)?.subjects[0].name).toBe('Mathematik');
  });

  it('asks before taking a subject off the timetables that use it', async () => {
    let latest: TimetableData | null = null;
    wrap(<SubjectsHarness onChange={(data) => { latest = data; }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Mathe' }));
    expect(confirm.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'danger',
        message: 'Remove "Mathe"? It comes off every timetable that uses it.',
      }),
    );
    await waitFor(() => expect((latest as TimetableData | null)?.subjects.map((s) => s.id)).toEqual(['de']));
  });

  it('does not ask about a subject nobody is using', async () => {
    let latest: TimetableData | null = null;
    wrap(<SubjectsHarness onChange={(data) => { latest = data; }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Deutsch' }));
    await waitFor(() => expect((latest as TimetableData | null)?.subjects.map((s) => s.id)).toEqual(['ma']));
    expect(confirm.ask).not.toHaveBeenCalled();
  });

  it('writes out who has a subject, so two Ls are not the same dot', () => {
    const members = [person('leon', 'Leon'), person('lena', 'Lena')];
    wrap(<SubjectsHarness members={members} initial={everyoneHasMaths(members)} />);

    expect(screen.getByText('Leon, Lena')).toBeTruthy();
    expect(screen.getByTitle('Leon')).toBeTruthy();
    expect(screen.getByTitle('Lena')).toBeTruthy();
    expect(screen.getByText('Used by Leon, Lena')).toBeTruthy();
  });

  it('counts a big household instead of running the names off the row', () => {
    const members = ['Leon', 'Lena', 'Mia', 'Ben', 'Zoe'].map((name) => person(name.toLowerCase(), name));
    wrap(<SubjectsHarness members={members} initial={everyoneHasMaths(members)} />);

    expect(screen.getByText('5 people')).toBeTruthy();
    // Three faces fit the column; the count and the hover carry the other two.
    expect(screen.getByTitle('Mia')).toBeTruthy();
    expect(screen.queryByTitle('Ben')).toBeNull();
    expect(screen.getByTitle('Leon, Lena, Mia, Ben, Zoe')).toBeTruthy();
    expect(screen.getByText('Used by Leon, Lena, Mia, Ben, Zoe')).toBeTruthy();
  });

  it('keeps the button that adds a subject out of the scrolling list', () => {
    // A household's catalogue arrives seventeen subjects long and the list
    // scrolls, so at the end of the rows the one control the screen is for sat
    // hundreds of pixels below the bottom of the pane on arrival.
    wrap(<SubjectsHarness />);

    const add = screen.getByRole('button', { name: '+ Add subject' });
    expect(add.closest('.overflow-y-auto')).toBeNull();
    // The rows themselves are the part that scrolls.
    expect(screen.getByDisplayValue('Ma').closest('.overflow-y-auto')).not.toBeNull();
  });

  it('puts the cursor in the new subject, which lands at the end of the list', () => {
    wrap(<SubjectsHarness />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add subject' }));
    // Focusing the new row brings it on screen, and leaves the cursor on the
    // placeholder code that is the next thing to change.
    expect(document.activeElement).toBe(screen.getByDisplayValue('New'));
  });

  it('says nothing at all about a subject nobody has', () => {
    wrap(<SubjectsHarness />);
    // Mathe is Leon's; Deutsch is on nobody's week and leaves its column bare.
    expect(screen.getAllByText(/^Used by /)).toHaveLength(1);
    expect(screen.getByText('Used by Leon')).toBeTruthy();
  });
});
