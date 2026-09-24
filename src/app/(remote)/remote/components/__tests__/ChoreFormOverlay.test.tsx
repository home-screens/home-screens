// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import type { ChoreDefinition } from '@/types/config';
import type { FamilyMember } from '@/types/family';
import ChoreFormOverlay from '../ChoreFormOverlay';

const stamp = '2026-01-01T00:00:00.000Z';
const members: FamilyMember[] = [
  { id: 'ava', name: 'Ava', emoji: '', color: '#f59e0b', createdAt: stamp, updatedAt: stamp },
  { id: 'ben', name: 'Ben', emoji: '', color: '#3b82f6', createdAt: stamp, updatedAt: stamp },
];

function render(children: ReactNode) {
  return renderUI(children, {
    wrapper: ({ children }) => (
      <I18nProvider locale="en-US" blob={{ core, modules, remote }}>{children}</I18nProvider>
    ),
  });
}

/** The seven day circles, in week order, with whether each one is on. */
function dayRow() {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
    (name) => screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true',
  );
}

/** The household's day, handed down from the Chores tab. */
const TODAY = '2026-09-28';

afterEach(cleanup);

describe('a one-time chore on the phone', () => {
  // At 5:30 pm Sunday in Chicago (or 10:30 pm on a UTC phone) a Berlin
  // household is already on Monday. "Just today" has to mean Monday: the
  // phone's Sunday is a day the wall has left, and the chore would never show.
  it('starts on the household day, not the phone\'s', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T22:30:00Z'));
    try {
      render(<ChoreFormOverlay members={members} groups={[]} familyReady today={TODAY} onSubmit={vi.fn()} onBack={() => {}} />);
      fireEvent.change(screen.getByDisplayValue('Daily'), { target: { value: 'once' } });
      expect(screen.getByDisplayValue(TODAY)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('picking the days of a new chore on the phone', () => {
  // The audit's repro, run through the real form: name it, set it to Weekly,
  // tap the two days you want. It used to save the other five.
  it('saves exactly the days that were tapped', () => {
    const onSubmit = vi.fn<(data: Omit<ChoreDefinition, 'id'>) => void>();
    render(<ChoreFormOverlay members={members} groups={[]} familyReady today={TODAY} onSubmit={onSubmit} onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Chore name...'), { target: { value: 'Vacuum' } });
    fireEvent.change(screen.getByDisplayValue('Daily'), { target: { value: 'weekly' } });

    expect(dayRow()).toEqual([false, false, false, false, false, false, false]);

    fireEvent.click(screen.getByRole('button', { name: 'Tue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fri' }));
    expect(dayRow()).toEqual([false, false, true, false, false, true, false]);

    fireEvent.click(screen.getByRole('button', { name: /Ava/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Chore' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Vacuum', frequency: 'weekly', daysOfWeek: [2, 5] });
  });

  it('leaves a daily chore on every day', () => {
    render(<ChoreFormOverlay members={members} groups={[]} familyReady today={TODAY} onSubmit={vi.fn()} onBack={() => {}} />);
    expect(dayRow()).toEqual([true, true, true, true, true, true, true]);
  });

  it('will not save a weekly chore with no days, and says which row needs a tap', () => {
    const onSubmit = vi.fn();
    render(<ChoreFormOverlay members={members} groups={[]} familyReady today={TODAY} onSubmit={onSubmit} onBack={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Chore name...'), { target: { value: 'Vacuum' } });
    fireEvent.change(screen.getByDisplayValue('Daily'), { target: { value: 'weekly' } });
    fireEvent.click(screen.getByRole('button', { name: /Ava/ }));

    const submit = screen.getByRole('button', { name: 'Add Chore' });
    expect(submit.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Select at least one day')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Thu' }));
    expect(submit.hasAttribute('disabled')).toBe(false);
    fireEvent.click(submit);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ daysOfWeek: [4] });
  });

  it('keeps the days of a chore being edited when its frequency changes', () => {
    const chore: ChoreDefinition = {
      id: 'c1', name: 'Make your bed', emoji: '', points: 1, frequency: 'weekly',
      daysOfWeek: [1, 3], timeOfDay: 'morning', assigneeIds: ['ava'], rotation: 'fixed',
    };
    render(<ChoreFormOverlay initial={chore} members={members} groups={[]} familyReady today={TODAY} onSubmit={vi.fn()} onBack={() => {}} />);

    expect(dayRow()).toEqual([false, true, false, true, false, false, false]);
    fireEvent.change(screen.getByDisplayValue('Weekly'), { target: { value: 'biweekly' } });
    expect(dayRow()).toEqual([false, true, false, true, false, false, false]);
  });
});

describe('the rest of the chore form copy', () => {
  it('says what a ticket is next to the tickets field', () => {
    render(<ChoreFormOverlay members={members} groups={[]} familyReady today={TODAY} onSubmit={vi.fn()} onBack={() => {}} />);
    expect(screen.getByText('How many tickets a kid earns for doing this chore. Tickets buy rewards.')).toBeTruthy();
  });

  it('promises only that the chore goes away when deleting it', () => {
    const chore: ChoreDefinition = {
      id: 'c1', name: 'Make your bed', emoji: '', points: 1, frequency: 'daily',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'morning', assigneeIds: ['ava'], rotation: 'fixed',
    };
    render(<ChoreFormOverlay initial={chore} members={members} groups={[]} familyReady today={TODAY} onSubmit={vi.fn()} onDelete={vi.fn()} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Chore' }));
    const sheet = screen.getByText('Delete "Make your bed"?').parentElement!;
    expect(sheet.textContent).toContain('Tickets the kids have already earned for it stay on their cards.');
    expect(sheet.textContent).not.toContain('completion history');
  });
});
