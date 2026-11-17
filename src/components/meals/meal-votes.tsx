'use client';

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { PlannedMeal, SavedMeal } from '@/types/config';
import type { FamilyMealRating } from '@/types/meal-ratings';
import { saveMealVote, type MealFetch } from '@/lib/meal-client';
import { applyMealVoteChanges, dinnerRatingGap, dinnerTypedDishes, familyMealAverage, mealVoteChangeLanded, type MealVoteChange } from '@/lib/meal-ratings';
import { useFamilyData } from '@/hooks/useFamilyData';
import { useFormattingLocale, useLocale, useTranslate } from '@/i18n';

/**
 * The family's votes as one surface draws them. The votes ride the meals
 * answer every surface already loads (`/api/meals/data`), so nothing here
 * asks the hub for them: each surface hands its loaded list to
 * `MealVotesProvider` and everything under it reads the same copy.
 */
const MealVotesContext = createContext<readonly FamilyMealRating[]>([]);

/**
 * Votes saved from this page and not yet in what the page loaded, by person
 * and recipe. A star tapped on a recipe card shows at once on the card, the
 * plan behind it and the dialog, without any of them loading again.
 */
interface PendingVote extends MealVoteChange {
  /** Still on its way to the hub. */
  saving: boolean;
  /** When the hub took it (`Date.now()`). */
  savedAt?: number;
}
const pending = new Map<string, PendingVote>();
/** Each vote's saves, one after another, so two quick taps land in the order they were made. */
const queue = new Map<string, Promise<boolean>>();
const listeners = new Set<() => void>();
let snapshot: readonly PendingVote[] = [];
const NONE: readonly PendingVote[] = [];
/**
 * How long a saved vote outlasts a loaded copy that disagrees with it. A copy
 * asked for just before the save is older than the vote; one that still
 * disagrees after this long means somebody voted again somewhere else.
 */
const PENDING_KEPT_MS = 60_000;

const keyOf = (mealId: string, memberId: string) => JSON.stringify([mealId, memberId]);

function emit() {
  snapshot = [...pending.values()];
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Show one person's stars for a recipe now and save them (`null` takes them
 * back). Resolves false, with the stars back as they were, when the hub
 * refused or could not be reached.
 */
export function castMealVote(fetcher: MealFetch, mealId: string, memberId: string, rating: number | null): Promise<boolean> {
  const key = keyOf(mealId, memberId);
  const before = pending.get(key);
  const mine: PendingVote = { mealId, memberId, rating, updatedAt: new Date().toISOString(), saving: true };
  pending.set(key, mine);
  emit();
  const run: Promise<boolean> = (queue.get(key) ?? Promise.resolve(true))
    .then(() => saveMealVote(fetcher, mealId, memberId, rating))
    .then(
      () => {
        if (pending.get(key) === mine) pending.set(key, { ...mine, saving: false, savedAt: Date.now() });
        return true;
      },
      () => {
        // Back to how it was, unless a later tap has changed it again.
        if (pending.get(key) === mine) {
          if (before && !before.saving) pending.set(key, before);
          else pending.delete(key);
        }
        return false;
      },
    )
    .finally(() => {
      if (queue.get(key) === run) queue.delete(key);
      emit();
    });
  queue.set(key, run);
  return run;
}

/** Forget every vote made on this page; for tests. */
export function resetMealVotes(): void {
  pending.clear();
  queue.clear();
  emit();
}

/**
 * Around everything that draws ratings on one surface: `loaded` is the list
 * that surface's meals answer carried.
 */
export function MealVotesProvider({ loaded, children }: { loaded: readonly FamilyMealRating[] | undefined; children: ReactNode }) {
  const votes = useVotesWithPending(loaded);
  return <MealVotesContext.Provider value={votes}>{children}</MealVotesContext.Provider>;
}

const NO_VOTES: readonly FamilyMealRating[] = [];

/** The same, for a surface that already holds the votes with its own on top (`useVotesWithPending`). */
export function MealVotesScope({ votes, children }: { votes: readonly FamilyMealRating[]; children: ReactNode }) {
  return <MealVotesContext.Provider value={votes}>{children}</MealVotesContext.Provider>;
}

