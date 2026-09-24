// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import modules from '@/translations/en-US/modules.json';
import { I18nProvider } from '@/i18n/provider';
import { useEditorStore } from '@/stores/editor-store';
import type { ChoreDefinition, MealSettings, ModuleInstance, ScreenConfiguration } from '@/types/config';
import type { FamilyMember } from '@/types/family';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), set: vi.fn() }));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (url: string, init?: RequestInit) => mocks.fetch(url, init),
  isSessionExpired: () => false,
  throwIfNotOk: () => {},
}));
vi.mock('@/hooks/useModuleConfig', () => ({
  useModuleConfig: (mod: ModuleInstance) => ({ config: mod.config, set: mocks.set }),
}));

import { useEditorHouseholdToday } from '../useEditorHouseholdClock';
import { WeeklyPreview } from '../ChoreChartModal';
import MealPlannerModal from '../meal-planner-modal';
import { CountdownConfigSection } from '../config-sections/CountdownConfigSection';
import HolidayPickerModal from '../HolidayPickerModal';

// 00:30 on Monday 21 September in Auckland is still Sunday the 20th in UTC
// and in Chicago, so a laptop in either zone disagrees with the household
// about the day and, for a Monday-start week, about the week.
const AUCKLAND_MONDAY = new Date('2026-09-20T12:30:00Z');

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ core, editor, modules }}>{children}</I18nProvider>;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AUCKLAND_MONDAY);
  useEditorStore.setState({
    config: { settings: { timezone: 'Pacific/Auckland' } } as unknown as ScreenConfiguration,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.fetch.mockReset();
  mocks.set.mockReset();
  useEditorStore.setState({ config: null });
});

describe('the editor household clock', () => {
  it("is the household's day, not the laptop's", () => {
    const { result } = renderHook(() => useEditorHouseholdToday());
    expect(result.current).toBe('2026-09-21');
  });
});

describe('chore chart week preview', () => {
  it("marks the household's today and lays out the household's week", () => {
    const kid: FamilyMember = { id: 'kid', name: 'Sam', color: '#60a5fa', createdAt: '', updatedAt: '' };
    const chore: ChoreDefinition = {
      id: 'car', name: 'Clean the car', emoji: '', points: 1, frequency: 'once', daysOfWeek: [],
      specificDate: '2026-09-21', timeOfDay: 'anytime', assigneeIds: ['kid'], rotation: 'fixed',
    };
    render(
      <WeeklyPreview chores={[chore]} members={[kid]} groups={[]} weekStartDay="monday" accentColor="#f59e0b" />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText('Today (Monday)')).toBeTruthy();
    // A one-time chore for today is in this week, not next week.
    expect(screen.getByText('Clean the car')).toBeTruthy();
  });

  it('says in plain words when kids take turns at a chore', () => {
    const kids: FamilyMember[] = ['Ruby', 'Theo'].map((name) => ({
      id: name, name, color: '#60a5fa', createdAt: '', updatedAt: '',
    }));
    const chore: ChoreDefinition = {
      id: 'table', name: 'Set the table', emoji: '', points: 1, frequency: 'daily', daysOfWeek: [],
      timeOfDay: 'evening', assigneeIds: ['Ruby', 'Theo'], rotation: 'rotate-weekly',
    };
    render(
      <WeeklyPreview chores={[chore]} members={kids} groups={[]} weekStartDay="monday" accentColor="#f59e0b" />,
      { wrapper: Wrapper },
    );
    expect(screen.getAllByText(modules['chore-chart'].choreSummary.takingTurns).length).toBe(7);
    expect(document.body.textContent).not.toContain('rot');
  });
});

