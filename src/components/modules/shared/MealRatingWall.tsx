'use client';

import { useState, type CSSProperties } from 'react';
import { Star } from 'lucide-react';
import type { SavedMeal } from '@/types/config';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { displayFetch } from '@/lib/display-fetch';
import { fromISODate, minutesOfDay, toISODate } from '@/lib/meal-constants';
import { dinnerRatingDate, dinnerRatingMeals } from '@/lib/meal-ratings';
import { memberInitials, memberInk } from '@/lib/family-avatar';
import { useDinnerRatingNote, useFamilyMealAverage, useMealVoting } from '@/components/meals/meal-votes';
import ChoreIcon from '../chore-chart/ChoreIcon';
import { BookIcon, type Px } from './recipe-book/RecipeBookParts';
import { useMealOverlayTheme, useMealRecipeContext } from './MealRecipeContext';
import { useHiddenRowCount } from './useHiddenRowCount';
import { useWallOverlayScale } from './useWallOverlayScale';
import { WallOverlay } from './WallOverlay';
import { wallPressProps } from './wallPress';

const HEADER_FONT = "var(--font-dm-serif), 'DM Serif Display', Georgia, serif";
/** A rating dialog nobody touches closes itself, like every sheet over the wall. */
const RATING_CLOSE_MS = 120_000;
const STARS = [1, 2, 3, 4, 5] as const;

/**
 * A recipe's family average as five stars and "4.5 · 3" (the average and how
 * many people voted), in the type size the view gives it. Draws nothing for
 * a recipe nobody has rated, or on a module with Show Family Ratings off.
 */
export function FamilyMealStars({ meal, size = 24, compact = false, style }: {
  meal: SavedMeal | null;
  size?: number | string;
  /** One star and the average on one line, for a row with no room for five stars. */
  compact?: boolean;
  style?: CSSProperties;
}) {
  const t = useTranslate('core');
  const hidden = useMealRecipeContext()?.showFamilyRatings === false;
  const summary = useFamilyMealAverage(meal?.id);
  if (hidden || !summary) return null;
  if (compact) {
    return (
      <span
        role="img"
        data-testid="meal-family-stars"
        aria-label={t('mealRatings.average', { average: summary.text, count: summary.count })}
        style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, gap: '0.25em', fontSize: size, lineHeight: 1.2, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--fmp-text-2, inherit)', ...style }}
      >
        <Star size="1em" fill="currentColor" strokeWidth={0} aria-hidden="true" style={{ color: 'var(--fmp-accent, #fbbf24)' }} />
        {summary.text}
      </span>
    );
  }
  return (
    <span
      role="img"
      data-testid="meal-family-stars"
      aria-label={t('mealRatings.average', { average: summary.text, count: summary.count })}
      style={{ display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.4em', fontSize: size, lineHeight: 1.2, color: 'var(--fmp-text-2, inherit)', ...style }}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', alignSelf: 'center', gap: '0.15em', color: 'var(--fmp-accent, #fbbf24)' }}>
        {STARS.map((star) => (
          <span key={star} style={{ position: 'relative', display: 'inline-flex', width: '1em', height: '1em' }}>
            <Star size="1em" fill="currentColor" strokeWidth={0} style={{ color: 'var(--fmp-border, #80808050)' }} />
            <span style={{ position: 'absolute', inset: 0, width: `${Math.max(0, Math.min(1, summary.average - (star - 1))) * 100}%`, overflow: 'hidden' }}>
              <Star size="1em" fill="currentColor" strokeWidth={0} style={{ display: 'block', maxWidth: 'none' }} />
            </span>
          </span>
        ))}
      </span>
      <span aria-hidden="true" style={{ alignSelf: 'baseline', fontSize: '0.85em', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {summary.text} · {summary.count}
      </span>
    </span>
  );
}

/** Whether `FamilyMealStars` draws anything for a recipe, for a row that would otherwise be left out. */
export function useShowsFamilyStars(meal: SavedMeal | null): boolean {
  const hidden = useMealRecipeContext()?.showFamilyRatings === false;
  return useFamilyMealAverage(meal?.id) !== null && !hidden;
}

/** The pill a finger taps to rate: sized by its type size, so each view scales it with the rest of its text. */
function pillStyle(size: number | string): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.36em', flexShrink: 0,
    minHeight: 44, minWidth: 44, padding: '0.36em 0.9em', borderRadius: 999,
    border: '1px solid var(--fmp-border, #80808050)', background: 'var(--fmp-surface, #80808018)',
    boxShadow: 'var(--fmp-card-shadow, none)', color: 'var(--fmp-accent, inherit)',
    font: 'inherit', fontSize: size, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer',
  };
}

