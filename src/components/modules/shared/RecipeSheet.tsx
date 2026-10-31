'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { MealSlotType, SavedMeal, TimeFormat } from '@/types/config';
import { getMealCourseLabelKey, type ResolvedCourse } from '@/lib/meal-courses';
import { SLOT_META, formatMealTime, getMealSlotLabelKey } from '@/lib/meal-constants';
import { batchWord, mealHasRecipe, pageRecipeSteps, recipePageOfStep, recipeStats, type RecipeDetail, type RecipeStep } from '@/lib/meal-recipe';
import { holdRotationFor } from '@/lib/interaction-hold';
import { useFontsReady } from '@/hooks/useFontsReady';
import { useTranslate } from '@/i18n';
import MealPicture, { mealHasPicture } from '@/components/meals/MealPicture';
import { useMinutesText } from './useMealMinutes';
import type { MealRecipeState } from './useMealRecipe';

/** With nobody tapping, a long recipe's pages turn this often. */
export const RECIPE_PAGE_TURN_MS = 30_000;
/**
 * A tap on a step keeps the screen where it is this long. Someone cooking
 * taps Next a few minutes apart, and the usual tap hold (seconds) would
 * rotate the recipe away between two steps.
 */
export const RECIPE_TAP_HOLD_MS = 5 * 60_000;

const BOLT = 'M13 10V3L4 14h7v7l9-11h-7z';

/** When and which meal a recipe is for, for the badge above its name. */
export interface RecipeServing {
  slot: MealSlotType;
  /** HH:MM, when the meal has a serving time. */
  time?: string;
  /** Being served right now. */
  now: boolean;
}

interface RecipeSheetProps {
  meal: SavedMeal;
  recipe: MealRecipeState;
  /** Batches planned (Mealie's double batch is 2): the servings and the batch figure follow it. */
  scale?: number;
  serving: RecipeServing | null;
  courses: ResolvedCourse[];
  timeFormat: TimeFormat;
  /** Authored pixels (at 1080 wide, Medium text) to this surface's pixels. */
  P: (n: number) => number;
  /** Padding around the whole sheet, in this surface's pixels. */
  padding: string;
  headerFont: string;
  layout: 'portrait' | 'landscape';
  showPicture: boolean;
  /** Touch: Back and Next step, steps and courses as buttons. */
  interactive: boolean;
  /**
   * Back and Next step on every recipe (the Recipe view), or only on one too
   * long for a page (the recipe card, where a short recipe is read at a glance).
   */
  stepButtons?: 'always' | 'paged';
  /** Tapping a course with a recipe of its own. */
  onCourse?: (meal: SavedMeal) => void;
  /** A new key starts the recipe over: page one, no step marked. */
  resetKey: string;
  /** Drawn under everything (the card's QR code); `measuring` is the hidden copy, which must carry no test ids. */
  footer?: (measuring: boolean) => ReactNode;
  /** Room kept free at the top right of the header (the card's close button). */
  headerEndGap?: number;
}

const SECTION_LABEL: CSSProperties = {
  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--fmp-text-3)',
};

/**
 * One recipe, read from across the kitchen: the dish, its times and courses,
 * the ingredients and the numbered steps, on the full-screen theme's palette
 * (the `--fmp-*` variables). The Recipe view and the recipe card both draw
 * it. Sizes are authored at 1080 wide and go through `P`.
 *
 * A recipe too long for the box is cut into pages of whole steps: page one
 * keeps the header and the ingredients, later pages a slim header and steps
 * only. The pages are measured from a hidden copy laid out exactly like the
 * visible one, so a page is cut where the wall would actually clip it. With
 * nobody tapping, pages turn every 30 seconds; on a touch screen Back and
 * Next step move a marker through the steps and the page follows it.
 */