describe('meal planner', () => {
  it("opens on the household's week with its today marked", () => {
    const settings = { enabledSlots: ['dinner'], weekStartDay: 'monday', defaultSlotTimes: {} } as unknown as MealSettings;
    render(
      <MealPlannerModal savedMeals={[]} plan={[]} settings={settings} accentColor="#f59e0b" onUpdate={() => {}} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText(/Sep 21/)).toBeTruthy();
    expect(screen.queryByText(/Sep 14/)).toBeNull();
    expect(screen.getByText(editor.mealPlannerModal.weekGrid.todayLabel)).toBeTruthy();
  });

  it('names its week arrows for screen readers', () => {
    const settings = { enabledSlots: ['dinner'], weekStartDay: 'monday', defaultSlotTimes: {} } as unknown as MealSettings;
    render(
      <MealPlannerModal savedMeals={[]} plan={[]} settings={settings} accentColor="#f59e0b" onUpdate={() => {}} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByText(/Sep 28/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByText(/Sep 21/)).toBeTruthy();
  });

  it("follows today onto the new week when left open past the household's Sunday midnight", () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // 11:58 pm Sunday 20 September in Auckland.
    vi.setSystemTime(new Date('2026-09-20T11:58:00Z'));
    const settings = { enabledSlots: ['dinner'], weekStartDay: 'monday', defaultSlotTimes: {} } as unknown as MealSettings;
    render(
      <MealPlannerModal savedMeals={[]} plan={[]} settings={settings} accentColor="#f59e0b" onUpdate={() => {}} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText(/Sep 14/)).toBeTruthy();

    act(() => { vi.advanceTimersByTime(3 * 60_000); });
    expect(screen.getByText(/Sep 21/)).toBeTruthy();
    expect(screen.queryByText(/Sep 14/)).toBeNull();
    expect(screen.getByText(editor.mealPlannerModal.weekGrid.todayLabel)).toBeTruthy();
  });

  it('names its week arrows for screen readers', () => {
    const settings = { enabledSlots: ['dinner'], weekStartDay: 'monday', defaultSlotTimes: {} } as unknown as MealSettings;
    render(
      <MealPlannerModal savedMeals={[]} plan={[]} settings={settings} accentColor="#f59e0b" onUpdate={() => {}} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByText(/Sep 28/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByText(/Sep 21/)).toBeTruthy();
  });
});

describe('countdown settings', () => {
  it("starts a new event this time tomorrow on the household's clock, so it is not already past", () => {
    const mod = { id: 'm', type: 'countdown', config: { events: [] } } as unknown as ModuleInstance;
    render(<CountdownConfigSection mod={mod} screenId="s" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: core.actions.add }));
    expect(mocks.set).toHaveBeenCalledWith({
      events: [expect.objectContaining({ date: '2026-09-22T00:30' })],
    });
  });

  it('rolls a new event over the end of the month and the year', () => {
    // 21:15 on December 31 in Chicago.
    vi.setSystemTime(new Date('2027-01-01T03:15:00Z'));
    useEditorStore.setState({
      config: { settings: { timezone: 'America/Chicago' } } as unknown as ScreenConfiguration,
    });
    const mod = { id: 'm', type: 'countdown', config: { events: [] } } as unknown as ModuleInstance;
    render(<CountdownConfigSection mod={mod} screenId="s" />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: core.actions.add }));
    expect(mocks.set).toHaveBeenCalledWith({
      events: [expect.objectContaining({ date: '2027-01-01T21:15' })],
    });
  });
});

describe('holiday picker', () => {
  it("keeps a holiday that is happening today at home and drops yesterday's", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes('countries')) return Response.json([{ countryCode: 'NZ', name: 'New Zealand' }]);
      if (url.includes('year=2026')) {
        return Response.json([
          { id: 'y', title: 'Yesterday Fest', start: '2026-09-20' },
          { id: 't', title: 'Today Fest', start: '2026-09-21' },
        ]);
      }
      return Response.json([]);
    });
    render(
      <HolidayPickerModal initialCountry="NZ" existingEvents={[]} onConfirm={() => {}} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(screen.getByText('Today Fest')).toBeTruthy());
    expect(screen.queryByText('Yesterday Fest')).toBeNull();
  });

  it("offers this year's Halloween on Halloween evening at home, as a friendly date", async () => {
    // 8 PM on October 31 in Chicago is already November 1 in UTC.
    vi.setSystemTime(new Date('2026-11-01T01:00:00Z'));
    useEditorStore.setState({
      config: { settings: { timezone: 'America/Chicago' } } as unknown as ScreenConfiguration,
    });
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes('countries')) return Response.json([{ countryCode: 'US', name: 'United States' }]);
      if (url.includes('year=2027')) return Response.json([{ id: 'ny', title: "New Year's Day", start: '2027-01-01' }]);
      return Response.json([]);
    });
    render(
      <HolidayPickerModal initialCountry="US" existingEvents={[]} onConfirm={() => {}} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    const row = await waitFor(() => screen.getByText('Halloween').closest('label')!);
    expect(row.textContent).toContain('Sat, Oct 31');
    expect(row.textContent).not.toContain('2027');
    // Next year's days carry their year; nothing shows the raw YYYY-MM-DD.
    expect(screen.getByText("New Year's Day").closest('label')!.textContent).toContain('Fri, Jan 1, 2027');
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
