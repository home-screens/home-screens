// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import core from '@/translations/en-US/core.json';
import { MealRecipeContext, type MealRecipeContextValue } from '@/components/modules/shared/MealRecipeContext';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { FamilyMealRatingButton, FamilyMealRatingPanel, FamilyMealStars, RateDinnerButton } from '../FamilyMealRating';

const state = vi.hoisted(() => ({ save: vi.fn(), reads: vi.fn(), loadError: null as Error | null }));
vi.mock('../useFamilyMealRatings', () => ({ useFamilyMealRatings: () => {
  state.reads();
  return { data: { members: [
    { id: 'one', name: 'Member One', emoji: 'lucide:heart', color: '#60a5fa' },
    { id: 'two', name: 'Member Two', emoji: 'lucide:crown', color: '#fbbf24' },
  ], ratings: [{ mealId: 'soup', memberId: 'one', rating: 4, updatedAt: '2026-01-01T00:00:00Z' }] },
  save: state.save, loadError: state.loadError, saving: false, saveError: false, saved: false, retry: vi.fn() };
} }));

const meal = { id: 'soup', name: 'Soup' };
const tomorrow = { id: 'pasta', name: 'Pasta' };
const plan = [
  { date: '2026-01-01', slot: 'dinner' as const, mealId: meal.id },
  { date: '2026-01-02', slot: 'dinner' as const, mealId: tomorrow.id },
];
const context: MealRecipeContextValue = {
  theme: 'horizon', plan, savedMeals: [meal, tomorrow], settings: DEFAULT_MEAL_SETTINGS,
  timeFormat: '12h', now: new Date('2026-01-01T20:00:00'),
};
const show = (node: React.ReactNode, showFamilyRatings?: boolean) => render(
  <I18nProvider locale="en-US" blob={{ core }}>
    <MealRecipeContext.Provider value={{ ...context, showFamilyRatings }}>{node}</MealRecipeContext.Provider>
  </I18nProvider>,
);
beforeEach(() => { vi.clearAllMocks(); state.loadError = null; });
afterEach(cleanup);

describe('family meal rating controls', () => {
  it('renders stored icons as SVG and saves or clears the selected member vote', () => {
    show(<FamilyMealRatingPanel meal={meal} />);
    const member = screen.getByRole('button', { name: 'Member One' });
    expect(member.querySelector('svg')).not.toBeNull();
    expect(member.textContent).not.toContain('lucide:');
    fireEvent.click(member);
    const stars = screen.getByRole('group', { name: core.mealRatings.stars }).querySelectorAll('button');
    fireEvent.click(stars[4]);
    expect(state.save).toHaveBeenCalledWith('soup', 'one', 5);
    fireEvent.click(screen.getByRole('button', { name: core.mealRatings.clear }));
    expect(state.save).toHaveBeenCalledWith('soup', 'one', null);
  });

  it('hides module stars and entry buttons without reading or deleting votes', () => {
    const { container } = show(<>
      <FamilyMealStars meal={meal} />
      <FamilyMealRatingButton meal={meal} />
      <RateDinnerButton plan={plan} meals={[meal, tomorrow]} date="2026-01-02" />
    </>, false);
    expect(container.textContent).toBe('');
    expect(state.reads).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it('keeps ratings visible when an older module has no visibility setting', () => {
    show(<FamilyMealStars meal={meal} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('4.0');
  });

  it('opens the dinner for the displayed date rather than the current day', () => {
    show(<RateDinnerButton plan={plan} meals={[meal, tomorrow]} date="2026-01-02" />);
    fireEvent.click(screen.getByRole('button', { name: 'Rate Dinner' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Friday, January 2');
    expect(dialog.textContent).toContain('Pasta');
    expect(dialog.textContent).not.toContain('Soup');
  });
});
