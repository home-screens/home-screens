// @vitest-environment jsdom

/**
 * The meal planner window over a plan that lives in Mealie, and the courses
 * every family gets: the meal popover, the picker it opens, and planning
 * pausing while Mealie is not answering.
 */

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import { useEditorStore } from '@/stores/editor-store';
import type { MealSettings, PlannedMeal, SavedMeal, ScreenConfiguration } from '@/types/config';
import type { MealEdit } from '@/lib/meal-client';
import type { MealieWireBlock } from '@/lib/meal-sources';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (url: string, init?: RequestInit) => mocks.fetch(url, init),
  isSessionExpired: () => false,
  throwIfNotOk: () => {},
}));

import MealPlannerModal from '..';

const PASTEL = 'mealie:0b6f2a3c-1d2e-4f50-8a9b-0c1d2e3f4a5b';
const ROLLS = 'mealie:1c7f2a3c-1d2e-4f50-8a9b-0c1d2e3f4a5b';
const APPLE_PIE = 'mealie:2d8f2a3c-1d2e-4f50-8a9b-0c1d2e3f4a5b';

const MEALIE_MEALS: SavedMeal[] = [
  { id: PASTEL, name: 'Pastel de Choclo', prepTime: 40, cookTime: 100, tags: ['Chicken'] },
  { id: ROLLS, name: 'Air Fryer Egg Rolls', tags: ['Side'] },
];

const MONDAY_DINNER: PlannedMeal = {
  date: '2026-09-21',
  slot: 'dinner',
  mealId: PASTEL,
  sourceId: 'mealie:96',
  courses: [
    { kind: 'side', mealId: ROLLS, sourceId: 'mealie:97' },
    { kind: 'dessert', customText: 'Ice cream', sourceId: 'mealie:233' },
  ],
};

const SETTINGS = {
  enabledSlots: ['dinner'],
  weekStartDay: 'monday',
  defaultSlotTimes: { dinner: '18:00' },
  planSource: 'mealie',
} as unknown as MealSettings;

function block(status: MealieWireBlock['status'], fetchedAt: number): MealieWireBlock {
  return {
    status,
    plan: [MONDAY_DINNER],
    meals: MEALIE_MEALS,
    range: { start: '2026-09-14', end: '2026-10-18' },
    fetchedAt,
    baseUrl: 'http://mealie.local:9925',
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ core, editor, modules, remote }}>{children}</I18nProvider>;
}

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  // jsdom lays nothing out; the picker scrolls its highlighted row into view.
  Element.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers({ toFake: ['Date'] });
  // Noon on Monday 21 September in Chicago.
  vi.setSystemTime(new Date('2026-09-21T17:00:00Z'));
  useEditorStore.setState({
    config: { settings: { timezone: 'America/Chicago', timeFormat: '12h' } } as unknown as ScreenConfiguration,
  });
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/mealie/validate')) return json({ ok: true, version: '3.29.0', household: 'Family', user: 'Sam' });
    if (url.startsWith('/api/mealie/recipes')) {
      return json({ items: [{ id: APPLE_PIE, name: 'Apple Pie', prepTime: 25, tags: ['Dessert'] }], page: 1, totalPages: 1, total: 1 });
    }
    return json({});
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.fetch.mockReset();
  useEditorStore.setState({ config: null });
});

function renderMealie(status: MealieWireBlock['status'], onUpdate: (edit: MealEdit) => void = () => {}) {
  // 3:10 PM in Chicago.
  const fetchedAt = Date.parse('2026-09-21T20:10:00Z');
  const b = block(status, fetchedAt);
  return render(
    <MealPlannerModal
      loaded
      savedMeals={b.meals}
      plan={b.plan}
      settings={SETTINGS}
      groceryChecked={{}}
      onToggleGroceryItem={() => {}}
      accentColor="#f59e0b"
      onUpdate={onUpdate}
      onClose={() => {}}
      source="mealie"
      mealie={b}
      onShowMealieRange={() => {}}
    />,
    { wrapper: Wrapper },
  );
}

const dinnerCell = () => document.querySelector('[data-meal-cell="2026-09-21|dinner"] > div') as HTMLElement;

