'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Star } from 'lucide-react';
import type { MealSettings, PlannedMeal, SavedMeal } from '@/types/config';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { editorFetch } from '@/lib/editor-fetch';
import { memberInitials, memberInk } from '@/lib/family-avatar';
import { fromISODate, getMealSlotLabelKey } from '@/lib/meal-constants';
import { dinnerRatingDate, dinnerRatingMeals } from '@/lib/meal-ratings';
import { withAlpha } from '@/lib/hex-color';
import { FamilyMealSummary, useDinnerRatingNote, useMealVoting } from '@/components/meals/meal-votes';
import BottomSheet from './BottomSheet';
import { REMOTE_ACCENT } from './chore-form-styles';
import { INPUT_STYLE, type MealsWeekDay } from './meals-shared';

const STARS = [1, 2, 3, 4, 5] as const;
const NOTE: CSSProperties = { fontSize: 14, lineHeight: 1.45, color: 'var(--hs-text-muted)', margin: 0 };

/**
 * The phone's rating board: who is rating, then five stars for each dish.
 * `DinnerRatingSheet` draws it for a day's dinner; `MealRateButton` opens it
 * in a sheet for one recipe. `named` puts each dish's name over its
 * stars (a dinner has several; a sheet for one recipe is already titled).
 */
export function MealRatingBoard({ meals, named = false }: { meals: SavedMeal[]; named?: boolean }) {
  const t = useTranslate('core');
  const voting = useMealVoting(editorFetch);
  const { members, memberId } = voting;

  if (voting.roster === 'loading') return <p role="status" style={NOTE}>{t('mealRatings.loading')}</p>;
  if (voting.roster === 'failed') return <p role="alert" style={NOTE}>{t('mealRatings.loadError')}</p>;
  if (members.length === 0) return <p style={NOTE}>{t('mealRatings.noMembers')}</p>;

  return (
    <div data-testid="meal-rating-board">
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--hs-text-muted)', marginBottom: 8 }}>{t('mealRatings.who')}</div>
      <div role="group" aria-label={t('mealRatings.who')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {members.map((member) => {
          const on = member.id === memberId;
          return (
            <button
              key={member.id}
              type="button"
              aria-pressed={on}
              onClick={() => voting.choose(member.id)}
              className="press-scale"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, maxWidth: '100%', padding: '5px 14px 5px 6px', borderRadius: 999,
                border: `1px solid ${on ? REMOTE_ACCENT : 'var(--hs-border-strong)'}`,
                background: on ? withAlpha(REMOTE_ACCENT, 0.16) : 'var(--hs-bg-hover)',
                color: 'var(--hs-text-body)', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span aria-hidden="true" style={{
                width: 32, height: 32, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: member.color || 'var(--hs-border-strong)', color: memberInk(member.color), fontSize: 14, fontWeight: 700,
              }}>
                {memberInitials(member.name)}
              </span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</span>
            </button>
          );
        })}
      </div>

      {meals.map((meal) => {
        const mine = voting.voteOf(meal.id);
        return (
          <section
            key={meal.id}
            data-testid="meal-rating-dish"
            aria-label={t('mealRatings.forMeal', { meal: meal.name })}
            style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'var(--hs-bg-card)' }}
          >
            {named && <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--hs-text-body)' }}>{meal.name}</div>}
            <FamilyMealSummary meal={meal} style={{ display: 'block', fontSize: 12, color: 'var(--hs-text-faint)', marginTop: named ? 2 : 0 }} />
            <div role="group" aria-label={t('mealRatings.stars')} style={{ display: 'flex', justifyContent: 'center', gap: 4, margin: '8px 0 2px', opacity: memberId ? 1 : 0.4 }}>
              {STARS.map((star) => {
                const filled = mine !== null && star <= mine;
                return (
                  <button
                    key={star}
                    type="button"
                    disabled={!memberId}
                    aria-pressed={mine === star}
                    aria-label={t('mealRatings.star', { count: star })}
                    onClick={() => void voting.rate(meal.id, star)}
                    className="press-scale"
                    style={{
                      width: 52, height: 52, padding: 0, border: 'none', borderRadius: 12, background: 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: memberId ? 'pointer' : 'default',
                      color: filled ? '#f59e0b' : 'var(--hs-border-strong)',
                    }}
                  >
                    <Star size={36} strokeWidth={1.6} fill={filled ? 'currentColor' : 'none'} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, color: 'var(--hs-text-muted)', textAlign: 'center' }}>
              {!memberId ? t('mealRatings.choose') : mine === null ? t('mealRatings.notRated') : (
                <>
                  <span>{t('mealRatings.yourVote', { rating: mine })}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      // This button goes away with the vote. Hand focus to the
                      // stars first, or a keyboard is left on the page behind
                      // the sheet, where Escape and Tab no longer reach it.
                      e.currentTarget.closest('section')?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
                      void voting.rate(meal.id, null);
                    }}
                    style={{ minHeight: 44, padding: '0 10px', border: 'none', background: 'transparent', color: REMOTE_ACCENT, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {t('mealRatings.clear')}
                  </button>
                </>
              )}
            </div>
          </section>
        );
      })}

      {voting.failed && <p role="alert" style={{ ...NOTE, marginTop: 12, color: 'var(--hs-danger)' }}>{t('mealRatings.saveError')}</p>}
    </div>
  );
}

