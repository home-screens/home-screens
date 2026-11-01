'use client';

import { useState, type FormEvent } from 'react';
import type { MealieShoppingTab } from './useMealieShoppingList';

/**
 * The box that adds to the family's Mealie list, for the phone and the
 * editor alike. It empties as the words are sent, so whatever is typed next
 * is kept; words Mealie did not take come back only into an empty box.
 * Nothing goes while an add or a pick is on its way.
 */
export function useShoppingAddBox(shopping: Pick<MealieShoppingTab, 'add' | 'adding' | 'choosing'>) {
  const [draft, setDraft] = useState('');
  const canAdd = draft.trim() !== '' && !shopping.adding && shopping.choosing === null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    const words = draft;
    setDraft('');
    if (!(await shopping.add(words))) setDraft((current) => (current.trim() ? current : words));
  };

  return { draft, setDraft, canAdd, submit };
}