/**
 * "Rate Dinner" on a meal view. It always means the last dinner the family
 * sat down to (`dinnerRatingDate`), whichever day the view is showing, so it
 * never offers a dinner nobody has eaten yet. Nothing on a module with Show
 * Family Ratings off.
 */
export function WallRateDinnerButton({ size, style }: { size: number | string; style?: CSSProperties }) {
  const t = useTranslate('core');
  const ctx = useMealRecipeContext();
  const [open, setOpen] = useState(false);
  if (!ctx || ctx.showFamilyRatings === false) return null;
  return (
    <>
      <button
        type="button"
        {...wallPressProps}
        data-testid="meal-rate-dinner"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{ ...pillStyle(size), ...style }}
      >
        <Star size="1em" fill="currentColor" aria-hidden="true" />
        {t('mealRatings.dinner')}
      </button>
      {open && <DinnerRatingDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/** "Rate meal" for one recipe, on the Recipe view and the recipe card. */
export function WallRateMealButton({ meal, size, style, measuring = false }: {
  meal: SavedMeal;
  size: number | string;
  style?: CSSProperties;
  /** One of a recipe card's hidden measuring copies: the same room, nothing to find or tap. */
  measuring?: boolean;
}) {
  const t = useTranslate('core');
  const ctx = useMealRecipeContext();
  const [open, setOpen] = useState(false);
  if (ctx?.showFamilyRatings === false) return null;
  const label = t('mealRatings.forMeal', { meal: meal.name });
  return (
    <>
      <button
        type="button"
        {...wallPressProps}
        data-testid={measuring ? undefined : 'meal-rate-recipe'}
        aria-label={label}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{ ...pillStyle(size), ...style }}
      >
        <Star size="1em" fill="currentColor" aria-hidden="true" />
        {t('mealRatings.rate')}
      </button>
      {open && <WallRatingDialog title={label} meals={[meal]} onClose={() => setOpen(false)} />}
    </>
  );
}

function DinnerRatingDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslate('core');
  const locale = useFormattingLocale();
  const ctx = useMealRecipeContext();
  // The dinner is settled when the dialog opens: one left open across dinner
  // time keeps the dinner it was opened for.
  const [date] = useState(() => (ctx
    ? dinnerRatingDate(toISODate(ctx.now), minutesOfDay(ctx.now), ctx.plan, ctx.settings.defaultSlotTimes)
    : ''));
  const note = useDinnerRatingNote(ctx?.plan ?? [], ctx?.savedMeals ?? [], date);
  if (!ctx) return null;
  return (
    <WallRatingDialog
      title={t('mealRatings.dinner')}
      subtitle={fromISODate(date).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}
      meals={dinnerRatingMeals(ctx.plan, ctx.savedMeals, date)}
      note={note ?? undefined}
      named
      onClose={onClose}
    />
  );
}

/**
 * The rating dialog over the wall: who is rating, then five stars for each
 * dish. Built on `WallOverlay` like the recipe card, so it holds rotation,
 * closes itself when nobody touches it, ignores the second tap of a double
 * tap on what opened it, and is sized from the window (it is portalled out
 * of the screen's own zoom).
 */