describe('the meal planner window with the plan in Mealie', () => {
  it('says where the plan comes from and counts the courses on the dish', async () => {
    renderMealie('ok');
    expect(screen.getByTestId('mealie-source-pill').textContent).toContain('From Mealie');
    expect(screen.getByTestId('mealie-source-pill').getAttribute('href')).toBe('http://mealie.local:9925/household/mealplan/planner/view');
    expect(await screen.findByText(/Family household/)).toBeTruthy();
    expect(within(dinnerCell()).getByText('+2')).toBeTruthy();
    // A Mealie recipe shows its whole time, prep plus cook.
    expect(within(dinnerCell()).getByText('2 hr 20 min')).toBeTruthy();
  });

  it('opens a popover for a planned meal with its dish, courses and serving time', () => {
    renderMealie('ok');
    fireEvent.click(dinnerCell());
    const popover = screen.getByTestId('meal-popover');
    expect(popover.textContent).toContain('Saves to Mealie');
    expect(popover.textContent).toContain('Pastel de Choclo');
    expect(popover.textContent).toContain('Air Fryer Egg Rolls');
    expect(popover.textContent).toContain('Ice cream');
    expect(popover.textContent).toContain('usually 6:00 PM');
    expect(within(popover).getByRole('button', { name: 'Clear this dinner' })).toBeTruthy();
  });

  it('adds a dessert picked from a Mealie search as a course of that meal', async () => {
    const edits: MealEdit[] = [];
    renderMealie('ok', (edit) => edits.push(edit));
    fireEvent.click(dinnerCell());
    fireEvent.click(within(screen.getByTestId('meal-popover')).getByRole('button', { name: 'Dessert' }));
    const picker = screen.getByRole('dialog', { name: 'Add a dessert' });
    // The day and the meal, with a middle dot rather than a long dash.
    expect(picker.textContent).toContain('Monday · Dinner');
    fireEvent.click(await within(picker).findByText('Apple Pie'));
    expect(edits).toHaveLength(1);
    const { plan } = edits[0]({ savedMeals: MEALIE_MEALS, plan: [MONDAY_DINNER] });
    const dinner = plan!.find((p) => p.slot === 'dinner')!;
    expect(dinner.courses?.map((c) => c.mealId ?? c.customText)).toEqual([ROLLS, 'Ice cream', APPLE_PIE]);
    // The entries already in Mealie keep their ids, so only the new one is created.
    expect(dinner.sourceId).toBe('mealie:96');
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/mealie\/recipes/), expect.anything());
  });

  it('offers typed text as a note, first in the list', async () => {
    const edits: MealEdit[] = [];
    renderMealie('ok', (edit) => edits.push(edit));
    fireEvent.click(dinnerCell());
    fireEvent.click(within(screen.getByTestId('meal-popover')).getByRole('button', { name: 'Side' }));
    const picker = screen.getByRole('dialog', { name: 'Add a side' });
    fireEvent.change(within(picker).getByRole('textbox'), { target: { value: 'Green salad' } });
    const typed = within(picker).getByText('Type “Green salad” instead');
    expect(within(picker).getByText('No recipe. Mealie keeps it as a note.')).toBeTruthy();
    fireEvent.click(typed);
    const { plan } = edits[0]({ savedMeals: MEALIE_MEALS, plan: [MONDAY_DINNER] });
    expect(plan!.find((p) => p.slot === 'dinner')!.courses!.at(-1)).toEqual({ kind: 'side', customText: 'Green salad' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a side' })).toBeNull());
  });

  it('pauses planning with the age of its copy while Mealie is not answering', () => {
    renderMealie('stale');
    expect(screen.getByTestId('mealie-source-pill').textContent).toContain('Last updated 3:10 PM');
    expect(screen.getByText('Planning is paused until Mealie is back. This is the plan from 3:10 PM.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Suggest/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(dinnerCell());
    expect(screen.queryByTestId('meal-popover')).toBeNull();
  });

  it('shows no week at all, rather than an empty one, when Mealie never answered', () => {
    const view = render(
      <MealPlannerModal
        loaded
        savedMeals={[]}
        plan={[]}
        settings={SETTINGS}
        groceryChecked={{}}
        onToggleGroceryItem={() => {}}
        accentColor="#f59e0b"
        onUpdate={() => {}}
        onClose={() => {}}
        source="mealie"
        mealie={{ status: 'failed', plan: [], meals: [], range: { start: '2026-09-14', end: '2026-10-18' }, fetchedAt: null }}
      />,
      { wrapper: Wrapper },
    );
    // Said in place of the week and in the Library beside it, alike.
    expect(view.getAllByText("Can't reach Mealie right now")).toHaveLength(2);
    expect(document.querySelector('[data-meal-cell]')).toBeNull();
    expect(view.queryByText(/planned this week/)).toBeNull();
  });
});

describe('courses without Mealie', () => {
  const LOCAL: SavedMeal[] = [
    { id: 'tacos', name: 'Tacos', emoji: '🌮', category: 'main' },
    { id: 'bread', name: 'Garlic Bread', emoji: '🍞', category: 'side' },
  ];
  const PLAN: PlannedMeal[] = [{ date: '2026-09-21', slot: 'dinner', mealId: 'tacos', courses: [{ kind: 'side', mealId: 'bread' }] }];
  const LOCAL_SETTINGS = { ...SETTINGS, planSource: undefined } as MealSettings;

  it('shows this week when the household week start arrives after the window opened', () => {
    // Before the meals land the week start reads as Sunday; this household starts on Monday.
    const props = { savedMeals: LOCAL, plan: PLAN, groceryChecked: {}, onToggleGroceryItem: () => {}, accentColor: '#f59e0b', onUpdate: () => {}, onClose: () => {} };
    const sunday = { ...LOCAL_SETTINGS, weekStartDay: 'sunday' } as MealSettings;
    const view = render(<MealPlannerModal loaded {...props} settings={sunday} />, { wrapper: Wrapper });
    expect(document.querySelector('[data-meal-cell="2026-09-20|dinner"]')).not.toBeNull();
    view.rerender(<MealPlannerModal loaded {...props} settings={LOCAL_SETTINGS} />);
    expect(document.querySelector('[data-meal-cell="2026-09-21|dinner"]')).not.toBeNull();
    expect(document.querySelector('[data-meal-cell="2026-09-27|dinner"]')).not.toBeNull();
    expect(document.querySelector('[data-meal-cell="2026-09-14|dinner"]')).toBeNull();
  });

  it('keeps planning off until the meals have loaded', () => {
    const edits: MealEdit[] = [];
    render(
      <MealPlannerModal loaded={false} savedMeals={[]} plan={[]} settings={LOCAL_SETTINGS} groceryChecked={{}} onToggleGroceryItem={() => {}} accentColor="#f59e0b" onUpdate={(e) => edits.push(e)} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    for (const name of [/Suggest/, /Clear/]) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    // No week until the meals are in: an empty one read as the meals being gone.
    expect(dinnerCell()).toBeNull();
    expect(screen.getAllByText('Loading meals…').length).toBeGreaterThan(0);
    expect(screen.queryByText(/planned/)).toBeNull();
    // No guessed week dates, and no paging a week the load would move away from.
    expect((screen.getByRole('button', { name: 'Next week' }) as HTMLButtonElement).disabled).toBe(true);
    expect(edits).toEqual([]);
  });

  it('lists the meals saved as that kind first, and removing a course can be undone', () => {
    const edits: MealEdit[] = [];
    render(
      <MealPlannerModal loaded savedMeals={LOCAL} plan={PLAN} settings={LOCAL_SETTINGS} groceryChecked={{}} onToggleGroceryItem={() => {}} accentColor="#f59e0b" onUpdate={(e) => edits.push(e)} onClose={() => {}} />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByTestId('mealie-source-pill')).toBeNull();
    fireEvent.click(dinnerCell());
    const popover = screen.getByTestId('meal-popover');
    expect(popover.textContent).not.toContain('Saves to Mealie');

    fireEvent.click(within(popover).getByRole('button', { name: 'Side' }));
    const picker = screen.getByRole('dialog', { name: 'Add a side' });
    const text = picker.textContent ?? '';
    expect(text.indexOf('Sides')).toBeLessThan(text.indexOf('Garlic Bread'));
    expect(text.indexOf('Garlic Bread')).toBeLessThan(text.indexOf('Everything else'));
    expect(text.indexOf('Everything else')).toBeLessThan(text.indexOf('Tacos'));
    // Escape closes only the picker; the popover stays under it.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Add a side' })).toBeNull();

    fireEvent.click(within(screen.getByTestId('meal-popover')).getByRole('button', { name: 'Remove Garlic Bread' }));
    expect(edits[0]({ savedMeals: LOCAL, plan: PLAN }).plan![0].courses).toBeUndefined();
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }));
    expect(edits[1]({ savedMeals: LOCAL, plan: [{ date: '2026-09-21', slot: 'dinner', mealId: 'tacos' }] }).plan).toEqual(PLAN);
  });
});
