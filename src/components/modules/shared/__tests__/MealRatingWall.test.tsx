// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { DOUBLE_TAP_MS } from '@/lib/sheet-tap-guard';
import { FamilyMealSummary, MealVotesProvider, resetMealVotes } from '@/components/meals/meal-votes';
import type { FamilyMealRating } from '@/types/meal-ratings';
import { MealRecipeContext, type MealRecipeContextValue } from '../MealRecipeContext';
import { FamilyMealStars, WallRateDinnerButton, WallRateMealButton } from '../MealRatingWall';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/display-fetch', () => ({ displayFetch: fetchMock }));
vi.mock('@/hooks/useFamilyData', () => ({
  useFamilyData: () => ({
    members: [
      { id: 'one', name: 'Member One', emoji: 'lucide:heart', color: '#60a5fa' },
      { id: 'two', name: 'Member Two', emoji: '', color: '#fbbf24' },
    ],
    groups: [], revision: 'r1', loading: false, loaded: true, error: null, refresh: () => {},
  }),
}));

const soup = { id: 'soup', name: 'Soup' };
const pasta = { id: 'pasta', name: 'Pasta' };
const plan = [
  { date: '2026-01-01', slot: 'dinner' as const, mealId: soup.id },
  { date: '2026-01-02', slot: 'dinner' as const, mealId: pasta.id },
  { date: '2026-01-03', slot: 'dinner' as const, customText: 'Leftovers' },
  { date: '2026-01-04', slot: 'dinner' as const, mealId: soup.id, courses: [{ kind: 'side' as const, customText: 'Garlic bread' }, { kind: 'dessert' as const, customText: 'Ice cream' }] },
];
const settings = { ...DEFAULT_MEAL_SETTINGS, defaultSlotTimes: { ...DEFAULT_MEAL_SETTINGS.defaultSlotTimes, dinner: '18:00' } };
const context = (now: string, showFamilyRatings?: boolean): MealRecipeContextValue => ({
  theme: 'linen', plan, savedMeals: [soup, pasta], settings, timeFormat: '12h', now: new Date(now), showFamilyRatings,
});
const loaded: FamilyMealRating[] = [{ mealId: 'soup', memberId: 'one', rating: 4, updatedAt: '2026-01-01T00:00:00Z' }];

function show(node: ReactNode, { now = '2026-01-01T19:45:00', showFamilyRatings, votes = loaded }: { now?: string; showFamilyRatings?: boolean; votes?: FamilyMealRating[] } = {}) {
  return render(
    <I18nProvider locale="en-US" blob={{ core, modules }}>
      <MealRecipeContext.Provider value={context(now, showFamilyRatings)}>
        <MealVotesProvider loaded={votes}>{node}</MealVotesProvider>
      </MealRecipeContext.Provider>
    </I18nProvider>,
  );
}