function WallRatingDialog({ title, subtitle, meals, note, named = false, onClose }: {
  title: string;
  subtitle?: string;
  meals: SavedMeal[];
  /** Why there is nothing, or not everything, to rate. */
  note?: string;
  /** Each dish carries its name (a dinner); a single recipe is named by the title. */
  named?: boolean;
  onClose: () => void;
}) {
  const t = useTranslate('core');
  const tModules = useTranslate('modules');
  const { P, w, h, landscape } = useWallOverlayScale();
  const { panelStyle } = useMealOverlayTheme();
  const voting = useMealVoting(displayFetch);
  const { members, memberId } = voting;
  // A dinner of several dishes can be taller than the wall. The dishes scroll
  // under a finger, and a line at the bottom counts the ones still out of
  // sight, so a dish is never hidden in silence.
  const { scrollerRef, contentRef, overflows, hidden } = useHiddenRowCount('[data-testid="meal-rating-dish"]');
  // A wall on its side has the width and not the height: the people go on the
  // left and the dishes beside them, or the first dish's stars start below the
  // bottom edge once a family of five is listed above them.
  const wide = landscape && meals.length > 0;
  const label: CSSProperties = { fontSize: P(24), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--fmp-text-3)' };
  const words: CSSProperties = { margin: 0, fontSize: P(30), lineHeight: 1.4, color: 'var(--fmp-text-2)' };
  const side = `${P(48)}px`;

  const people = meals.length === 0 ? null
    : voting.roster === 'loading' ? <p role="status" style={words}>{t('mealRatings.loading')}</p>
    : voting.roster === 'failed' ? <p role="alert" style={words}>{t('mealRatings.loadError')}</p>
    : members.length === 0 ? <p style={words}>{t('mealRatings.noMembers')}</p>
    : (
      <>
        <div style={label}>{t('mealRatings.who')}</div>
        <div role="group" aria-label={t('mealRatings.who')} style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${P(176)}px, 1fr))`, gap: P(16), marginTop: P(18) }}>
          {members.map((member) => {
            const on = member.id === memberId;
            return (
              <button
                key={member.id}
                type="button"
                {...wallPressProps}
                data-testid="meal-rating-member"
                aria-pressed={on}
                onClick={() => voting.choose(member.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: P(12), minWidth: 0,
                  padding: `${P(20)}px ${P(10)}px`, borderRadius: P(28), font: 'inherit', color: 'var(--fmp-text)', cursor: 'pointer',
                  border: `${Math.max(2, P(3))}px solid ${on ? 'var(--fmp-accent)' : 'transparent'}`,
                  background: on ? 'color-mix(in srgb, var(--fmp-accent) 12%, var(--fmp-surface))' : 'var(--fmp-surface)',
                }}
              >
                <span aria-hidden="true" style={{
                  width: P(88), height: P(88), borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: member.color || 'var(--fmp-border)', color: memberInk(member.color), fontSize: P(40), fontWeight: 700,
                }}>
                  {member.emoji
                    ? <ChoreIcon value={member.emoji} size={P(50)} color={memberInk(member.color)} bare fallback={memberInitials(member.name)} />
                    : memberInitials(member.name)}
                </span>
                <span style={{ fontSize: P(28), fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</span>
              </button>
            );
          })}
        </div>
      </>
    );

  const dishes = members.length > 0 && (
    <>
      {meals.map((meal, i) => (
        <DishStars key={meal.id} meal={meal} named={named} first={wide && i === 0} P={P} voting={voting} />
      ))}
      {voting.failed && <p role="alert" style={{ margin: `${P(24)}px 0 0`, fontSize: P(28), lineHeight: 1.35, textAlign: 'center', color: 'var(--fmp-text)' }}>{t('mealRatings.saveError')}</p>}
    </>
  );

  // The scrolling box is a flex child of its frame, not `height: 100%`: the panel is only capped by a
  // max height, and a percentage of that never resolves.
  const scrolls: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', scrollbarWidth: 'none', touchAction: 'pan-y' };
  const moreBelow = overflows && hidden > 0 && (
    <div data-testid="meal-rating-more" style={{ position: 'absolute', left: 0, right: 0, bottom: P(18), display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <span style={{
        padding: `${P(10)}px ${P(28)}px`, borderRadius: 999, fontSize: P(26), fontWeight: 700, whiteSpace: 'nowrap',
        background: 'var(--fmp-surface)', color: 'var(--fmp-text-2)', border: '1px solid var(--fmp-border)', boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
      }}>
        {tModules('common.moreBelow', { count: hidden })}
      </span>
    </div>
  );

  return (
    <WallOverlay label={title} testId="meal-rating" onClose={onClose} autoCloseMs={RATING_CLOSE_MS}>
      <div
        className="fmp-root"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...panelStyle,
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: Math.min(w - P(80), P(wide ? 1560 : 920)), maxHeight: h - P(wide ? 80 : 140),
          borderRadius: P(44), boxShadow: '0 30px 80px rgba(0,0,0,0.5)', cursor: 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: P(28), padding: `${P(44)}px ${side} ${P(28)}px`, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: HEADER_FONT, fontSize: P(58), lineHeight: 1.08, color: 'var(--fmp-text)', textWrap: 'balance' }}>{title}</div>
            {subtitle && <div style={{ fontSize: P(30), color: 'var(--fmp-text-2)', marginTop: P(8) }}>{subtitle}</div>}
            {/* On its side the note joins the heading, which has the width for it, and leaves the height to the stars. */}
            {wide && note && <p style={{ ...words, marginTop: P(12) }}>{note}</p>}
          </div>
          <button
            type="button"
            {...wallPressProps}
            data-testid="meal-rating-close"
            aria-label={t('mealRatings.close')}
            onClick={onClose}
            style={{
              width: P(92), height: P(92), borderRadius: '50%', border: 0, padding: 0, flexShrink: 0, cursor: 'pointer',
              background: 'var(--fmp-border-sub)', color: 'var(--fmp-text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <BookIcon name="x" size={P(46)} />
          </button>
        </div>

        {wide ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: `0 ${side} ${P(44)}px` }}>
            {/* Wide enough for three people across, so nine fit without scrolling. */}
            <div style={{ flex: 'none', boxSizing: 'border-box', width: P(612), paddingRight: side, overflowY: 'auto', overscrollBehavior: 'contain', scrollbarWidth: 'none', touchAction: 'pan-y' }}>
              {people}
            </div>
            <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', paddingLeft: side, borderLeft: '1px solid var(--fmp-border-sub)' }}>
              <div ref={scrollerRef} style={scrolls}>
                <div ref={contentRef}>{dishes}</div>
              </div>
              {moreBelow}
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div ref={scrollerRef} style={{ ...scrolls, padding: `0 ${side} ${P(44)}px` }}>
              <div ref={contentRef}>
                {note && <p style={{ ...words, marginBottom: P(28) }}>{note}</p>}
                {people}
                {dishes}
              </div>
            </div>
            {moreBelow}
          </div>
        )}
      </div>
    </WallOverlay>
  );
}

/** One dish on the board: what the family gave it so far, and the chosen person's five stars. */
function DishStars({ meal, named, first = false, P, voting }: {
  meal: SavedMeal;
  named: boolean;
  /** Top of its own column: no rule or gap above it. */
  first?: boolean;
  P: Px;
  voting: ReturnType<typeof useMealVoting>;
}) {
  const t = useTranslate('core');
  const { memberId } = voting;
  const mine = voting.voteOf(meal.id);
  return (
    <section
      data-testid="meal-rating-dish"
      aria-label={t('mealRatings.forMeal', { meal: meal.name })}
      style={{ marginTop: first ? 0 : P(32), paddingTop: first ? 0 : P(30), borderTop: first ? 0 : '1px solid var(--fmp-border-sub)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: P(14) }}
    >
      {named && <div style={{ fontSize: P(40), fontWeight: 600, lineHeight: 1.2, color: 'var(--fmp-text)', textAlign: 'center', textWrap: 'balance' }}>{meal.name}</div>}
      <FamilyMealStars meal={meal} size={P(30)} />
      <div role="group" aria-label={t('mealRatings.stars')} style={{ display: 'flex', justifyContent: 'center', gap: P(14), opacity: memberId ? 1 : 0.4 }}>
        {STARS.map((star) => {
          const filled = mine !== null && star <= mine;
          return (
            <button
              key={star}
              type="button"
              {...wallPressProps}
              data-testid="meal-rating-star"
              disabled={!memberId}
              aria-pressed={mine === star}
              aria-label={t('mealRatings.star', { count: star })}
              onClick={() => void voting.rate(meal.id, star)}
              style={{
                width: P(128), height: P(128), border: 0, padding: 0, borderRadius: P(28), background: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: memberId ? 'pointer' : 'default',
                color: filled ? 'var(--fmp-accent)' : 'var(--fmp-text-3)',
              }}
            >
              <Star size={P(96)} strokeWidth={1.5} fill={filled ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div style={{ minHeight: P(64), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: P(22), fontSize: P(28), color: 'var(--fmp-text-2)', textAlign: 'center' }}>
        {!memberId ? t('mealRatings.choose') : mine === null ? t('mealRatings.notRated') : (
          <>
            <span>{t('mealRatings.yourVote', { rating: mine })}</span>
            <button
              type="button"
              {...wallPressProps}
              data-testid="meal-rating-clear"
              onClick={() => void voting.rate(meal.id, null)}
              style={{
                minHeight: P(64), padding: `0 ${P(26)}px`, borderRadius: 999, border: '1px solid var(--fmp-border)', background: 'transparent',
                font: 'inherit', fontWeight: 600, color: 'var(--fmp-text-2)', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {t('mealRatings.clear')}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
