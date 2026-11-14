'use client';

import type { SavedMeal } from '@/types/config';
import { useTranslate } from '@/i18n';
import { editorFetch } from '@/lib/editor-fetch';
import { FamilyMealSummary, useMealVoting } from '@/components/meals/meal-votes';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * The family's ratings for one recipe, in the meal planner window's side
 * panel: the average so far, and a person's own stars picked from a list.
 * Each star saves at once, apart from the form's Save.
 */
export function MealRatingControl({ meal }: { meal: SavedMeal }) {
  const t = useTranslate('core');
  const voting = useMealVoting(editorFetch);
  const { members, memberId } = voting;
  const mine = voting.voteOf(meal.id);
  const labelClass = 'text-[11px] font-bold text-hs-text-faint uppercase tracking-wider mb-1.5';
  return (
    <div className="mb-4" data-testid="meal-rating-control">
      <div className="flex items-baseline justify-between gap-2">
        <div className={labelClass}>{t('mealRatings.rate')}</div>
        <FamilyMealSummary meal={meal} className="text-xs text-hs-text-faint" />
      </div>
      {voting.roster === 'failed' && <p role="alert" className="text-xs text-hs-text-faint">{t('mealRatings.loadError')}</p>}
      {voting.roster === 'ready' && members.length === 0 && <p className="text-xs text-hs-text-faint">{t('mealRatings.noMembers')}</p>}
      {members.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            aria-label={t('mealRatings.who')}
            className={`min-w-0 flex-1 ${MODAL_INPUT_CLASS} cursor-pointer`}
            value={memberId}
            onChange={(e) => voting.choose(e.target.value)}
          >
            <option value="">{t('mealRatings.who')}</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
          <div role="group" aria-label={t('mealRatings.stars')} className="flex shrink-0 gap-0.5">
            {STARS.map((star) => (
              <button
                key={star}
                type="button"
                disabled={!memberId}
                className="text-lg leading-none transition-colors disabled:opacity-40"
                style={{ color: mine !== null && star <= mine ? '#f59e0b' : 'var(--hs-text-faint)' }}
                aria-label={t('mealRatings.star', { count: star })}
                aria-pressed={mine === star}
                onClick={() => void voting.rate(meal.id, star)}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      )}
      {memberId && mine !== null && (
        <button type="button" className="mt-1 text-xs text-hs-text-faint underline hover:text-hs-text-body" onClick={() => void voting.rate(meal.id, null)}>
          {t('mealRatings.clear')}
        </button>
      )}
      {voting.failed && <p role="alert" className="mt-1 text-xs text-hs-danger">{t('mealRatings.saveError')}</p>}
    </div>
  );
}
