// @vitest-environment jsdom

/**
 * The meal planner window by keyboard: every cell of the week is a stop on
 * Tab and opens with Enter, an empty one says what it plans, and focus goes
 * into what opened and back to the cell when it closes.
 */

import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import { useEditorStore } from '@/stores/editor-store';
import type { MealSettings, PlannedMeal, SavedMeal, ScreenConfiguration } from '@/types/config';
import type { MealEdit } from '@/lib/meal-client';

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  isSessionExpired: () => false,
  throwIfNotOk: () => {},
}));

import MealPlannerModal from '..';

const MEALS: SavedMeal[] = [
  { id: 'tacos', name: 'Tacos', emoji: '🌮', category: 'main' },
  { id: 'pizza', name: 'Pizza', emoji: '🍕', category: 'main' },
];
const PLAN: PlannedMeal[] = [{ date: '2026-09-21', slot: 'dinner', mealId: 'tacos' }];
const SETTINGS = { enabledSlots: ['dinner'], weekStartDay: 'monday', defaultSlotTimes: {} } as unknown as MealSettings;

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ core, editor, modules, remote }}>{children}</I18nProvider>;
}

/** The window over a plan its edits are applied to, as the data hook does. */
function Planner() {
  const [plan, setPlan] = useState(PLAN);
  return (
    <MealPlannerModal
      loaded
      savedMeals={MEALS}
      plan={plan}
      settings={SETTINGS}
      groceryChecked={{}}
      onToggleGroceryItem={() => {}}
      accentColor="#f59e0b"
      onUpdate={(edit: MealEdit) => setPlan((p) => edit({ savedMeals: MEALS, plan: p }).plan ?? p)}
      onClose={() => {}}
    />
  );
}

function renderWindow() {
  return render(<Planner />, { wrapper: Wrapper });
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers({ toFake: ['Date'] });
  // Noon on Monday 21 September in Chicago.
  vi.setSystemTime(new Date('2026-09-21T17:00:00Z'));
  useEditorStore.setState({
    config: { settings: { timezone: 'America/Chicago', timeFormat: '12h' } } as unknown as ScreenConfiguration,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useEditorStore.setState({ config: null });
});

describe('the meal planner window by keyboard', () => {
  it('opens an empty cell with Enter, and the picked meal keeps the focus there', () => {
    renderWindow();
    const empty = screen.getByRole('button', { name: 'Plan Dinner for Tuesday 9/22' });
    expect(empty.tabIndex).toBe(0);
    expect(empty.textContent).toBe('+');

    empty.focus();
    fireEvent.keyDown(empty, { key: 'Enter' });
    const picker = screen.getByRole('dialog', { name: 'Choose a Meal' });
    // Typing goes straight to the search.
    expect(document.activeElement).toBe(within(picker).getByRole('textbox'));

    fireEvent.click(within(picker).getByText('Pizza'));
    // The same cell, now planned, still has the keyboard.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pizza, Dinner, Tuesday 9/22' }));
    expect(document.activeElement).toBe(empty);
  });

  it('opens a planned meal with Enter, moves into it, and comes back on Escape', () => {
    renderWindow();
    const cell = screen.getByRole('button', { name: 'Tacos, Dinner, Monday 9/21' });
    expect(cell.tabIndex).toBe(0);

    cell.focus();
    fireEvent.keyDown(cell, { key: 'Enter' });
    const popover = screen.getByTestId('meal-popover');
    expect(document.activeElement).toBe(popover);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('meal-popover')).toBeNull();
    expect(document.activeElement).toBe(cell);
  });

  it('leaves the keys of the serving time and remove buttons to them', () => {
    renderWindow();
    const cell = screen.getByRole('button', { name: 'Tacos, Dinner, Monday 9/21' });
    const remove = within(cell).getByRole('button', { name: 'Remove Tacos' });
    fireEvent.keyDown(remove, { key: 'Enter' });
    expect(screen.queryByTestId('meal-popover')).toBeNull();
  });
});