/** The loaded votes with this page's own on top; a vote made here gives way once the loaded copy says the same. */
export function useVotesWithPending(loaded: readonly FamilyMealRating[] | undefined): readonly FamilyMealRating[] {
  const list = loaded ?? NO_VOTES;
  const mine = useSyncExternalStore(subscribe, () => snapshot, () => NONE);
  useEffect(() => {
    let dropped = false;
    const now = Date.now();
    for (const vote of mine) {
      if (vote.saving) continue;
      const stale = vote.savedAt !== undefined && now - vote.savedAt > PENDING_KEPT_MS;
      if (!stale && !mealVoteChangeLanded(list, vote)) continue;
      const key = keyOf(vote.mealId, vote.memberId);
      if (pending.get(key) === vote) {
        pending.delete(key);
        dropped = true;
      }
    }
    if (dropped) emit();
  }, [list, mine]);
  return useMemo(() => applyMealVoteChanges(list, mine), [list, mine]);
}

/** The family's votes on this surface, this page's own included. */
export function useMealVotes(): readonly FamilyMealRating[] {
  return useContext(MealVotesContext);
}

/** One recipe's family average, as the number each surface prints; null while nobody has rated it. */
export function useFamilyMealAverage(mealId: string | undefined): { average: number; text: string; count: number } | null {
  const votes = useMealVotes();
  const locale = useFormattingLocale();
  return useMemo(() => {
    const { average, count } = familyMealAverage(votes, mealId ?? '');
    if (average === null) return null;
    return { average, count, text: average.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) };
  }, [votes, mealId, locale]);
}

/**
 * What a rating board needs, whichever surface draws it: the people, who is
 * rating right now, each recipe's stars from that person, and the save. The
 * wall, the phone and the editor each draw their own board around it.
 */
export function useMealVoting(fetcher: MealFetch) {
  const { members, loaded: rosterLoaded, error: rosterError } = useFamilyData();
  const votes = useMealVotes();
  const [chosen, setChosen] = useState('');
  const [failed, setFailed] = useState(false);
  // A person removed while the board is open is no longer rating.
  const memberId = members.some((m) => m.id === chosen) ? chosen : '';
  return {
    members,
    roster: rosterLoaded ? 'ready' as const : rosterError ? 'failed' as const : 'loading' as const,
    memberId,
    choose: (id: string) => { setChosen(id); setFailed(false); },
    /** A person's stars for a recipe, null for none; the person rating when `who` is left out. */
    voteOf: (mealId: string, who: string = memberId): number | null =>
      votes.find((v) => v.mealId === mealId && v.memberId === who)?.rating ?? null,
    /** Save the chosen person's stars for a recipe; `null` takes them back. */
    rate: async (mealId: string, rating: number | null) => {
      if (!memberId) return;
      setFailed(false);
      if (!await castMealVote(fetcher, mealId, memberId, rating)) setFailed(true);
    },
    /** The last save did not reach the hub; the stars are back as they were. */
    failed,
  };
}

/**
 * A recipe's family average in words ("4.5 / 5, 3 votes"), for the phone's
 * and the editor's lists. Draws nothing while nobody has rated the recipe.
 * `short` is for a card with no room for the sentence: it shows "★ 4.5 · 3"
 * and says the sentence to a screen reader.
 */
export function FamilyMealSummary({ meal, short = false, className, style }: { meal: Pick<SavedMeal, 'id'>; short?: boolean; className?: string; style?: CSSProperties }) {
  const t = useTranslate('core');
  const summary = useFamilyMealAverage(meal.id);
  if (!summary) return null;
  const words = t('mealRatings.average', { average: summary.text, count: summary.count });
  if (short) {
    return (
      <span role="img" aria-label={words} className={className} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', ...style }}>
        ★ {summary.text} · {summary.count}
      </span>
    );
  }
  return <span className={className} style={style}>{words}</span>;
}

/**
 * What a dinner's rating board says about the dishes it has no stars for, in
 * the wall's dialog and the phone's sheet alike: nothing planned, a recipe
 * that is gone, or dishes that were typed in, which it names, so nobody hunts
 * for the stars of a dish that cannot have any. The dish names are whatever
 * the family typed, so no translation may lean on their gender or number.
 */
export function useDinnerRatingNote(plan: readonly PlannedMeal[], meals: readonly SavedMeal[], date: string): string | null {
  const t = useTranslate('core');
  const locale = useLocale();
  const gap = dinnerRatingGap(plan, meals, date);
  if (!gap) return null;
  if (gap !== 'typed') return t(`mealRatings.${gap}`);
  const dishes = dinnerTypedDishes(plan, date);
  return t('mealRatings.typed', { count: dishes.length, dishes: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(dishes) });
}
