// @vitest-environment jsdom

import { DEFAULT_CHORE_SETTINGS } from '@/lib/chore-bonus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import type { ChoreChartConfig, ChoreDefinition } from '@/types/config';
import type { FamilyMember } from '@/types/family';
import { isoDateInTZ } from '@/lib/timezone';
import { HouseholdClockProvider } from '../../household-clock';

/**
 * What the phone and the kids' page read, and how often. The kids' page only
 * ever shows yesterday and today, so it asks for the recent history; the
 * grown-ups' history strip needs all of it. The ticket count on the Today view
 * and the Rewards view read the same answer, so one poll feeds both.
 */

const reads: string[] = [];
const reward = { id: 'rw-1', name: 'Movie night', emoji: '', description: '', cost: 5, memberIds: [], enabled: true };

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: vi.fn(async (url: string) => {
    reads.push(url);
    if (url.startsWith('/api/rewards')) {
      return { ok: true, status: 200, json: async () => ({ balances: { 'kid-1': 7 }, rewards: [reward], redemptions: [], revision: 'r1' }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ completions: [] }) } as unknown as Response;
  }),
  isSessionExpired: () => false,
  throwIfNotOk: (res: Response) => res,
}));

const stamp = '2026-01-01T00:00:00.000Z';
const noah: FamilyMember = { id: 'kid-1', name: 'Noah', emoji: '', color: '#8b5cf6', createdAt: stamp, updatedAt: stamp };

vi.mock('@/hooks/useFamilyData', () => ({
  useFamilyData: () => ({ members: [noah], groups: [], revision: 'r1', loading: false, loaded: true, error: null }),
}));

const { default: ChoresTab } = await import('../ChoresTab');

const chore: ChoreDefinition = {
  id: 'chore-1', name: 'Load the dishwasher', emoji: '', points: 3, frequency: 'daily',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['kid-1'], rotation: 'fixed',
};

const baseConfig: ChoreChartConfig = {
  view: 'today', weekStartDay: 'monday', showPoints: true, showStreaks: true,
  showTimeOfDay: true, allowDisplayComplete: true, accentColor: '#f59e0b',
};

function wrapper({ children }: { children: ReactNode }) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <I18nProvider locale="en-US" blob={{ core, modules, remote }}>
      <HouseholdClockProvider timezone={zone} today={isoDateInTZ(new Date(), zone)} timeFormat="12h">{children}</HouseholdClockProvider>
    </I18nProvider>
  );
}

async function openTab(isAdmin: boolean, config: ChoreChartConfig = baseConfig) {
  render(<ChoresTab config={config} choreData={{ chores: [chore], settings: DEFAULT_CHORE_SETTINGS, revision: 'r1' }} isAdmin={isAdmin} />, { wrapper });
  await act(async () => {});
}

const rewardReads = () => reads.filter((url) => url.startsWith('/api/rewards')).length;
const choreReads = () => reads.filter((url) => url.startsWith('/api/chores'));

beforeEach(() => {
  reads.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('how much chore history each surface asks for', () => {
  it('the kids\' page asks for the recent days only', async () => {
    await openTab(false);
    expect(choreReads()).toEqual(['/api/chores?days=31']);
  });

  it('the family remote asks for all of it, for the history strip', async () => {
    await openTab(true);
    expect(choreReads()).toEqual(['/api/chores']);
  });
});

describe('one rewards poll for the ticket count and the Rewards view', () => {
  it('opening the Rewards view reads nothing new while the ticket count is already polling', async () => {
    await openTab(false);
    expect(rewardReads()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Rewards' }));
    await act(async () => {});

    expect(screen.getByText('Movie night')).toBeTruthy();
    expect(rewardReads()).toBe(1);
  });

  it('polls the rewards once per round with both on screen', async () => {
    await openTab(false);
    fireEvent.click(screen.getByRole('button', { name: 'Rewards' }));
    await act(async () => {});
    const before = rewardReads();

    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

    expect(rewardReads()).toBe(before + 1);
  });

  it('without the ticket count, reads the rewards only once the Rewards view opens', async () => {
    await openTab(false, { ...baseConfig, showPoints: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(rewardReads()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Rewards' }));
    await act(async () => {});

    expect(rewardReads()).toBe(1);
    expect(screen.getByText('Movie night')).toBeTruthy();
  });
});