const ok = () => Promise.resolve(new Response(JSON.stringify({ ratings: [] }), { status: 200 }));
const sent = () => fetchMock.mock.calls.map(([url, init]) => [url, JSON.parse((init as RequestInit).body as string)]);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(ok);
  resetMealVotes();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Rate Dinner on the wall', () => {
  it("opens tonight's dinner after the Today view has turned to tomorrow", () => {
    // 19:45: dinner at 18:00 is "over" for the views, which lead with tomorrow.
    show(<WallRateDinnerButton size={28} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rate Dinner' }));
    const dialog = screen.getByRole('dialog', { name: 'Rate Dinner' });
    expect(dialog.textContent).toContain('Thursday, January 1');
    expect(dialog.textContent).toContain('Soup');
    expect(dialog.textContent).not.toContain('Pasta');
  });

  it("opens last night's dinner the next morning, not one nobody has eaten", () => {
    show(<WallRateDinnerButton size={28} />, { now: '2026-01-02T08:00:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Rate Dinner' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Thursday, January 1');
    expect(dialog.textContent).toContain('Soup');
    expect(dialog.textContent).not.toContain('Pasta');
  });

  it('says so when no dinner was planned', () => {
    show(<WallRateDinnerButton size={28} />, { now: '2026-01-05T20:00:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Rate Dinner' }));
    expect(screen.getByRole('dialog').textContent).toContain(core.mealRatings.noDinner);
    expect(screen.queryByTestId('meal-rating-member')).toBeNull();
  });

  it('names a typed-in dish as the reason it has no stars', () => {
    show(<WallRateDinnerButton size={28} />, { now: '2026-01-03T20:00:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Rate Dinner' }));
    expect(screen.getByRole('dialog').textContent).toContain('There is no recipe to rate for Leftovers, because it was only typed in.');
    expect(screen.queryByTestId('meal-rating-dish')).toBeNull();
  });

  it('names every typed-in dish beside the ones that can be rated', () => {
    show(<WallRateDinnerButton size={28} />, { now: '2026-01-04T20:00:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Rate Dinner' }));
    expect(screen.getByRole('dialog').textContent).toContain('There are no recipes to rate for Garlic bread and Ice cream, because they were only typed in.');
    expect(screen.getAllByTestId('meal-rating-dish')).toHaveLength(1);
  });

  it('does not close on the second tap of a double tap, and closes on a later one', () => {
    vi.useFakeTimers();
    show(<WallRateDinnerButton size={28} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rate Dinner' }));
    act(() => { vi.advanceTimersByTime(DOUBLE_TAP_MS - 50); });
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(DOUBLE_TAP_MS); });
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('voting on the wall', () => {
  const open = () => {
    show(<><FamilyMealStars meal={soup} /><WallRateMealButton meal={soup} size={28} /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Rate Soup' }));
    return screen.getByRole('dialog', { name: 'Rate Soup' });
  };
  const starsOf = (dialog: HTMLElement) => within(dialog).getAllByTestId('meal-rating-star') as HTMLButtonElement[];

  it('draws a person by their icon or their initial, never the icon name', () => {
    const dialog = open();
    const [one, two] = within(dialog).getAllByTestId('meal-rating-member');
    expect(one.querySelector('svg')).not.toBeNull();
    expect(one.textContent).toBe('Member One');
    expect(two.textContent).toBe('MMember Two');
  });

  it('keeps the stars off until somebody says who is rating', () => {
    const dialog = open();
    expect(starsOf(dialog).every((star) => star.disabled)).toBe(true);
    fireEvent.click(starsOf(dialog)[4]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a person's stars, saves a new vote at once and shows it everywhere", async () => {
    const dialog = open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Member One' }));
    expect(starsOf(dialog).map((star) => star.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true', 'false']);
    fireEvent.click(starsOf(dialog)[4]);
    await waitFor(() => expect(sent()).toEqual([['/api/meals/ratings', { mealId: 'soup', memberId: 'one', rating: 5 }]]));
    // Before any reload: the dialog and the stars on the plan behind it.
    expect(starsOf(dialog)[4].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByTestId('meal-family-stars')[0].getAttribute('aria-label')).toContain('5.0');
  });

  it("takes a person's vote back", async () => {
    const dialog = open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Member One' }));
    fireEvent.click(within(dialog).getByRole('button', { name: core.mealRatings.clear }));
    await waitFor(() => expect(sent()).toEqual([['/api/meals/ratings', { mealId: 'soup', memberId: 'one', rating: null }]]));
    expect(dialog.textContent).toContain(core.mealRatings.notRated);
    expect(screen.queryByTestId('meal-family-stars')).toBeNull();
  });

  it('puts the stars back and says so when the hub cannot be reached', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    const dialog = open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Member One' }));
    fireEvent.click(starsOf(dialog)[0]);
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toBe(core.mealRatings.saveError));
    expect(starsOf(dialog)[3].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByTestId('meal-family-stars')[0].getAttribute('aria-label')).toContain('4.0');
  });
});

describe('a rating where there is little room', () => {
  it('draws one star and the average on a one-line row, and still says the whole thing', () => {
    show(<FamilyMealStars meal={soup} compact />);
    const stars = screen.getByRole('img', { name: '★ 4.0 / 5 · Family votes: 1' });
    expect(stars.textContent).toBe('4.0');
    expect(stars.querySelectorAll('svg')).toHaveLength(1);
    expect(stars.style.whiteSpace).toBe('nowrap');
  });

  it('shortens the words on a narrow card to the average and the vote count', () => {
    show(<><FamilyMealSummary meal={soup} short /><FamilyMealSummary meal={pasta} short /></>);
    expect(screen.getByRole('img', { name: '★ 4.0 / 5 · Family votes: 1' }).textContent).toBe('★ 4.0 · 1');
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });
});

describe('Show Family Ratings off', () => {
  it('hides the stars and both buttons without asking the hub for anything', () => {
    const { container } = show(<>
      <FamilyMealStars meal={soup} />
      <WallRateMealButton meal={soup} size={28} />
      <WallRateDinnerButton size={28} />
    </>, { showFamilyRatings: false });
    expect(container.textContent).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps ratings visible on an older module that has no setting', () => {
    show(<FamilyMealStars meal={soup} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('4.0');
  });
});
