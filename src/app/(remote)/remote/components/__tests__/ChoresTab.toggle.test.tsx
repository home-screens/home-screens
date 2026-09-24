// @vitest-environment jsdom

import { DEFAULT_CHORE_SETTINGS } from '@/lib/chore-bonus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import type { ChoreChartConfig, ChoreCompletion, ChoreDefinition } from '@/types/config';
import type { FamilyMember } from '@/types/family';
import { UNCHECK_HOLD_MS } from '@/hooks/useHoldToUncheck';
import { isoDateInTZ } from '@/lib/timezone';
import { HouseholdClockProvider } from '../../household-clock';

/**
 * The tablet's half of "two kids ticking the same chore in the same second".
 * A bare toggle applies one flip per request, so two taps landing together
 * cancel out; the direction the tap meant makes the write idempotent.
 *
 * ChoresTab renders in two places and they behave differently, so both are
 * exercised here: /remote passes `isAdmin`, /chores does not, and that is what
 * decides whether un-checking needs a hold.
 */

const posted: Array<Record<string, unknown>> = [];
let seededCompletions: ChoreCompletion[] = [];

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body ?? '{}')));
      return { ok: true, status: 200, json: async () => ({ completions: seededCompletions, changed: true }) } as unknown as Response;
    }
    if (url.startsWith('/api/rewards')) {
      return { ok: true, status: 200, json: async () => ({ balances: {}, rewards: [], redemptions: [] }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ completions: seededCompletions }) } as unknown as Response;
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

const config: ChoreChartConfig = {
  view: 'today', weekStartDay: 'monday', showPoints: true, showStreaks: true,
  showTimeOfDay: true, allowDisplayComplete: true, accentColor: '#f59e0b',
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The household runs on this process's own zone unless a test says otherwise. */
let householdZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ core, modules, remote }}>
      <HouseholdClockProvider timezone={householdZone} today={isoDateInTZ(new Date(), householdZone)} timeFormat="12h">{children}</HouseholdClockProvider>
    </I18nProvider>
  );
}

/** `isAdmin` is what /remote passes and /chores does not. */
async function openTab(isAdmin: boolean) {
  render(<ChoresTab config={config} choreData={{ chores: [chore], settings: DEFAULT_CHORE_SETTINGS, revision: 'r1' }} isAdmin={isAdmin} />, { wrapper });
  // The mounted fetch mirrors the seeded completions into the row's state.
  await act(async () => {});
  return screen.getByRole('button', { name: /: Load the dishwasher$/ });
}

beforeEach(() => {
  posted.length = 0;
  seededCompletions = [];
  householdZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('the phone says which way the tap meant', () => {
  it('sends direction "complete" for an unfinished chore', async () => {
    const row = await openTab(true);

    fireEvent.click(row, { detail: 1 });

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ choreId: 'chore-1', memberId: 'kid-1', date: today(), direction: 'complete' });
  });

  it('sends direction "uncomplete" for a finished one', async () => {
    seededCompletions = [{ choreId: 'chore-1', memberId: 'kid-1', date: today() }];
    const row = await openTab(true);

    fireEvent.click(row, { detail: 1 });

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ direction: 'uncomplete' });
  });
});

describe('the kid view still guards un-checking', () => {
  it('a plain tap on a finished chore sends nothing', async () => {
    seededCompletions = [{ choreId: 'chore-1', memberId: 'kid-1', date: today() }];
    const row = await openTab(false);

    fireEvent.pointerDown(row);
    fireEvent.pointerUp(row);
    fireEvent.click(row, { detail: 1 });

    await act(async () => {});
    expect(posted).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toBe('Press and hold to un-check');
  });

  it('a press and hold sends direction "uncomplete"', async () => {
    seededCompletions = [{ choreId: 'chore-1', memberId: 'kid-1', date: today() }];
    const row = await openTab(false);

    vi.useFakeTimers();
    fireEvent.pointerDown(row);
    act(() => { vi.advanceTimersByTime(UNCHECK_HOLD_MS); });
    vi.useRealTimers();

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ direction: 'uncomplete' });
  });
});

describe('the part of the day that is lit up', () => {
  // 3:30 pm UTC is 10:30 am in Chicago and 5:30 pm in Berlin. A Berlin
  // household's evening chores are the ones due now, whatever zone the
  // phone in the kid's hand was left on.
  it('follows the household clock, not the phone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-23T15:30:00Z'));
    householdZone = 'Europe/Berlin';
    const evening: ChoreDefinition = { ...chore, id: 'chore-2', name: 'Feed the cat', timeOfDay: 'evening' };
    const morning: ChoreDefinition = { ...chore, id: 'chore-3', name: 'Make your bed', timeOfDay: 'morning' };
    render(
      <ChoresTab config={config} choreData={{ chores: [morning, evening], settings: DEFAULT_CHORE_SETTINGS, revision: 'r1' }} isAdmin />,
      { wrapper },
    );
    await act(async () => {});

    const lit = (label: string) => screen.getByText(label).style.color;
    expect(lit('Evening')).toBe('rgb(245, 158, 11)');
    expect(lit('Morning')).not.toBe('rgb(245, 158, 11)');
  });
});

/** The height a button reserves for a finger, read off its inline style (jsdom does no layout). */
function tapHeight(el: HTMLElement): number {
  return parseFloat(el.style.minHeight || el.style.height || '0');
}

describe('kid-sized tap targets', () => {
  it('gives the Yesterday / Today toggle and the Today / Rewards bar at least 44 px', async () => {
    await openTab(false);
    const toggle = screen.getByRole('group', { name: remote.choresTab.dayToggle.ariaLabel });
    for (const button of Array.from(toggle.querySelectorAll('button'))) {
      expect(tapHeight(button)).toBeGreaterThanOrEqual(44);
      expect(parseFloat(button.style.minWidth)).toBeGreaterThanOrEqual(44);
    }
    for (const name of [remote.choresTab.subNav.today, remote.choresTab.subNav.rewards]) {
      const tab = screen.getAllByRole('button', { name }).find((b) => b.textContent === name && !toggle.contains(b));
      expect(tab).toBeTruthy();
      expect(tapHeight(tab!)).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('the at home line', () => {
  // A household many hours from this machine, which stands in for the phone.
  const own = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const farHome = own === 'Pacific/Kiritimati' ? 'Etc/GMT+12' : 'Pacific/Kiritimati';

  it('shows for a grown-up whose phone is on another clock', async () => {
    householdZone = farHome;
    await openTab(true);
    expect(screen.getByTestId('at-home-pill').textContent).toMatch(/ at home$/);
  });

  it("never shows on the kids' page, which runs on a device at home", async () => {
    householdZone = farHome;
    await openTab(false);
    expect(screen.queryByTestId('at-home-pill')).toBeNull();
  });
});