/**
 * "Rate" for one recipe: opens the board in a sheet. `icon` is the 44 px
 * button on a Library card; `wide` is the full-width one in the meal sheet
 * and the meal form, which says what it does in words.
 */
export default function MealRateButton({ meal, variant = 'icon', style }: { meal: SavedMeal; variant?: 'icon' | 'wide'; style?: CSSProperties }) {
  const t = useTranslate('core');
  const [open, setOpen] = useState(false);
  const wide = variant === 'wide';
  const label = t('mealRatings.forMeal', { meal: meal.name });
  return (
    <>
      <button
        type="button"
        data-testid="meal-rate-button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className="press-scale"
        style={{
          border: '1px solid var(--hs-border-strong)', background: 'var(--hs-bg-hover)', color: 'var(--hs-text-secondary)',
          borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flex: 'none', cursor: 'pointer', fontFamily: 'inherit',
          ...(wide
            ? { width: '100%', minHeight: 44, padding: '10px 14px', fontSize: 14, fontWeight: 600 }
            : { width: 44, height: 44, padding: 0 }),
          ...style,
        }}
      >
        <Star size={wide ? 18 : 19} strokeWidth={2} aria-hidden />
        {wide && t('mealRatings.rate')}
      </button>
      {/* On the page itself: the meal sheet this button can sit in is a
          dialog of its own, and a sheet inside it would be held to its box. */}
      {open && createPortal(
        <BottomSheet title={label} onClose={() => setOpen(false)} zIndex={210} testId="meal-rating-sheet">
          <MealRatingBoard meals={[meal]} />
        </BottomSheet>,
        document.body,
      )}
    </>
  );
}

/**
 * "Rate Dinner", from the button in the Meals header: a day's dinner and its
 * board, in a sheet over whichever tab is open. It opens on the last dinner
 * the family sat down to (see `dinnerRatingDate`), and the list holds the
 * days of the week the tab is showing, since that is the week `plan` covers.
 * `waiting` stands in for the board while that week cannot be read.
 */
export function DinnerRatingSheet({ weekDates, todayISO, nowMinutes, plan, meals, defaultSlotTimes, waiting, onClose }: {
  weekDates: MealsWeekDay[];
  todayISO: string;
  nowMinutes: number;
  plan: PlannedMeal[];
  meals: SavedMeal[];
  defaultSlotTimes: MealSettings['defaultSlotTimes'];
  waiting: ReactNode;
  onClose: () => void;
}) {
  const t = useTranslate('core');
  const tModules = useTranslate('modules');
  const locale = useFormattingLocale();
  const [picked, setPicked] = useState<string | null>(null);

  const inWeek = (day: string) => weekDates.some((d) => d.date === day);
  const lastDinner = dinnerRatingDate(todayISO, nowMinutes, plan, defaultSlotTimes);
  const date = picked ?? (inWeek(lastDinner) ? lastDinner : inWeek(todayISO) ? todayISO : weekDates[0].date);
  const note = useDinnerRatingNote(plan, meals, date);
  const dishes = dinnerRatingMeals(plan, meals, date);

  return (
    <BottomSheet title={t('mealRatings.dinner')} onClose={onClose} testId="dinner-rating-sheet">
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--hs-text-muted)', marginBottom: 14 }}>
        {tModules(getMealSlotLabelKey('dinner'))}
        <select
          value={date}
          onChange={(e) => setPicked(e.target.value)}
          style={{ ...INPUT_STYLE, display: 'block', minHeight: 44, marginTop: 6, background: 'var(--hs-bg-body)' }}
        >
          {weekDates.map((day) => (
            <option key={day.date} value={day.date}>
              {fromISODate(day.date).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}
            </option>
          ))}
        </select>
      </label>
      {waiting ?? (
        <>
          {note && <p style={{ ...NOTE, marginBottom: 14 }}>{note}</p>}
          {dishes.length > 0 && (
            <>
              <MealRatingBoard meals={dishes} named />
              <p style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--hs-text-faint)', margin: '14px 0 0' }}>{t('mealRatings.hint')}</p>
            </>
          )}
        </>
      )}
    </BottomSheet>
  );
}
