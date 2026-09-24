// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import enUSCore from '@/translations/en-US/core.json';
import { DEFAULT_MODULE_STYLE, type FullscreenChoreChartConfig } from '@/types/config';
import type { FamilyMember } from '@/types/family';
import type { ChoreDefinition } from '@/types/config';

/**
 * The fullscreen chart's half of "a negative balance with nothing on screen".
 * It shares `useChoreData` with the card chart, so this drives a real tap
 * through the real module and checks the sentence reaches the toast strip.
 */

let postResponse: Record<string, unknown> = { completions: [], changed: true };

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: vi.fn(async () => ({ ok: true, json: async () => postResponse } as unknown as Response)),
}));

const stamp = '2026-01-01T00:00:00.000Z';
const noah: FamilyMember = { id: 'kid-1', name: 'Noah', emoji: '', color: '#8b5cf6', createdAt: stamp, updatedAt: stamp };
const familyResult = { members: [noah], groups: [], loading: false, loaded: true, error: null };

vi.mock('@/hooks/useFamilyData', () => ({ useFamilyData: () => familyResult }));

const chores: ChoreDefinition[] = [{
  id: 'chore-1', name: 'Load the dishwasher', emoji: '', points: 3, frequency: 'daily',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['kid-1'], rotation: 'fixed',
}];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Stable references: the hook mirrors each result into state from an effect
// keyed on it, so a fresh object per render would re-render forever.
const choreDataResult = [{ chores }, null] as const;
const rewardsResult = [{ balances: { 'kid-1': 0 }, rewards: [], redemptions: [] }, null] as const;
// Seeded as done, so the tap under test is an un-tick.
const completionsResult = [{ completions: [{ choreId: 'chore-1', memberId: 'kid-1', date: today() }], today: today() }, null] as const;

vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: (url: string) => {
    if (url.includes('/api/chores/data')) return choreDataResult;
    if (url.includes('/api/rewards')) return rewardsResult;
    return completionsResult;
  },
}));

const { default: FullscreenChoreChartModule } = await import('../FullscreenChoreChartModule');

const config = {
  view: 'chores', showRewardsButton: false, weekStartDay: 'monday', weekProgress: 'chips',
  layout: 'by-time', showPoints: true, showStreaks: true, showTimeOfDay: true,
  allowDisplayComplete: true, darkMode: true, density: 'cozy', typographySize: 'medium',
} as FullscreenChoreChartConfig;

beforeEach(() => { postResponse = { completions: [], changed: true }; });
afterEach(cleanup);

async function open() {
  render(
    <I18nProvider locale="en-US" blob={{ modules: enUSModules, core: enUSCore }}>
      <FullscreenChoreChartModule config={config} style={DEFAULT_MODULE_STYLE} />
    </I18nProvider>,
  );
  await act(async () => {});
  return screen.getByRole('button', { name: /Load the dishwasher/ });
}

describe('un-ticking past a spent balance on the fullscreen chart', () => {
  it('puts the sentence in the toast strip instead of swallowing it', async () => {
    postResponse = { completions: [], changed: true, overspent: { memberId: 'kid-1', balance: -4 } };
    const row = await open();

    fireEvent.click(row);

    await waitFor(() => expect(screen.getByTestId('chore-overspent-toast')).not.toBeNull());
    expect(screen.getByTestId('chore-overspent-toast').textContent)
      .toContain('Noah already spent those tickets, so the balance is now -4. 4 more tickets to earn.');
  });

  it('says nothing when the balance stayed where it was', async () => {
    const row = await open();

    fireEvent.click(row);

    await act(async () => {});
    expect(screen.queryByTestId('chore-overspent-toast')).toBeNull();
  });
});
