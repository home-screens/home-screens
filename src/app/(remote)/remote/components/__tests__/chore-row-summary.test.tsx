// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render as renderUI, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import type { ChoreDefinition } from '@/types/config';
import type { FamilyMember } from '@/types/family';
import ChoresManageView from '../ChoresManageView';

const stamp = '2026-01-01T00:00:00.000Z';
const members: FamilyMember[] = [
  { id: 'ava', name: 'Ava', emoji: '', color: '#f59e0b', createdAt: stamp, updatedAt: stamp },
];

function chore(overrides: Partial<ChoreDefinition>): ChoreDefinition {
  return {
    id: 'c1', name: 'Make your bed', emoji: '', points: 1, frequency: 'weekly',
    daysOfWeek: [2, 5], timeOfDay: 'morning', assigneeIds: ['ava'], rotation: 'fixed', ...overrides,
  };
}

function render(children: ReactNode) {
  return renderUI(children, {
    wrapper: ({ children }) => (
      <I18nProvider locale="en-US" blob={{ core, modules, remote }}>{children}</I18nProvider>
    ),
  });
}

function list(chores: ChoreDefinition[]) {
  render(
    <ChoresManageView
      members={members}
      groups={[]}
      familyReady
      chores={chores}
      today="2026-09-23"
      choreSettings={{ grabLimit: 1, grabHold: 'day' }}
      onOpenSettings={vi.fn()}
      onFamilyChanged={vi.fn()}
      onChoresChange={vi.fn()}
    />,
  );
}

afterEach(cleanup);

/**
 * Without the days on the row, a chore saved on the wrong days reads exactly
 * like one saved on the right ones, and nobody finds out until it fails to
 * appear on the wall.
 */
describe('the chore rows under Manage', () => {
  it('names the days a weekly chore runs on', () => {
    list([chore({})]);
    expect(screen.getByText('Weekly · Tue, Fri · Morning · 1 ticket')).toBeTruthy();
  });

  it('leaves the days off a chore that runs every day', () => {
    list([chore({ frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })]);
    expect(screen.getByText('Daily · Morning · 1 ticket')).toBeTruthy();
  });

  it('leaves the days off a one-time chore, which shows its date', () => {
    list([chore({ frequency: 'once', specificDate: '2026-10-31', daysOfWeek: [2] })]);
    expect(screen.getByText('One time · Sat, Oct 31 · Morning · 1 ticket')).toBeTruthy();
  });
});
