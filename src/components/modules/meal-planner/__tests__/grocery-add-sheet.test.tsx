// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MealPlannerConfig } from '@/types/config';
import type { WallGroceryShownGroup } from '@/lib/grocery-wall';
import { I18nProvider } from '@/i18n/provider';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import type { WallGrocery } from '../../shared/useWallGrocery';

// The sheet keeps what was just added (the chips and their Undo) in its own
// state, so it must stay mounted while the list behind it changes. Counted
// here with a stand-in, which a remount would mount a second time.
const sheet = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
vi.mock('../../shared/WallAddSheet', () => ({
  WallAddSheet: function CountedSheet() {
    useEffect(() => {
      sheet.mounts += 1;
      return () => { sheet.unmounts += 1; };
    }, []);
    return <div data-testid="wall-add-sheet" />;
  },
}));

import { GroceryView } from '../GroceryView';

// jsdom has no ResizeObserver; the size hooks only need it to exist.
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

afterEach(() => {
  cleanup();
  sheet.mounts = 0;
  sheet.unmounts = 0;
});

const CONFIG = { view: 'grocery', interactive: true, wallAdd: true } as MealPlannerConfig;

const MILK: WallGroceryShownGroup = { key: 'extras', label: null, extrasList: 'Shopping', left: 1, items: [{ id: 'todo:milk', text: 'Milk', checked: false }] };

function grocery(groups: WallGroceryShownGroup[]): WallGrocery {
  return {
    state: 'ready', listName: null, noMealieList: false, week: null, pressed: null, tick: () => {},
    rows: { groups, left: groups.reduce((n, g) => n + g.items.length, 0), got: 0 },
    addTo: { kind: 'todo', listId: 'shop', name: 'Shopping', left: 0 },
  };
}

const view = (groups: WallGroceryShownGroup[]) => (
  <I18nProvider locale="en-US" blob={{ core, modules }}>
    <GroceryView config={CONFIG} grocery={grocery(groups)} tappable />
  </I18nProvider>
);

describe('small grocery card, adding from the wall', () => {
  it('keeps the one add sheet through the first thing added to an empty list, and through its Undo', () => {
    const { rerender } = render(view([]));
    fireEvent.click(screen.getByTestId('meal-grocery-add'));
    expect(sheet).toEqual({ mounts: 1, unmounts: 0 });

    // The first item lands: the card goes from its empty state to a list.
    rerender(view([MILK]));
    expect(screen.getByTestId('meal-grocery-item').textContent).toContain('Milk');
    expect(screen.getByTestId('wall-add-sheet')).toBeTruthy();
    expect(sheet).toEqual({ mounts: 1, unmounts: 0 });

    // Undo takes it off again: back to the empty state.
    rerender(view([]));
    expect(screen.queryByTestId('meal-grocery-item')).toBeNull();
    expect(sheet).toEqual({ mounts: 1, unmounts: 0 });
  });

  it('keeps the Add row and the sheet while the list grows', () => {
    const eggs: WallGroceryShownGroup = { ...MILK, left: 2, items: [...MILK.items, { id: 'todo:eggs', text: 'Eggs', checked: false }] };
    const { rerender } = render(view([MILK]));
    fireEvent.click(screen.getByTestId('meal-grocery-add'));
    rerender(view([eggs]));
    expect(screen.getAllByTestId('meal-grocery-item')).toHaveLength(2);
    expect(sheet).toEqual({ mounts: 1, unmounts: 0 });
  });

  it('draws no Add row and no sheet with nowhere to add', () => {
    render(
      <I18nProvider locale="en-US" blob={{ core, modules }}>
        <GroceryView config={CONFIG} grocery={{ ...grocery([]), addTo: null }} tappable />
      </I18nProvider>,
    );
    expect(screen.queryByTestId('meal-grocery-add')).toBeNull();
    expect(screen.queryByTestId('meal-grocery')).toBeNull();
  });
});
