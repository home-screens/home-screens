// @vitest-environment jsdom

/**
 * "Remove done items" asks first on the phone, as it already did in the
 * editor; it used to drop them at once with no way back. Unticking
 * everything still goes at once.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import type { TodoList } from '@/types/todos';

import ListsListSheet from '../ListsListSheet';

const AT = '2026-11-03T12:00:00.000Z';
const list: TodoList = {
  id: 'groceries', name: 'Groceries', slug: 'groceries', repeat: 'never', createdAt: AT, updatedAt: AT,
  items: [
    { id: 'milk', text: 'Milk', completed: true, completedAt: AT, createdAt: AT },
    { id: 'eggs', text: 'Eggs', completed: true, completedAt: AT, createdAt: AT },
    { id: 'bread', text: 'Bread', completed: false, createdAt: AT },
  ],
};

function show(onAction = vi.fn()) {
  render(
    <I18nProvider locale="en-US" blob={{ core, remote }}>
      <ListsListSheet list={list} onSave={async () => null} onAction={onAction} onDelete={async () => null} onClose={() => {}} />
    </I18nProvider>,
  );
  return onAction;
}

afterEach(cleanup);

describe('the list sheet tidy-up', () => {
  it('asks before removing the done items, and removes them on a yes', () => {
    const onAction = show();
    fireEvent.click(screen.getByRole('button', { name: 'Remove done items' }));
    expect(onAction).not.toHaveBeenCalled();
    const question = screen.getByTestId('confirm-sheet');
    expect(question.textContent).toContain('Remove 2 done items from “Groceries”?');
    // The red answer sits above Cancel, as on every phone question.
    const [first, second] = within(question).getAllByRole('button');
    expect(first.textContent).toBe('Remove');
    expect(second.textContent).toBe('Cancel');
    fireEvent.click(first);
    expect(onAction).toHaveBeenCalledWith('clear-completed');
  });

  it('keeps them on a no', () => {
    const onAction = show();
    fireEvent.click(screen.getByRole('button', { name: 'Remove done items' }));
    fireEvent.click(within(screen.getByTestId('confirm-sheet')).getByRole('button', { name: 'Cancel' }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-sheet')).toBeNull();
  });

  it('unticks everything at once, without a question', () => {
    const onAction = show();
    fireEvent.click(screen.getByRole('button', { name: 'Uncheck all' }));
    expect(onAction).toHaveBeenCalledWith('uncheck-all');
    expect(screen.queryByTestId('confirm-sheet')).toBeNull();
  });
});