export function RecipeSheet(props: RecipeSheetProps) {
  const { meal, recipe, scale = 1, serving, courses, timeFormat, P, padding, headerFont, layout, showPicture, interactive, stepButtons = 'always', onCourse, resetKey, footer, headerEndGap } = props;
  const t = useTranslate('modules');
  const minutesText = useMinutesText();
  const fontsReady = useFontsReady();
  const detail: RecipeDetail | null = recipe.status === 'ready' ? recipe.recipe : null;
  const steps = useMemo(() => detail?.steps ?? [], [detail]);
  const paged = steps.length > 0;

  // ── Pages, measured from the hidden copy ──
  const rootRef = useRef<HTMLDivElement>(null);
  const firstListRef = useRef<HTMLDivElement>(null);
  const restListRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [measured, setMeasured] = useState<{ key: string; pages: number[][] } | null>(null);
  const gap = 0;
  // Everything that moves a step or the room for them: the recipe's text, the
  // box, the fonts, the scale. The measurement belongs to exactly one key.
  const contentKey = useMemo(
    () => [...steps.map((st) => `${st.heading ?? ''}${st.lead ?? ''}${st.text}`.length), '|', ...(detail?.ingredients ?? []).map((i) => i.text.length)].join(','),
    [steps, detail],
  );
  const measureKey = `${resetKey}|${layout}|${box?.w}x${box?.h}|${fontsReady}|${contentKey}|${courses.length}|${P(100)}|${interactive}|${recipe.status}`;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setBox({ w: el.clientWidth, h: el.clientHeight });
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setBox((prev) => (prev && prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measuredKey = measured?.key;
  useLayoutEffect(() => {
    if (!paged || !box || measuredKey === measureKey) return;
    const first = firstListRef.current;
    const rest = restListRef.current;
    if (!first || !rest) return;
    const heights = Array.from(first.children).map((c) => (c as HTMLElement).offsetHeight);
    setMeasured({ key: measureKey, pages: pageRecipeSteps(heights, first.clientHeight, rest.clientHeight, gap) });
  }, [paged, box, measuredKey, measureKey]);

  const pages = useMemo(
    () => (paged && measured?.key === measureKey ? measured.pages : [steps.map((_, i) => i)]),
    [paged, measured, measureKey, steps],
  );

  // ── Landscape ingredients: the left column is a fixed box with no pages, so
  // a long list steps its type down until it fits rather than clipping. ──
  const ingBoxRef = useRef<HTMLDivElement>(null);
  const [ingFit, setIngFit] = useState<{ key: string; scale: number }>({ key: '', scale: 1 });
  const ingScale = ingFit.key === measureKey ? ingFit.scale : 1;
  useLayoutEffect(() => {
    if (layout !== 'landscape') return;
    const el = ingBoxRef.current;
    if (!el) return;
    if (ingFit.key !== measureKey) {
      setIngFit({ key: measureKey, scale: 1 });
      return;
    }
    if (el.scrollHeight > el.clientHeight + 1 && ingFit.scale > 0.55) {
      setIngFit({ key: measureKey, scale: Math.round((ingFit.scale - 0.05) * 100) / 100 });
    }
  }, [layout, measureKey, ingFit]);

  // ── Page and step marker ──
  const [page, setPage] = useState(0);
  const [marker, setMarker] = useState<number | null>(null);
  useEffect(() => {
    setPage(0);
    setMarker(null);
  }, [resetKey]);
  const shownPage = Math.min(marker !== null ? recipePageOfStep(pages, marker) : page, pages.length - 1);

  useEffect(() => {
    if (marker !== null || pages.length <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages.length), RECIPE_PAGE_TURN_MS);
    return () => clearInterval(id);
  }, [marker, pages.length, page]);

  const hold = useCallback(() => { holdRotationFor(RECIPE_TAP_HOLD_MS); }, []);
  const nextStep = useCallback(() => {
    hold();
    if (steps.length === 0) return;
    setMarker((m) => {
      if (m === null) return pages[shownPage]?.[0] ?? pages.find((p) => p.length > 0)?.[0] ?? 0;
      return Math.min(m + 1, steps.length - 1);
    });
  }, [hold, steps.length, pages, shownPage]);
  const backStep = useCallback(() => {
    hold();
    if (marker === null) {
      setPage(Math.max(0, shownPage - 1));
      return;
    }
    setMarker(Math.max(0, marker - 1));
  }, [hold, marker, shownPage]);
  const jumpTo = useCallback((i: number) => { hold(); setMarker(i); }, [hold]);

  // ── Pieces ── (`m`: drawing the hidden measuring copy, which carries no test ids)
  const tid = (name: string, m: boolean) => (m ? undefined : name);
  const picture = (size: number) => {
    if (!showPicture || !mealHasPicture(meal)) return null;
    if (meal.photoUrl) {
      return <MealPicture meal={meal} photoSize={`${P(size)}px`} size="min" style={{ flexShrink: 0 }} />;
    }
    return (
      <span style={{
        width: P(size), height: P(size), borderRadius: P(size * 0.18), flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', background: 'var(--fmp-surface)', border: '1px solid var(--fmp-border-sub)',
      }}>
        <MealPicture meal={meal} photoSize={`${P(size)}px`} emojiStyle={{ fontSize: P(size * 0.62), lineHeight: 1 }} />
      </span>
    );
  };

  const pill = (size: number, m: boolean) => {
    if (!serving) return null;
    const color = SLOT_META[serving.slot].color;
    return (
      <span data-testid={tid('recipe-serving', m)} style={{
        fontSize: P(size), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color,
        background: `${color}1a`, padding: `${P(size * 0.33)}px ${P(size * 0.9)}px`, borderRadius: P(size * 0.42),
        display: 'inline-flex', alignItems: 'center', gap: P(size * 0.5), whiteSpace: 'nowrap', maxWidth: '100%',
      }}>
        {serving.now && (
          <>
            <svg width={P(size)} height={P(size)} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }} aria-hidden="true"><path d={BOLT} /></svg>
            <span>{t('fullscreen-meal-planner.nextMealLabels.now')}</span>
            <span style={{ opacity: 0.5 }}>&middot;</span>
          </>
        )}
        <span>{t(getMealSlotLabelKey(serving.slot))}</span>
        {serving.time && (
          <span style={{ fontWeight: 600, color: 'var(--fmp-text-3)', letterSpacing: 0, textTransform: 'none', fontVariantNumeric: 'tabular-nums' }}>
            {formatMealTime(serving.time, timeFormat)}
          </span>
        )}
      </span>
    );
  };

  const batchText = (n: number) => {
    const word = batchWord(n);
    return word.key === 'batchTimes' ? t('meal-planner.recipe.batchTimes', { scale: word.scale }) : t(`meal-planner.recipe.${word.key}`);
  };

  const stats = (value: number, label: number, gapPx: number, m: boolean) => {
    const list = recipeStats(meal, scale);
    if (list.length === 0) return null;
    return (
      <div style={{ display: 'flex', gap: P(gapPx), flexWrap: 'wrap' }}>
        {list.map((s) => (
          <div key={s.kind} style={{ display: 'flex', flexDirection: 'column', gap: P(2) }}>
            <span style={{ ...SECTION_LABEL, fontSize: P(label) }}>{t(`meal-planner.recipe.${s.kind}`)}</span>
            <span
              data-testid={s.kind === 'batch' ? tid('recipe-batch', m) : undefined}
              style={{ fontSize: P(value), fontWeight: 600, color: s.kind === 'batch' ? 'var(--fmp-accent)' : 'var(--fmp-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
            >
              {s.kind === 'serves' ? s.count : s.kind === 'batch' ? batchText(s.scale) : minutesText(s.minutes)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const courseLine = (top: number, m: boolean) => {
    if (courses.length === 0) return null;
    return (
      <div data-testid={tid('recipe-courses', m)} style={{ display: 'flex', flexWrap: 'wrap', columnGap: P(interactive ? 14 : 34), rowGap: P(12), marginTop: P(top) }}>
        {courses.map((c, i) => {
          const opens = interactive && onCourse && mealHasRecipe(c.meal);
          const inner = (
            <>
              <span style={{ ...SECTION_LABEL, fontSize: P(19) }}>{t(getMealCourseLabelKey(c.kind))}</span>
              <span style={{ fontSize: P(28), fontWeight: 500, color: 'var(--fmp-text-2)' }}>
                {c.name}
                {opens && <span aria-hidden="true" style={{ color: 'var(--fmp-text-3)', marginLeft: P(6) }}>&#8250;</span>}
              </span>
            </>
          );
          const base: CSSProperties = { display: 'inline-flex', alignItems: 'baseline', gap: P(12) };
          if (!opens) return <span key={i} style={base}>{inner}</span>;
          return (
            <button
              key={i}
              type="button"
              aria-label={t('meal-planner.recipe.openCourseAria', { name: c.name })}
              onClick={() => { hold(); onCourse!(c.meal!); }}
              style={{
                ...base, font: 'inherit', cursor: 'pointer', border: '1.5px solid var(--fmp-border)', borderRadius: P(16),
                padding: `${P(10)}px ${P(18)}px`, background: 'var(--fmp-surface)', color: 'inherit',
              }}
            >
              {inner}
            </button>
          );
        })}
      </div>
    );
  };

  const card = (children: ReactNode, style?: CSSProperties) => (
    <div style={{
      background: 'var(--fmp-surface)', border: '1px solid var(--fmp-border-sub)', borderRadius: P(32),
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)', padding: `${P(34)}px ${P(40)}px`, ...style,
    }}>
      {children}
    </div>
  );

  const sectionHead = (title: string, right?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: P(22), flexShrink: 0 }}>
      <span style={{ ...SECTION_LABEL, fontSize: P(22) }}>{title}</span>
      {right && <span style={{ fontSize: P(22), fontWeight: 600, color: 'var(--fmp-text-3)', fontVariantNumeric: 'tabular-nums' }}>{right}</span>}
    </div>
  );

  const ingredients = (columns: number, size: number, rowGap: number, m: boolean) => {
    if (!detail || detail.ingredients.length === 0) return null;
    return card(
      <>
        {sectionHead(t('meal-planner.recipe.ingredients'), String(detail.ingredients.length))}
        <div data-testid={tid('recipe-ingredients', m)} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: P(44), rowGap: P(rowGap) }}>
          {detail.ingredients.map((ing, i) => (
            <div key={i} style={{ display: 'contents' }}>
              {ing.heading && (
                <div style={{ gridColumn: '1 / -1', ...SECTION_LABEL, fontSize: P(20), color: 'var(--fmp-text-2)', marginTop: i > 0 ? P(8) : 0 }}>
                  {ing.heading}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: P(16), fontSize: P(size), lineHeight: 1.25 }}>
                <span style={{ width: P(10), height: P(10), borderRadius: '50%', background: 'var(--fmp-accent)', flexShrink: 0, transform: `translateY(-${P(4)}px)` }} />
                <span style={{ color: 'var(--fmp-text)', minWidth: 0 }}>
                  {ing.text}
                  {ing.amount && <span style={{ color: 'var(--fmp-text-3)', marginLeft: P(12), whiteSpace: 'nowrap' }}>{ing.amount}</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      </>,
    );
  };

  const stepRow = (step: RecipeStep, i: number, size: number, m: boolean) => {
    const state = marker === null ? 'plain' : i === marker ? 'current' : i < marker ? 'done' : 'plain';
    const current = state === 'current';
    const number = state === 'done'
      ? <svg viewBox="0 0 24 24" fill="none" style={{ width: '55%', height: '55%' }} aria-hidden="true"><path d="M5 12.5L10 17.5L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      : i + 1;
    const body = (
      <>
        <span style={{
          width: P(64), height: P(64), borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: P(30), fontWeight: 700,
          background: current ? 'var(--fmp-accent)' : 'color-mix(in srgb, var(--fmp-accent) 14%, transparent)',
          color: current ? 'var(--fmp-on-accent, #fff)' : 'var(--fmp-accent)',
        }}>
          {number}
        </span>
        <span style={{ fontSize: P(size), lineHeight: 1.4, color: 'var(--fmp-text)', paddingTop: P(8), whiteSpace: 'pre-line', minWidth: 0, textAlign: 'left' }}>
          {step.heading && <span style={{ display: 'block', ...SECTION_LABEL, fontSize: P(20), color: 'var(--fmp-text-2)', marginBottom: P(6) }}>{step.heading}</span>}
          {step.lead && <span style={{ display: 'block', fontWeight: 700 }}>{step.lead}</span>}
          {step.text}
        </span>
      </>
    );
    // Every row carries the current step's frame (transparent when it is not
    // current) so marking a step never changes its height, and the pages
    // measured stay the pages drawn.
    const style: CSSProperties = {
      display: 'flex', gap: P(26), alignItems: 'flex-start', flexShrink: 0,
      padding: `${P(16)}px ${P(24)}px`, margin: `0 -${P(26)}px`, borderRadius: P(26),
      border: `2px solid ${current ? 'color-mix(in srgb, var(--fmp-accent) 40%, transparent)' : 'transparent'}`,
      background: current ? 'color-mix(in srgb, var(--fmp-accent) 9%, var(--fmp-surface))' : 'transparent',
      opacity: state === 'done' ? 0.42 : 1,
    };
    if (!interactive || m) return <div key={i} data-testid={tid('recipe-step', m)} style={style}>{body}</div>;
    return (
      <button
        key={i}
        type="button"
        data-testid="recipe-step"
        data-current={current ? '' : undefined}
        aria-label={t('meal-planner.recipe.stepAria', { step: i + 1 })}
        onClick={() => jumpTo(i)}
        style={{ ...style, font: 'inherit', cursor: 'pointer', color: 'inherit', width: `calc(100% + ${2 * P(26)}px)` }}
      >
        {body}
      </button>
    );
  };

  const stepsCard = (shown: number[] | 'all', listRef: React.Ref<HTMLDivElement> | undefined, size: number, measuring: boolean) => {
    const first = shown === 'all' ? 0 : shown[0];
    const last = shown === 'all' ? steps.length - 1 : shown[shown.length - 1];
    const right = marker !== null && interactive
      ? t('meal-planner.recipe.stepOf', { step: marker + 1, total: steps.length })
      : pages.length > 1 && first !== undefined
        ? first === last
          ? t('meal-planner.recipe.stepOf', { step: first + 1, total: steps.length })
          : t('meal-planner.recipe.stepsRange', { from: first + 1, to: last + 1, total: steps.length })
        : undefined;
    const showDots = measuring || (pages.length > 1 && !(interactive && marker !== null));
    return card(
      <>
        {sectionHead(t('meal-planner.recipe.steps'), measuring ? undefined : right)}
        {/* Widened by the step frame's overhang, so clipping a page never cuts the current step's frame. */}
        <div ref={listRef} data-testid={measuring ? undefined : 'recipe-steps'} style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap, overflow: 'hidden',
          margin: `0 -${P(26)}px`, padding: `0 ${P(26)}px`,
        }}>
          {(shown === 'all' ? steps.map((_, i) => i) : shown).map((i) => stepRow(steps[i], i, size, measuring))}
        </div>
        {showDots && (
          <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: P(14), paddingTop: P(20), flexShrink: 0, visibility: measuring ? 'hidden' : undefined }}>
            {pages.map((_, i) => (
              <span key={i} style={{ width: P(14), height: P(14), borderRadius: '50%', background: i === shownPage ? 'var(--fmp-accent)' : 'var(--fmp-border)' }} />
            ))}
          </div>
        )}
      </>,
      { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
    );
  };

  const notesCard = (m: boolean) => {
    if (!detail || detail.notes.length === 0) return null;
    return card(
      <>
        {sectionHead(t('meal-planner.recipe.notes'))}
        <div data-testid={tid('recipe-notes', m)} style={{ fontSize: P(33), lineHeight: 1.45, color: 'var(--fmp-text)' }}>
          {detail.notes.map((n, i) => <p key={i} style={{ margin: 0, marginBottom: P(14) }}>{n}</p>)}
        </div>
      </>,
    );
  };

  const status = (m: boolean) => {
    if (recipe.status === 'ready') return null;
    return card(
      <div data-testid={tid(`recipe-${recipe.status}`, m)} style={{ fontSize: P(32), color: 'var(--fmp-text-2)', textAlign: 'center', padding: `${P(40)}px 0` }}>
        {t(recipe.status === 'loading' ? 'meal-planner.recipe.loading' : 'meal-planner.recipe.failed')}
      </div>,
    );
  };

  const touchBar = (m: boolean) => {
    if (!interactive || steps.length === 0) return null;
    // The measuring copy keeps the bar, so a recipe that fits with it fits without it.
    if (!m && stepButtons === 'paged' && pages.length <= 1) return null;
    const atEnd = marker !== null && marker >= steps.length - 1;
    const atStart = marker === null ? shownPage === 0 : marker === 0;
    const buttonBase: CSSProperties = {
      height: P(118), borderRadius: P(28), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: P(14),
      font: 'inherit', cursor: 'pointer',
    };
    return (
      <div style={{ display: 'flex', gap: P(24), marginTop: P(26), flexShrink: 0 }}>
        <button type="button" data-testid={tid('recipe-back', m)} onClick={backStep} disabled={atStart} style={{
          ...buttonBase, width: '30%', border: '2px solid var(--fmp-border)', background: 'var(--fmp-surface)',
          fontSize: P(36), fontWeight: 600, color: 'var(--fmp-text-2)', opacity: atStart ? 0.45 : 1,
        }}>
          <span aria-hidden="true" style={{ fontSize: P(52), lineHeight: 1, marginTop: -P(6) }}>&#8249;</span>
          {t('meal-planner.recipe.back')}
        </button>
        <button type="button" data-testid={tid('recipe-next', m)} onClick={nextStep} disabled={atEnd} style={{
          ...buttonBase, flex: 1, border: 0, background: 'var(--fmp-accent)', fontSize: P(38), fontWeight: 700, color: 'var(--fmp-on-accent, #fff)',
          opacity: atEnd ? 0.45 : 1,
        }}>
          {t('meal-planner.recipe.nextStep')}
          <span aria-hidden="true" style={{ fontSize: P(54), lineHeight: 1, marginTop: -P(6) }}>&#8250;</span>
        </button>
      </div>
    );
  };

  const nameStyle = (size: number, lines: number): CSSProperties => ({
    fontFamily: headerFont, fontSize: P(size), lineHeight: 1.04, letterSpacing: '-0.01em', color: 'var(--fmp-text)',
    ...(lines === 1
      ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }
      : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
  });

  // ── Layouts ──
  const portrait = (variant: 'first' | 'rest', shown: number[] | 'all', listRef?: React.Ref<HTMLDivElement>, measuring = false) => (
    <>
      {variant === 'first' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: P(40), flexShrink: 0 }}>
            {picture(300)}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: P(18), minWidth: 0 }}>
              {pill(24, measuring)}
              <div data-testid={measuring ? undefined : 'recipe-name'} style={nameStyle(78, 2)}>{meal.name}</div>
              {stats(34, 19, 44, measuring)}
            </div>
          </div>
          {courseLine(30, measuring)}
          {(detail?.ingredients.length ?? 0) > 0 && <div style={{ marginTop: P(40), flexShrink: 0 }}>{ingredients(2, 30, 16, measuring)}</div>}
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: P(28), paddingRight: headerEndGap, flexShrink: 0 }}>
          {picture(120)}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: P(10), minWidth: 0 }}>
            {pill(20, measuring)}
            <div data-testid={measuring ? undefined : 'recipe-name'} style={nameStyle(52, 1)}>{meal.name}</div>
          </div>
        </div>
      )}
      {recipe.status !== 'ready' && <div style={{ marginTop: P(28) }}>{status(measuring)}</div>}
      {paged && (shown === 'all' || shown.length > 0 || variant === 'rest') && (
        <div style={{ marginTop: P(variant === 'first' ? 28 : 32), flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {stepsCard(shown, listRef, 33, measuring)}
        </div>
      )}
      {/* The ingredients filled page one: no empty Steps card, just where the pages are. */}
      {paged && shown !== 'all' && shown.length === 0 && variant === 'first' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: P(14) }}>
          {pages.map((_, i) => (
            <span key={i} style={{ width: P(14), height: P(14), borderRadius: '50%', background: i === shownPage ? 'var(--fmp-accent)' : 'var(--fmp-border)' }} />
          ))}
        </div>
      )}
      {!paged && detail && <div style={{ marginTop: P(28), flexShrink: 0 }}>{notesCard(measuring)}</div>}
      {touchBar(measuring)}
      {footer?.(measuring)}
    </>
  );

  const landscapeLayout = (shown: number[] | 'all', listRef?: React.Ref<HTMLDivElement>, measuring = false) => (
    <div style={{ display: 'flex', gap: P(36), flex: 1, minHeight: 0 }}>
      <div style={{ width: P(700), flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: P(28) }}>
          {picture(200)}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: P(14), minWidth: 0 }}>
            {pill(21, measuring)}
            <div data-testid={measuring ? undefined : 'recipe-name'} style={nameStyle(60, 2)}>{meal.name}</div>
          </div>
        </div>
        <div style={{ marginTop: P(26) }}>{stats(30, 18, 40, measuring)}</div>
        {courseLine(22, measuring)}
        {recipe.status !== 'ready' && <div style={{ marginTop: P(26) }}>{status(measuring)}</div>}
        {(detail?.ingredients.length ?? 0) > 0 && (
          <div ref={measuring ? undefined : ingBoxRef} style={{ marginTop: P(26), flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {ingredients((detail?.ingredients.length ?? 0) > 8 ? 2 : 1, 27 * ingScale, 11 * ingScale, measuring)}
          </div>
        )}
        {!paged && detail && <div style={{ marginTop: P(26) }}>{notesCard(measuring)}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', paddingRight: headerEndGap }}>
        {paged && stepsCard(shown, listRef, 32, measuring)}
        {touchBar(measuring)}
        {footer?.(measuring)}
      </div>
    </div>
  );

  const shownSteps = pages[shownPage] ?? [];
  const layoutBox: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding, boxSizing: 'border-box' };

  return (
    <div ref={rootRef} data-testid="recipe-sheet" data-page={shownPage} data-pages={pages.length} style={{ position: 'relative', flex: 1, minHeight: 0, height: '100%' }}>
      <div style={layoutBox}>
        {layout === 'landscape'
          ? landscapeLayout(shownSteps)
          : portrait(shownPage === 0 ? 'first' : 'rest', shownSteps)}
      </div>
      {paged && (
        // The measuring copies: every step under page one's header and
        // ingredients, and an empty list under a later page's slim header.
        <div aria-hidden="true" inert style={{ position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={layoutBox}>
            {layout === 'landscape' ? landscapeLayout('all', firstListRef, true) : portrait('first', 'all', firstListRef, true)}
          </div>
          <div style={layoutBox}>
            {layout === 'landscape' ? landscapeLayout([], restListRef, true) : portrait('rest', [], restListRef, true)}
          </div>
        </div>
      )}
    </div>
  );
}
