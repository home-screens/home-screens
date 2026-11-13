'use client';

import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Star } from 'lucide-react';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { memberInitials, memberInk } from '@/lib/family-avatar';
import { wallPress } from '@/components/modules/shared/wallPress';
import { fromISODate } from '@/lib/meal-constants';
import { useMealRecipeContext, useMealOverlayTheme } from '@/components/modules/shared/MealRecipeContext';
import styles from './FamilyMealRating.module.css';
import type { PlannedMeal, SavedMeal } from '@/types/config';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import { useAutoClose } from '@/components/modules/shared/useAutoClose';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useInteractionHold } from '@/lib/interaction-hold';
import { dinnerRatingMeals, familyMealAverage } from '@/lib/meal-ratings';
import { useFamilyMealRatings } from './useFamilyMealRatings';

const button: CSSProperties = { minHeight: 44, minWidth: 44, padding: '8px 12px', border: '1px solid currentColor', borderRadius: 10, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 };

export function FamilyMealSummary({ meal, style, compact = false, showStar = true }: { meal: SavedMeal; style?: CSSProperties; compact?: boolean; showStar?: boolean }) {
  const t = useTranslate('core');
  const locale = useFormattingLocale();
  const { data } = useFamilyMealRatings();
  const summary = familyMealAverage(data?.ratings ?? [], meal.id, new Set(data?.members.map((m) => m.id)));
  if (summary.average === null) return null;
  const average = summary.average.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const label = t('mealRatings.average', { average, count: summary.count });
  const text = compact ? `★ ${average} · ${summary.count}` : label;
  return <span aria-label={compact ? label : undefined} title={label} style={style}>{showStar ? text : text.replace(/^★\s*/u, '')}</span>;
}

// Each wall view supplies its own canvas-scaled metadata size.
export function FamilyMealStars(props: { meal: SavedMeal | null; size?: number | string; style?: CSSProperties }) {
  const context = useMealRecipeContext();
  return context?.showFamilyRatings === false ? null : <VisibleFamilyMealStars {...props} />;
}

