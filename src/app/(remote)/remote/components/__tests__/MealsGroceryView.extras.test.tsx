// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import core from '@/translations/en-US/core.json';
import remote from '@/translations/en-US/remote.json';
import type { GroceryList } from '@/lib/grocery-utils';
import type { TodoList } from '@/types/todos';

const NOW = new Date().toISOString();
const shopping: TodoList = {
  id: 'shop', name: 'Shopping', slug: 'shopping', color: '#22c55e', repeat: 'never', createdAt: NOW, updatedAt: NOW,
  items: [
    { id: 'towels', text: 'Paper towels', completed: false, createdAt: NOW },
    { id: 'food', text: 'Dog food', completed: true, createdAt: NOW, completedAt: NOW },
  ],
};

const useTodoLists = vi.fn();
const toggleItem = vi.fn();
vi.mock('../../hooks/useTodoLists', () => ({ useTodoLists: (...args: unknown[]) => useTodoLists(...args) }));
const shareOrCopyText = vi.fn(async (_text: string) => 'copied' as const);
vi.mock('../share-text', () => ({ shareOrCopyText: (text: string) => shareOrCopyText(text) }));

import MealsGroceryView from '../MealsGroceryView';

const groceryList: GroceryList = new Map([
  ['dairy', { items: [{ name: 'Eggs', amount: '4', checked: false }, { name: 'Milk', amount: '2 cups', checked: true }] }],
]) as unknown as GroceryList;

function view(extras: { listId: string; since: string } | null) {
  return render(
    <I18nProvider locale="en-US" blob={{ core, remote }}>
      <MealsGroceryView
        groceryList={groceryList}
        groceryStats={{ total: 2, checked: 1 }}
        withoutIngredients={[]}
        toggleGroceryItem={async () => {}}
        week={{ thisWeek: true, range: '' }}
        extras={extras}
        onOpenList={() => {}}
      />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useTodoLists.mockReturnValue({ lists: [shopping], toggleItem });
});
afterEach(cleanup);

describe('MealsGroceryView with a list for other things to buy', () => {
  it('counts that list with the ingredients and shares what is still to get on it', async () => {
    view({ listId: 'shop', since: '2000-01-01' });
    expect(screen.getByText(/2 of 4/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: remote.mealsGrocery.shareButton }));
    await waitFor(() => expect(shareOrCopyText).toHaveBeenCalled());
    const text = shareOrCopyText.mock.calls[0][0];
    expect(text).toContain('Eggs (4)');
    expect(text).toContain('Shopping\n  Paper towels');
    expect(text).not.toContain('Dog food');
  });

  it('ticks an item there on its own list', () => {
    view({ listId: 'shop', since: '2000-01-01' });
    fireEvent.click(screen.getByText('Paper towels'));
    expect(toggleItem).toHaveBeenCalledWith('shop', 'towels');
  });

  it('reads no lists at all without one picked', () => {
    view(null);
    expect(useTodoLists).not.toHaveBeenCalled();
    expect(screen.getByText(/1 of 2/)).toBeTruthy();
  });
});
