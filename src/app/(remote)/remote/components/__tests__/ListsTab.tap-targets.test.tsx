// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import { isoDateInTZ } from '@/lib/timezone';
import type { TodoList } from '@/types/todos';
import { HouseholdClockProvider } from '../../household-clock';

/**
 * Kids use the Lists tab on the phone, so every control on it reserves at
 * least 44 px for a finger even where the drawn chip or square is smaller.
 * jsdom does no layout, so the sizes are read off the inline styles.
 */

const stamp = '2026-09-20T00:00:00.000Z';
const list: TodoList = {
  id: 'l1', name: 'Before school', slug: 'before_school', repeat: 'never', createdAt: stamp, updatedAt: stamp,
  items: [{ id: 'i1', text: 'Permission slip', completed: false, createdAt: stamp }],
};

vi.mock('../../hooks/useTodoLists', () => ({
  useTodoLists: () =>
    new Proxy(
      { lists: [list], loaded: true, loadError: null, selectedList: list },
      { get: (target, key) => (key in target ? target[key as keyof typeof target] : vi.fn()) },
    ),
}));
vi.mock('@/hooks/useFamilyData', () => ({
  useFamilyData: () => ({ members: [], groups: [], revision: 'r1', loading: false, loaded: true, error: null }),
}));

const { default: ListsTab } = await import('../ListsTab');

const ZONE = 'America/Chicago';
function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ core, modules, remote }}>
      <HouseholdClockProvider timezone={ZONE} today={isoDateInTZ(new Date(), ZONE)} timeFormat="12h">{children}</HouseholdClockProvider>
    </I18nProvider>
  );
}

afterEach(() => cleanup());

function size(el: HTMLElement): { width: number; height: number } {
  return {
    width: parseFloat(el.style.width || el.style.minWidth || '0'),
    height: parseFloat(el.style.height || el.style.minHeight || '0'),
  };
}

describe('Lists tab tap targets', () => {
  it('reserves 44 px for the list chips, New list, List settings and the drag handle', async () => {
    render(<ListsTab selectedListId="l1" onSelectList={() => {}} />, { wrapper });
    await act(async () => {});

    const chip = screen.getByTestId('todo-list-chip');
    expect(size(chip).height).toBeGreaterThanOrEqual(44);
    expect(parseFloat(chip.style.minWidth)).toBeGreaterThanOrEqual(44);

    for (const name of [remote.lists.newList.title, remote.lists.settingsButton]) {
      const button = screen.getByRole('button', { name });
      expect(size(button).width).toBeGreaterThanOrEqual(44);
      expect(size(button).height).toBeGreaterThanOrEqual(44);
    }

    const handle = screen.getByRole('button', { name: remote.lists.item.move.replace('{text}', 'Permission slip') });
    expect(size(handle).width).toBeGreaterThanOrEqual(44);
    expect(size(handle).height).toBeGreaterThanOrEqual(44);
  });
});
