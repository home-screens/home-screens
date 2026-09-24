// @vitest-environment jsdom

import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as renderUI, screen, within } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import modules from '@/translations/en-US/modules.json';
import { I18nProvider } from '@/i18n/provider';
import type { FamilyMember } from '@/types/family';
import type { TimetableData } from '@/types/timetables';
// A German household on a 24 hour clock, which is what every expectation reads.
// Its zone is set so the expectations hold whatever zone runs the tests.
const BERLIN = 'Europe/Berlin';
const storeSettings: { timeFormat: string; timezone: string } = { timeFormat: '24h', timezone: BERLIN };
vi.mock('@/stores/editor-store', () => ({
  useEditorStore: (select?: (state: unknown) => unknown) => {
    const store = { config: { settings: storeSettings } };
    return select ? select(store) : store;
  },
}));

import DatesTab, { upcomingNoteCount } from '../DatesTab';

function person(id: string, name: string): FamilyMember {
  return { id, name, color: '#60a5fa', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
}

const MEMBERS = [person('leon', 'Leon'), person('emma', 'Emma'), person('lina', 'Lina')];

/** Thursday 10 September 2026, in the evening. */
const NOW = new Date('2026-09-10T17:10:00Z');

function household(): TimetableData {
  return {
    schools: [
      {
        id: 'school-1',
        name: 'Gymnasium',
        slots: [
          { kind: 'period', n: 1, start: '07:50', end: '08:35' },
          { kind: 'period', n: 2, start: '08:40', end: '09:25' },
          { kind: 'period', n: 3, start: '09:45', end: '10:30' },
          { kind: 'period', n: 4, start: '10:35', end: '11:20' },
        ],
        weekCycle: { mode: 'parity', oddWeek: 'A' },
        specialDays: [{ date: '2026-09-14', label: 'Pädagogischer Tag', kind: 'off' }],
      },
    ],
    subjects: [
      { id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'triangle' },
      { id: 'de', code: 'De', name: 'Deutsch', color: '#f26363', icon: 'book' },
      { id: 'ge', code: 'Ge', name: 'Geschichte', color: '#e0a86e', icon: 'castle' },
    ],
    timetables: [
      {
        memberId: 'leon',
        schoolId: 'school-1',
        weeks: { A: { fri: { 1: { subjectId: 'de' }, 2: { subjectId: 'ma' }, 3: { subjectId: 'ma' }, 4: { subjectId: 'ge' } } } },
        notes: [
          { id: 'old', date: '2026-09-01', kind: 'bring', text: 'Alt' },
          { id: 'n1', date: '2026-09-11', kind: 'test', subjectId: 'ma', text: 'Mathe-Arbeit' },
          { id: 'n2', date: '2026-09-25', kind: 'cancelled', periods: [4] },
        ],
      },
      {
        memberId: 'emma',
        schoolId: 'school-1',
        weeks: { A: { fri: { 1: { subjectId: 'de' }, 2: { subjectId: 'ge' } } } },
        notes: [{ id: 'e1', date: '2026-09-11', kind: 'bring', text: 'Wanderschuhe' }],
      },
    ],
  };
}

function Harness({ initial, onChange, now = NOW }: { initial?: TimetableData; onChange?: (data: TimetableData) => void; now?: Date }) {
  const [data, setData] = useState(initial ?? household());
  return (
    <DatesTab
      data={data}
      members={MEMBERS}
      now={now}
      update={(change) => setData((current) => {
        const next = change(current);
        onChange?.(next);
        return next;
      })}
    />
  );
}

function render(props: { initial?: TimetableData; onChange?: (data: TimetableData) => void; now?: Date } = {}) {
  return renderUI(<Harness {...props} />, {
    wrapper: ({ children }) => (
      <I18nProvider locale="en-US" blob={{ core, editor, modules }}>{children}</I18nProvider>
    ),
  });
}

const rows = () => screen.queryAllByTestId('timetable-note-row');

afterEach(() => {
  cleanup();
  storeSettings.timezone = BERLIN;
});

describe('DatesTab list', () => {
  it('lists what is coming for the whole family by day, and hides what has passed', () => {
    render();
    const drawn = rows();
    expect(drawn).toHaveLength(3);
    expect(drawn.map((row) => row.getAttribute('data-kind'))).toEqual(['test', 'bring', 'cancelled']);
    expect(drawn[0].textContent).toContain('Leon');
    expect(drawn[0].textContent).toContain('Mathe');
    expect(drawn[0].textContent).toContain('Mathe-Arbeit');
    expect(drawn[1].textContent).toContain('Wanderschuhe');
    // The cancelled 4th period ends Leon's day at 10:30.
    expect(drawn[2].textContent).toContain('Geschichte');
    expect(drawn[2].textContent).toContain('done at 10:30');
    // Tomorrow's group is named as such; the September 1 note is gone.
    expect(screen.getByText(/^Tomorrow · /)).toBeTruthy();
    expect(screen.queryByText('Alt')).toBeNull();
    // Both Friday dates, and the 25th (also a Friday), reach the wall on a Thursday evening.
    expect(screen.getAllByText('On the wall from Thursday evening')).toHaveLength(3);
  });

  it('narrows to one person from the rail, with counts', () => {
    render();
    const everyone = screen.getByRole('button', { name: /Everyone/ });
    expect(everyone.textContent).toContain('3');
    fireEvent.click(screen.getByRole('button', { name: /^Emma/ }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Wanderschuhe');
    // Lina has no timetable, so no rail entry.
    expect(screen.queryByRole('button', { name: /^Lina/ })).toBeNull();
  });

  it('says what it is for when nothing is coming', () => {
    const data = household();
    data.timetables = data.timetables.map((timetable) => ({ ...timetable, notes: [] }));
    render({ initial: data });
    expect(screen.getByText('Nothing coming up')).toBeTruthy();
    expect(upcomingNoteCount(data, BERLIN, NOW)).toBe(0);
    expect(upcomingNoteCount(household(), BERLIN, NOW)).toBe(3);
  });

  // 00:30 on Friday 11 September in Auckland is still Thursday the 10th in
  // UTC and in Chicago, so a laptop in either zone would call Friday
  // "Tomorrow" while the household is already living it.
  const AUCKLAND_JUST_AFTER_MIDNIGHT = new Date('2026-09-10T12:30:00Z');

  it("names today by the household's calendar, not the laptop's", () => {
    storeSettings.timezone = 'Pacific/Auckland';
    render({ now: AUCKLAND_JUST_AFTER_MIDNIGHT });
    expect(screen.getByText(/^Today · /)).toBeTruthy();
    expect(screen.queryByText(/^Tomorrow · /)).toBeNull();
  });

  it("counts upcoming dates from the household's today", () => {
    const data = household();
    data.timetables[0].notes!.push({ id: 'thu', date: '2026-09-10', kind: 'bring', text: 'Donnerstag' });
    // Thursday the 10th is already over in Auckland.
    expect(upcomingNoteCount(data, 'Pacific/Auckland', AUCKLAND_JUST_AFTER_MIDNIGHT)).toBe(3);
    expect(upcomingNoteCount(data, 'America/Chicago', AUCKLAND_JUST_AFTER_MIDNIGHT)).toBe(4);
  });

  it('removes a date', () => {
    const seen: TimetableData[] = [];
    render({ onChange: (data) => seen.push(data) });
    fireEvent.click(screen.getByRole('button', { name: /^Remove: Emma/ }));
    expect(rows()).toHaveLength(2);
    expect('notes' in seen[seen.length - 1].timetables[1]).toBe(false);
  });
});

describe('DatesTab form', () => {
  it('adds a test: the subjects offered are the ones on that day', () => {
    const seen: TimetableData[] = [];
    render({ onChange: (data) => seen.push(data) });
    fireEvent.click(screen.getByRole('button', { name: 'Add a date' }));
    const form = screen.getByTestId('timetable-note-form');
    // Nobody picked yet: Add is off and the form says who first.
    expect((within(form).getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(form).getByRole('button', { name: /^Leon/ }));
    fireEvent.change(within(form).getByLabelText('Day'), { target: { value: '2026-09-11' } });
    expect(screen.getByTestId('timetable-note-dayline').textContent).toBe('Friday, week A. Leon has school from 07:50 to 11:20.');

    const subjects = within(form).getByRole('group', { name: 'Which subject' });
    expect(within(subjects).getAllByRole('button').map((b) => b.textContent)).toEqual(['DeDeutsch', 'MaMathe', 'GeGeschichte']);
    fireEvent.click(within(subjects).getByRole('button', { name: /Geschichte/ }));
    fireEvent.change(within(form).getByLabelText(/Name it/), { target: { value: 'Klausur' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }));

    const notes = seen[seen.length - 1].timetables[0].notes!;
    expect(notes.map((n) => n.id)).toHaveLength(4);
    expect(notes.find((n) => n.text === 'Klausur')).toMatchObject({ date: '2026-09-11', kind: 'test', subjectId: 'ge' });
    expect(screen.queryByTestId('timetable-note-form')).toBeNull();
  });

  it('adds lessons that are off, ticking a double as one box, and says the new end', () => {
    const seen: TimetableData[] = [];
    render({ onChange: (data) => seen.push(data) });
    fireEvent.click(screen.getByRole('button', { name: /^Leon/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a date' }));
    const form = screen.getByTestId('timetable-note-form');
    fireEvent.change(within(form).getByLabelText('Day'), { target: { value: '2026-09-11' } });
    fireEvent.click(within(form).getByRole('radio', { name: 'Lesson off' }));

    const boxes = within(form).getAllByRole('checkbox');
    // Mathe over periods 2 and 3 is one box.
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['1. Deutsch', '2–3. Mathe', '4. Geschichte']);
    fireEvent.click(within(form).getByRole('checkbox', { name: '4. Geschichte' }));
    expect(screen.getByTestId('timetable-note-offline').textContent).toBe('Leon is done at 10:30 instead of 11:20.');
    fireEvent.click(within(form).getByRole('checkbox', { name: '1. Deutsch' }));
    fireEvent.click(within(form).getByRole('checkbox', { name: '4. Geschichte' }));
    expect(screen.getByTestId('timetable-note-offline').textContent).toBe('Leon starts at 08:40 instead of 07:50.');
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }));

    const added = seen[seen.length - 1].timetables[0].notes!.find((n) => n.kind === 'cancelled' && n.date === '2026-09-11');
    expect(added?.periods).toEqual([1]);
  });

  it('keeps only something to bring on a day with no school', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: /^Emma/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a date' }));
    const form = screen.getByTestId('timetable-note-form');
    // A Saturday, then the school's own day off: both close the day.
    fireEvent.change(within(form).getByLabelText('Day'), { target: { value: '2026-09-12' } });
    expect(screen.getByTestId('timetable-note-dayline').textContent).toBe('Saturday, no school. Something to bring still works, for a trip or a party.');
    expect((within(form).getByRole('radio', { name: 'Test' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(form).getByRole('radio', { name: 'Lesson off' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText('Day'), { target: { value: '2026-09-14' } });
    expect(screen.getByTestId('timetable-note-dayline').textContent).toContain('Monday, no school');
    fireEvent.click(within(form).getByRole('radio', { name: 'Something to bring' }));
    expect((within(form).getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText('What to bring'), { target: { value: 'Laterne' } });
    expect((within(form).getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('changes a date in place and can be cancelled', () => {
    const seen: TimetableData[] = [];
    render({ onChange: (data) => seen.push(data) });
    fireEvent.click(screen.getByRole('button', { name: /^Change: Leon, Mathe/ }));
    const form = screen.getByTestId('timetable-note-form');
    expect(screen.getByText('Change a date')).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/Name it/), { target: { value: 'Mathe-Klausur' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    const notes = seen[seen.length - 1].timetables[0].notes!;
    expect(notes).toHaveLength(3);
    expect(notes.find((n) => n.id === 'n1')?.text).toBe('Mathe-Klausur');

    fireEvent.click(screen.getByRole('button', { name: /^Change: Leon, Mathe/ }));
    fireEvent.click(within(screen.getByTestId('timetable-note-form')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('timetable-note-form')).toBeNull();
    expect(seen).toHaveLength(1);
  });
});