function VisibleFamilyMealStars({ meal, size = 24, style }: { meal: SavedMeal | null; size?: number | string; style?: CSSProperties }) {
  const t = useTranslate('core');
  const locale = useFormattingLocale();
  const { data } = useFamilyMealRatings();
  const summary = familyMealAverage(data?.ratings ?? [], meal?.id ?? '', new Set(data?.members.map((m) => m.id)));
  if (!meal || summary.average === null) return null;
  const average = summary.average.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return <span role="img" aria-label={t('mealRatings.average', { average, count: summary.count })} style={{ display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.4em', fontSize: size, lineHeight: 1.2, color: 'var(--fmp-text-2, inherit)', ...style }}>
    <span aria-hidden="true" style={{ display: 'inline-flex', alignSelf: 'center', gap: '0.15em', color: 'var(--fmp-accent, #fbbf24)' }}>
      {[0, 1, 2, 3, 4].map((star) => <span key={star} style={{ position: 'relative', display: 'inline-flex', width: '1em', height: '1em' }}>
        <Star size="1em" fill="currentColor" strokeWidth={0} style={{ color: 'var(--fmp-border, #80808050)' }} />
        <span style={{ position: 'absolute', inset: 0, width: `${Math.max(0, Math.min(1, summary.average! - star)) * 100}%`, overflow: 'hidden' }}><Star size="1em" fill="currentColor" strokeWidth={0} style={{ display: 'block', maxWidth: 'none' }} /></span>
      </span>)}
    </span>
    <span aria-hidden="true" style={{ alignSelf: 'baseline', fontSize: '0.85em', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{average} · {summary.count}</span>
  </span>;
}

export function FamilyMealRatingPanel({ meal, showTitle = true }: { meal: SavedMeal; showTitle?: boolean }) {
  const t = useTranslate('core');
  const { data, loadError, saving, saveError, saved, save, retry } = useFamilyMealRatings();
  const [chosen, setChosen] = useState('');
  const memberId = data?.members.some((m) => m.id === chosen) ? chosen : '';
  const hasVotes = data?.ratings.some((v) => v.mealId === meal.id && data.members.some((m) => m.id === v.memberId));
  const vote = data?.ratings.find((v) => v.mealId === meal.id && v.memberId === memberId)?.rating;
  return <section className={styles.panel} aria-label={t('mealRatings.forMeal', { meal: meal.name })}>
    {showTitle && <h3 className={styles.mealTitle}>{meal.name}</h3>}
    <div className={styles.summary}>
      <Star size={28} fill="currentColor" aria-hidden="true" />
      <div>{hasVotes ? <FamilyMealSummary meal={meal} showStar={false} /> : t('mealRatings.choose')}
        {meal.rating !== undefined && <p className={styles.original}>{t('mealRatings.original', { rating: meal.rating })}</p>}
      </div>
    </div>
    {loadError && <p role="alert">{t('mealRatings.loadError')} <button type="button" style={button} onClick={retry}>{t('mealRatings.retry')}</button></p>}
    {!data && !loadError && <p role="status">{t('mealRatings.loading')}</p>}
    {data && data.members.length === 0 && <p>{t('mealRatings.noMembers')}</p>}
    {!!data?.members.length && <>
      <div className={styles.who}>{t('mealRatings.who')}</div>
      <div role="group" aria-label={t('mealRatings.who')} className={styles.members}>
        {data.members.map((member) => {
          const own = data.ratings.find((v) => v.mealId === meal.id && v.memberId === member.id);
          return <button key={member.id} type="button" aria-label={member.name} aria-pressed={memberId === member.id} disabled={saving} className={styles.member} onClick={() => setChosen(member.id)}>
            <span className={styles.avatar} style={{ background: member.color || '#6366f1', color: memberInk(member.color) }} aria-hidden="true">{member.emoji ? <ChoreIcon value={member.emoji} size={26} color={memberInk(member.color)} bare fallback={memberInitials(member.name)} /> : memberInitials(member.name)}</span>
            <span className={styles.memberName}>{member.name}</span>
            <span className={styles.memberVote}>{own ? `★ ${own.rating} / 5` : '—'}</span>
          </button>;
        })}
      </div>
      <div role="group" aria-label={t('mealRatings.stars')} className={styles.stars}>
        {[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" disabled={!memberId || saving || !!loadError} aria-pressed={vote === star} aria-label={t('mealRatings.star', { count: star })} onClick={() => void save(meal.id, memberId, star)} className={styles.star} data-filled={star <= (vote ?? 0)}>
          <Star aria-hidden="true" strokeWidth={1.5} fill={star <= (vote ?? 0) ? 'currentColor' : 'none'} />
        </button>)}
      </div>
      {memberId && <p>{vote ? t('mealRatings.yourVote', { rating: vote }) : t('mealRatings.notRated')}</p>}
      {vote && <button type="button" disabled={saving || !!loadError} style={button} onClick={() => void save(meal.id, memberId, null)}>{t('mealRatings.clear')}</button>}
    </>}
    <div className={styles.status} aria-live="polite">{saving ? t('mealRatings.saving') : saved && !saveError ? t('mealRatings.saved') : ''}</div>
    {saveError && <p role="alert">{t('mealRatings.saveError')}</p>}
  </section>;
}

// A hidden module unmounts its rating UI; phone and editor callers without module context stay available.
export function FamilyMealRatingButton(props: { meal: SavedMeal; style?: CSSProperties; iconOnly?: boolean }) {
  const context = useMealRecipeContext();
  return context?.showFamilyRatings === false ? null : <VisibleFamilyMealRatingButton {...props} />;
}

function VisibleFamilyMealRatingButton({ meal, style, iconOnly = false }: { meal: SavedMeal; style?: CSSProperties; iconOnly?: boolean }) {
  const t = useTranslate('core');
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-label={t('mealRatings.forMeal', { meal: meal.name })} {...wallPress(iconOnly ? undefined : styles.dinnerTrigger)} style={{ ...button, ...style }} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>{iconOnly ? <Star size="1em" aria-hidden="true" /> : <><Star size="1em" fill="currentColor" aria-hidden="true" />{t('mealRatings.rate')}</>}</button>
    {open && <RatingDialog title={t('mealRatings.forMeal', { meal: meal.name })} onClose={() => setOpen(false)}><FamilyMealRatingPanel meal={meal} showTitle={false} /></RatingDialog>}
  </>;
}

export function DinnerRatingBoard({ plan, meals, date }: { plan: PlannedMeal[]; meals: SavedMeal[]; date: string }) {
  const t = useTranslate('core');
  const dinner = dinnerRatingMeals(plan, meals, date);
  const entries = plan.filter((p) => p.date === date && p.slot === 'dinner');
  const typed = entries.some((p) => p.customText || p.courses?.some((c) => c.customText));
  return <div>
    <p>{t('mealRatings.hint')}</p>
    {!entries.length && <p>{t('mealRatings.noDinner')}</p>}
    {typed && <p>{t('mealRatings.typed')}</p>}
    {entries.length > 0 && !typed && !dinner.length && <p>{t('mealRatings.unavailable')}</p>}
    {dinner.map((meal) => <FamilyMealRatingPanel key={meal.id} meal={meal} />)}
  </div>;
}

export function RateDinnerButton(props: { plan: PlannedMeal[]; meals: SavedMeal[]; date: string; style?: CSSProperties }) {
  const context = useMealRecipeContext();
  return context?.showFamilyRatings === false ? null : <VisibleRateDinnerButton {...props} />;
}

function VisibleRateDinnerButton({ plan, meals, date, style }: { plan: PlannedMeal[]; meals: SavedMeal[]; date: string; style?: CSSProperties }) {
  const t = useTranslate('core');
  const locale = useFormattingLocale();
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" {...wallPress(styles.dinnerTrigger)} style={{ ...button, ...style }} onClick={(e) => { e.stopPropagation(); setOpen(true); }}><Star size="1em" fill="currentColor" aria-hidden="true" />{t('mealRatings.dinner')}</button>
    {open && <RatingDialog title={t('mealRatings.dinner')} onClose={() => setOpen(false)}><p>{fromISODate(date).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}</p><DinnerRatingBoard plan={plan} meals={meals} date={date} /></RatingDialog>}
  </>;
}

// Require the displayed date: Today and Next Meal can show tomorrow before midnight.
export function WallRateDinnerButton({ size, style, date }: { size: number; style?: CSSProperties; date: string }) {
  const ctx = useMealRecipeContext();
  if (!ctx) return null;
  return <RateDinnerButton plan={ctx.plan} meals={ctx.savedMeals} date={date} style={{ fontSize: size, gap: size * 0.36, padding: `${size * 0.36}px ${size * 0.9}px`, ...style }} />;
}

function RatingDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useTranslate('core');
  const { panelStyle } = useMealOverlayTheme();
  const ref = useFocusTrap<HTMLDivElement>({ focus: 'container' });
  useInteractionHold();
  const touched = useAutoClose(onClose, 120_000);
  return createPortal(<div onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }} className={styles.backdrop} style={{ zIndex: DISPLAY_LAYERS.moduleOverlay }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`fmp-root ${styles.dialog}`} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }} onPointerDown={(e) => { e.stopPropagation(); touched(); }} style={{ ...panelStyle, overflowY: 'auto' }}>
      <div className={styles.header}><h2>{title}</h2><button type="button" style={button} className={styles.done} onClick={onClose}>{t('mealRatings.close')}</button></div>
      {children}
    </div>
  </div>, document.body);
}
