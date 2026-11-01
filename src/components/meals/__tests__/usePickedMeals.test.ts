// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { SavedMeal } from '@/types/config';
import { usePickedMeals } from '../usePickedMeals';

afterEach(cleanup);

const CHILI: SavedMeal = { id: 'mealie:0b6f2a3c-1d2e-4f50-8a9b-0c1d2e3f4a5b', name: 'Harvest Chili' };
const ROLLS: SavedMeal = { id: 'mealie:1c7f2a3c-1d2e-4f50-8a9b-0c1d2e3f4a5b', name: 'Egg Rolls' };
const TACOS: SavedMeal = { id: 'tacos', name: 'Tacos' };

describe('usePickedMeals', () => {
  it('draws a picked Mealie recipe the copy does not hold yet, and only once the copy holds it', () => {
    const { result, rerender } = renderHook(({ saved }) => usePickedMeals(saved), { initialProps: { saved: [TACOS] } });
    expect(result.current.meals).toEqual([TACOS]);
    act(() => result.current.keep([CHILI]));
    expect(result.current.meals).toEqual([TACOS, CHILI]);
    rerender({ saved: [TACOS, CHILI] });
    expect(result.current.meals).toEqual([TACOS, CHILI]);
  });

  it("keeps a meal's Mealie dishes, main and courses, before a change takes them off", () => {
    const { result, rerender } = renderHook(({ saved }) => usePickedMeals(saved), { initialProps: { saved: [TACOS, CHILI, ROLLS] } });
    act(() => result.current.keepEntry({ date: '2026-11-02', slot: 'dinner', mealId: CHILI.id, courses: [{ kind: 'side', mealId: ROLLS.id }, { kind: 'side', mealId: TACOS.id }] }));
    // The copy after the change no longer carries them.
    rerender({ saved: [TACOS] });
    expect(result.current.meals).toEqual([TACOS, CHILI, ROLLS]);
  });

  it("never keeps the family's own meals, which are always in the copy", () => {
    const { result } = renderHook(() => usePickedMeals([]));
    act(() => result.current.keep([TACOS]));
    expect(result.current.meals).toEqual([]);
  });
});
