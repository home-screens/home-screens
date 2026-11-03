'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import type { MealSlotType, SavedMeal, TimeFormat } from '@/types/config';
import { getMealCourseLabelKey, type ResolvedCourse } from '@/lib/meal-courses';
import { SLOT_META, formatMealTime, getMealSlotLabelKey } from '@/lib/meal-constants';
import { batchWord, mealHasRecipe, pageByHeight, RECIPE_PAGE_TURN_MS, recipePageOfStep, recipeStats, type RecipeDetail, type RecipeStep } from '@/lib/meal-recipe';
import { holdRotationFor } from '@/lib/interaction-hold';
import { wallPressProps } from './wallPress';
import { useElementBox } from '@/hooks/useElementBox';
import { useFontsReady } from '@/hooks/useFontsReady';
import { useTranslate } from '@/i18n';
import MealPicture, { mealHasPicture } from '@/components/meals/MealPicture';
import { useMinutesText } from './useMealMinutes';
import type { MealRecipeState } from './useMealRecipe';
import { WallScroller } from './WallScroller';

/**
 * A tap on a step keeps the screen where it is this long. Someone cooking
 * taps Next a few minutes apart, and the usual tap hold (seconds) would
 * rotate the recipe away between two steps.
 */
export const RECIPE_TAP_HOLD_MS = 5 * 60_000;
/** The smallest the ingredients step their type, rows and boxes down to (of the authored size) before they scroll or clip. */
const INGREDIENTS_MIN_SCALE = 0.55;
/** The smallest a step too long for any page steps its type down to on a wall nobody can touch. */
const LONG_STEP_MIN_SCALE = 0.5;
/** A page dot's touch room around the dot, in authored pixels. */
const DOT_HIT = 14;

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
  /** Someone is cooking from it (the card, after a tick or a step): the pages hold still, whatever recipe is on it. */
  held?: boolean;
  /** A tick, a step, a course, Back or Next, a page dot: someone is cooking from it. */
  onCook?: () => void;
}

/**
 * Which copy a layout draws: the one on screen, or one of the hidden
 * measuring copies (page one with every step, a later page with none).
 */
type Copy = 'shown' | 'all' | 'empty';

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
 * only (on a touch screen with a line back to the ingredients). The pages are
 * measured from a hidden copy laid out exactly like the visible one, so a
 * page is cut where the wall would actually clip it. A step taller than any
 * page gets one of its own, which a finger scrolls on a touch screen and
 * which steps its type down on a wall nobody can touch. Ingredients that do
 * not fit step their type down too, then scroll on a touch screen. With
 * nobody touching, pages turn every 30 seconds; any touch stops that. On a
 * touch screen Back and Next step move a marker through the steps and the
 * page follows it, and the page dots go to their page.
 */
export function RecipeSheet(props: RecipeSheetProps) {
  const { meal, recipe, scale = 1, serving, courses, timeFormat, P, padding, headerFont, layout, showPicture, interactive, stepButtons = 'always', onCourse, resetKey, footer, headerEndGap, held = false, onCook } = props;
  const t = useTranslate('modules');
  const minutesText = useMinutesText();
  const fontsReady = useFontsReady();
  const detail: RecipeDetail | null = recipe.status === 'ready' ? recipe.recipe : null;
  const steps = useMemo(() => detail?.steps ?? [], [detail]);
  const paged = steps.length > 0;

  // ── Pages, measured from the hidden copy ──
  const [rootRef, box] = useElementBox('padding');
  const firstListRef = useRef<HTMLDivElement>(null);
  const restListRef = useRef<HTMLDivElement>(null);
  const shownListRef = useRef<HTMLDivElement>(null);
  const ingShownRef = useRef<HTMLDivElement>(null);
  const ingAllRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{ key: string; pages: number[][] } | null>(null);
  const gap = 0;
  // Everything that moves a step or the room for them: the recipe's text, the
  // box, the fonts, the scale. The measurement belongs to exactly one key.
  const contentKey = useMemo(
    () => [...steps.map((st) => `${st.heading ?? ''}${st.lead ?? ''}${st.text}`.length), '|', ...(detail?.ingredients ?? []).map((i) => i.text.length)].join(','),
    [steps, detail],
  );
  const measureKey = `${resetKey}|${layout}|${box.width}x${box.height}|${fontsReady}|${contentKey}|${courses.length}|${P(100)}|${interactive}|${recipe.status}`;

  // ── Ingredients that do not fit their box step their type, rows and boxes
  // down until they do (page one's in portrait, the left column's in
  // landscape); below the floor they scroll on a touch screen. Read from
  // the measuring copy of page one when there is one, so it holds on any page. ──
  const [ingFit, setIngFit] = useState<{ key: string; scale: number }>({ key: '', scale: 1 });
  const ingScale = ingFit.key === measureKey ? ingFit.scale : 1;
  useLayoutEffect(() => {
    const grid = ingAllRef.current ?? ingShownRef.current;
    const frame = grid?.parentElement;
    if (!grid || !frame) return;
    if (ingFit.key !== measureKey) {
      setIngFit({ key: measureKey, scale: 1 });
      return;
    }
    if (grid.offsetHeight > frame.clientHeight + 1 && ingFit.scale > INGREDIENTS_MIN_SCALE) {
      setIngFit({ key: measureKey, scale: Math.max(INGREDIENTS_MIN_SCALE, Math.round((ingFit.scale - 0.05) * 100) / 100) });
    }
  }, [measureKey, ingFit]);

  // In portrait the ingredients share page one with the steps, so their size is part of the pages' key.
  const pagesKey = `${measureKey}|${ingScale}`;
  const measuredKey = measured?.key;
  useLayoutEffect(() => {
    if (!paged || !box.height || measuredKey === pagesKey) return;
    const first = firstListRef.current;
    const rest = restListRef.current;
    if (!first || !rest) return;
    const heights = Array.from(first.children).map((c) => (c as HTMLElement).offsetHeight);
    setMeasured({ key: pagesKey, pages: pageByHeight(heights, first.clientHeight, rest.clientHeight, gap) });
  }, [paged, box, measuredKey, pagesKey]);

  const pagesReady = paged && measured?.key === pagesKey;
  const pages = useMemo(
    () => (pagesReady && measured ? measured.pages : [steps.map((_, i) => i)]),
    [pagesReady, measured, steps],
  );

  // ── Page and step marker, and the ingredients ticked off ──
  const [page, setPage] = useState(0);
  const [marker, setMarker] = useState<number | null>(null);
  // A page looked at by hand while a step is marked (the ingredients, a dot):
  // shown over the marker's page until the next step button.
  const [peek, setPeek] = useState<number | null>(null);
  // Any touch on the recipe: its pages stop turning by themselves.
  const [touched, setTouched] = useState(false);
  // Kept only while this recipe is up: nothing is saved, nothing reaches the grocery list.
  const [ticked, setTicked] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    setPage(0);
    setMarker(null);
    setPeek(null);
    setTouched(false);
    setTicked(new Set());
  }, [resetKey]);
  const markerPage = marker !== null ? recipePageOfStep(pages, marker) : null;
  const shownPage = Math.min(peek ?? markerPage ?? page, pages.length - 1);
  // Following the marked step: the Steps box says which, and the dots step aside.
  const following = interactive && marker !== null && peek === null;

  const turns = pages.length > 1 && marker === null && !touched && !held;
  useEffect(() => {
    if (!turns) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages.length), RECIPE_PAGE_TURN_MS);
    return () => clearInterval(id);
  }, [turns, pages.length, page]);

  // ── A step too long for any page, on a wall nobody can touch: its type steps
  // down until it fits (a touch screen scrolls it instead). ──
  const [stepFit, setStepFit] = useState<{ key: string; scale: number }>({ key: '', scale: 1 });
  const stepFitKey = `${pagesKey}|${shownPage}`;
  const stepScale = !interactive && stepFit.key === stepFitKey ? stepFit.scale : 1;
  useLayoutEffect(() => {
    if (interactive || !pagesReady) return;
    const list = shownListRef.current;
    if (!list) return;
    if (stepFit.key !== stepFitKey) {
      setStepFit({ key: stepFitKey, scale: 1 });
      return;
    }
    if (list.scrollHeight > list.clientHeight + 1 && stepFit.scale > LONG_STEP_MIN_SCALE) {
      setStepFit({ key: stepFitKey, scale: Math.max(LONG_STEP_MIN_SCALE, Math.round((stepFit.scale - 0.05) * 100) / 100) });
    }
  }, [interactive, pagesReady, stepFitKey, stepFit]);

  const onCookRef = useRef(onCook);
  onCookRef.current = onCook;
  const cook = useCallback(() => {
    holdRotationFor(RECIPE_TAP_HOLD_MS);
    setTouched(true);
    onCookRef.current?.();
  }, []);
  const nextStep = useCallback(() => {
    cook();
    setPeek(null);
    if (steps.length === 0) return;
    setMarker((m) => {
      if (m === null) return pages[shownPage]?.[0] ?? pages.find((p) => p.length > 0)?.[0] ?? 0;
      return Math.min(m + 1, steps.length - 1);
    });
  }, [cook, steps.length, pages, shownPage]);
  const backStep = useCallback(() => {
    cook();
    setPeek(null);
    if (marker === null) {
      setPage(Math.max(0, shownPage - 1));
      return;
    }
    setMarker(Math.max(0, marker - 1));
  }, [cook, marker, shownPage]);
  const jumpTo = useCallback((i: number) => { cook(); setPeek(null); setMarker(i); }, [cook]);
  const goToPage = useCallback((i: number) => {
    cook();
    if (markerPage === null) {
      setPeek(null);
      setPage(i);
      return;
    }
    setPeek(i === markerPage ? null : i);
  }, [cook, markerPage]);
  const tick = useCallback((i: number) => {
    cook();
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, [cook]);

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
              {...wallPressProps}
              aria-label={t('meal-planner.recipe.openCourseAria', { name: c.name })}
              onClick={() => { cook(); onCourse!(c.meal!); }}
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

  /**
   * A list that scrolls with a finger on a touch screen and clips otherwise.
   * The measuring copies draw the plain one, which takes exactly the same room.
   */
  const scrollBox = (copy: Copy, frame: CSSProperties, inner: CSSProperties, children: ReactNode, opts: { listRef?: Ref<HTMLDivElement>; testId?: string; homeKey: string }) => {
    if (interactive && copy === 'shown') {
      return (
        <WallScroller
          enabled
          stays
          holdMs={RECIPE_TAP_HOLD_MS}
          homeKey={opts.homeKey}
          testId={opts.testId}
          frameStyle={frame}
          style={inner}
          thumbColor="var(--fmp-text-3)"
          thumbWidth={P(6)}
        >
          {children}
        </WallScroller>
      );
    }
    return (
      <div ref={opts.listRef} data-testid={copy === 'shown' ? opts.testId : undefined} style={{ minHeight: 0, overflow: 'hidden', ...frame, ...inner }}>
        {children}
      </div>
    );
  };

  /** `k`: the step-down of a list too long for its box, applied to the rows, the boxes and the gaps as well as the type. */
  const ingredients = (copy: Copy, columns: number, size: number, rowGap: number, k: number) => {
    if (!detail || detail.ingredients.length === 0) return null;
    const m = copy !== 'shown';
    const total = detail.ingredients.length;
    // The measuring copy counts as nothing ticked; the header's words never change a row's height.
    const done = m ? 0 : detail.ingredients.filter((_, i) => ticked.has(i)).length;
    const right = interactive && done > 0 ? t('meal-planner.recipe.ingredientsReady', { done, total }) : String(total);
    const grid = (
      <div
        ref={copy === 'shown' ? ingShownRef : copy === 'all' ? ingAllRef : undefined}
        data-testid={tid('recipe-ingredients', m)}
        style={{
          display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: P(44 * k),
          rowGap: P(interactive ? Math.max(4 * k, rowGap - 10 * k) : rowGap),
        }}
      >
        {detail.ingredients.map((ing, i) => {
          const isTicked = !m && ticked.has(i);
          const text = (
            <span style={{
              color: isTicked ? 'var(--fmp-text-3)' : 'var(--fmp-text)', minWidth: 0, textAlign: 'left',
              textDecorationLine: isTicked ? 'line-through' : 'none', textDecorationThickness: P(2),
            }}>
              {ing.text}
              {ing.amount && <span style={{ color: 'var(--fmp-text-3)', marginLeft: P(12), whiteSpace: 'nowrap' }}>{ing.amount}</span>}
            </span>
          );
          // On a touch wall each line is a box to tick off while cooking.
          const row = interactive ? (
            <>
              <span aria-hidden="true" style={{
                width: P(42 * k), height: P(42 * k), borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxSizing: 'border-box', border: isTicked ? 0 : `${P(3 * k)}px solid var(--fmp-border)`,
                background: isTicked ? 'var(--fmp-accent)' : 'transparent', color: 'var(--fmp-on-accent, #fff)',
              }}>
                {isTicked && (
                  <svg viewBox="0 0 24 24" fill="none" style={{ width: '62%', height: '62%' }}>
                    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {text}
            </>
          ) : (
            <>
              <span style={{ width: P(10 * k), height: P(10 * k), borderRadius: '50%', background: 'var(--fmp-accent)', flexShrink: 0, transform: `translateY(-${P(4 * k)}px)` }} />
              {text}
            </>
          );
          const rowStyle: CSSProperties = interactive
            ? { display: 'flex', alignItems: 'center', gap: P(18 * k), fontSize: P(size), lineHeight: 1.25, minHeight: P(56 * k) }
            : { display: 'flex', alignItems: 'baseline', gap: P(16 * k), fontSize: P(size), lineHeight: 1.25 };
          return (
            <div key={i} style={{ display: 'contents' }}>
              {ing.heading && (
                <div style={{ gridColumn: '1 / -1', ...SECTION_LABEL, fontSize: P(20 * k), color: 'var(--fmp-text-2)', marginTop: i > 0 ? P(8 * k) : 0 }}>
                  {ing.heading}
                </div>
              )}
              {interactive && !m ? (
                <button
                  type="button"
                  {...wallPressProps}
                  data-testid="recipe-ingredient"
                  data-ticked={isTicked ? '' : undefined}
                  aria-pressed={isTicked}
                  onClick={() => tick(i)}
                  // fontFamily, not the font shorthand: `rowStyle` already sets the size, and a later `font` would reset it.
                  style={{ ...rowStyle, border: 0, background: 'none', padding: 0, fontFamily: 'inherit', color: 'inherit', cursor: 'pointer', width: '100%' }}
                >
                  {row}
                </button>
              ) : (
                <div style={rowStyle}>{row}</div>
              )}
            </div>
          );
        })}
      </div>
    );
    // The card is as tall as its list, or as the room left when that is less: the list then scrolls or clips inside it.
    const fill: CSSProperties = { flex: '0 1 auto', minHeight: 0 };
    return card(
      <>
        {sectionHead(t('meal-planner.recipe.ingredients'), right)}
        {scrollBox(copy, fill, fill, grid, { homeKey: resetKey })}
      </>,
      { ...fill, display: 'flex', flexDirection: 'column' },
    );
  };

  /**
   * On a later page of a touch screen, the ingredients in one line ("Ingredients · 3 of 6 ready")
   * that goes back to page one. The ticks stay in reach while cooking.
   */
  const ingredientsLine = (copy: Copy) => {
    if (!interactive || !detail || detail.ingredients.length === 0) return null;
    const m = copy !== 'shown';
    const total = detail.ingredients.length;
    const done = m ? 0 : detail.ingredients.filter((_, i) => ticked.has(i)).length;
    const style: CSSProperties = {
      display: 'inline-flex', alignItems: 'baseline', gap: P(12), maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden',
      marginTop: P(6), padding: `${P(10)}px ${P(20)}px`, borderRadius: P(16), border: '1.5px solid var(--fmp-border)',
      background: 'var(--fmp-surface)', color: 'var(--fmp-text-2)', fontSize: P(26), lineHeight: 1.3,
    };
    const inner = (
      <>
        <span style={{ ...SECTION_LABEL, fontSize: P(19) }}>{t('meal-planner.recipe.ingredients')}</span>
        <span aria-hidden="true" style={{ color: 'var(--fmp-text-3)' }}>&middot;</span>
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {done > 0 ? t('meal-planner.recipe.ingredientsReady', { done, total }) : total}
        </span>
        <span aria-hidden="true" style={{ color: 'var(--fmp-text-3)' }}>&#8250;</span>
      </>
    );
    if (m) return <div style={style}>{inner}</div>;
    return (
      <button type="button" {...wallPressProps} data-testid="recipe-ingredients-line" onClick={() => goToPage(0)} style={{ ...style, fontFamily: 'inherit', cursor: 'pointer' }}>
        {inner}
      </button>
    );
  };

  /** `k`: a long step's step-down on a wall nobody can touch. */
  const stepRow = (step: RecipeStep, i: number, size: number, m: boolean, k: number) => {
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
        <span style={{ fontSize: P(size * k), lineHeight: 1.4, color: 'var(--fmp-text)', paddingTop: P(8), whiteSpace: 'pre-line', minWidth: 0, textAlign: 'left' }}>
          {step.heading && <span style={{ display: 'block', ...SECTION_LABEL, fontSize: P(20 * k), color: 'var(--fmp-text-2)', marginBottom: P(6) }}>{step.heading}</span>}
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
        {...wallPressProps}
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

  /** The page dots; on a touch screen each one goes to its page. */
  const dots = (copy: Copy) => {
    const m = copy !== 'shown';
    return (
      <div
        data-testid={m ? undefined : 'recipe-dots'}
        aria-hidden={interactive && !m ? undefined : 'true'}
        style={{ display: 'flex', justifyContent: 'center', gap: interactive ? 0 : P(14), flexShrink: 0, visibility: m ? 'hidden' : undefined }}
      >
        {pages.map((_, i) => {
          const dot = <span style={{ display: 'block', width: P(14), height: P(14), borderRadius: '50%', background: i === shownPage ? 'var(--fmp-accent)' : 'var(--fmp-border)' }} />;
          if (!interactive) return <span key={i}>{dot}</span>;
          // A finger-sized target around a dot that stays small.
          const hit: CSSProperties = { display: 'flex', padding: P(DOT_HIT) };
          if (m) return <span key={i} style={hit}>{dot}</span>;
          return (
            <button
              key={i}
              type="button"
              {...wallPressProps}
              data-testid="recipe-dot"
              aria-label={t('meal-planner.recipe.pageAria', { page: i + 1, pages: pages.length })}
              aria-current={i === shownPage ? 'page' : undefined}
              onClick={() => goToPage(i)}
              style={{ ...hit, border: 0, margin: 0, background: 'none', cursor: 'pointer' }}
            >
              {dot}
            </button>
          );
        })}
      </div>
    );
  };

  const stepsCard = (copy: Copy, shown: number[] | 'all', size: number) => {
    const measuring = copy !== 'shown';
    const first = shown === 'all' ? 0 : shown[0];
    const last = shown === 'all' ? steps.length - 1 : shown[shown.length - 1];
    const right = following && marker !== null
      ? t('meal-planner.recipe.stepOf', { step: marker + 1, total: steps.length })
      : pages.length > 1 && first !== undefined
        ? first === last
          ? t('meal-planner.recipe.stepOf', { step: first + 1, total: steps.length })
          : t('meal-planner.recipe.stepsRange', { from: first + 1, to: last + 1, total: steps.length })
        : undefined;
    const showDots = measuring || (pages.length > 1 && !following);
    const k = copy === 'shown' ? stepScale : 1;
    const rows = (shown === 'all' ? steps.map((_, i) => i) : shown).map((i) => stepRow(steps[i], i, size, measuring, k));
    return card(
      <>
        {sectionHead(t('meal-planner.recipe.steps'), measuring ? undefined : right)}
        {/* Widened by the step frame's overhang, so clipping a page never cuts the current step's frame. A step
            taller than any page scrolls here on a touch screen. */}
        {scrollBox(
          copy,
          { flex: 1, minHeight: 0, margin: `0 -${P(26)}px` },
          { display: 'flex', flexDirection: 'column', gap, padding: `0 ${P(26)}px` },
          rows,
          {
            listRef: copy === 'all' ? firstListRef : copy === 'empty' ? restListRef : shownListRef,
            testId: 'recipe-steps',
            homeKey: `${resetKey}|${shownPage}`,
          },
        )}
        {showDots && <div style={{ paddingTop: P(interactive ? 20 - DOT_HIT : 20), flexShrink: 0 }}>{dots(copy)}</div>}
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
        <button type="button" {...wallPressProps} data-testid={tid('recipe-back', m)} onClick={backStep} disabled={atStart} style={{
          ...buttonBase, width: '30%', border: '2px solid var(--fmp-border)', background: 'var(--fmp-surface)',
          fontSize: P(36), fontWeight: 600, color: 'var(--fmp-text-2)', opacity: atStart ? 0.45 : 1,
        }}>
          <span aria-hidden="true" style={{ fontSize: P(52), lineHeight: 1, marginTop: -P(6) }}>&#8249;</span>
          {t('meal-planner.recipe.back')}
        </button>
        <button type="button" {...wallPressProps} data-testid={tid('recipe-next', m)} onClick={nextStep} disabled={atEnd} style={{
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
  const hasIngredients = (detail?.ingredients.length ?? 0) > 0;
  const dotsTall = P(interactive ? 14 + 2 * DOT_HIT : 14);

  const portrait = (copy: Copy, variant: 'first' | 'rest', shown: number[] | 'all') => {
    const measuring = copy !== 'shown';
    return (
      <>
        {variant === 'first' ? (
          <>
            {/* Room for the close button on page one too, or a long name runs under it. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: P(40), flexShrink: 0, paddingRight: headerEndGap }}>
              {picture(300)}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: P(18), minWidth: 0 }}>
                {pill(24, measuring)}
                {/* Three lines, as the room kept for the close button narrows the column. */}
                <div data-testid={tid('recipe-name', measuring)} style={nameStyle(78, 3)}>{meal.name}</div>
                {stats(34, 19, 44, measuring)}
              </div>
            </div>
            {courseLine(30, measuring)}
            {/* Shrinks to the room left when the list is longer than the page: the list steps down, then scrolls. */}
            {hasIngredients && (
              <div style={{ marginTop: P(40), flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {ingredients(copy, 2, 30 * ingScale, 16 * ingScale, ingScale)}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: P(28), paddingRight: headerEndGap, flexShrink: 0 }}>
            {picture(120)}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: P(10), minWidth: 0 }}>
              {pill(20, measuring)}
              <div data-testid={tid('recipe-name', measuring)} style={nameStyle(52, 1)}>{meal.name}</div>
              {ingredientsLine(copy)}
            </div>
          </div>
        )}
        {recipe.status !== 'ready' && <div style={{ marginTop: P(28) }}>{status(measuring)}</div>}
        {/* On page one the Steps box keeps at least the dots' room, so the ingredients measured beside every
            step get exactly the room they have when they fill the page and only the dots are left. */}
        {paged && (shown === 'all' || shown.length > 0 || variant === 'rest') && (
          <div style={{
            marginTop: P(variant === 'first' ? 28 : 32), flex: 1, minHeight: variant === 'first' ? dotsTall : 0,
            display: 'flex', flexDirection: 'column',
          }}>
            {stepsCard(copy, shown, 33)}
          </div>
        )}
        {/* The ingredients filled page one: no empty Steps card, just where the pages are. */}
        {paged && shown !== 'all' && shown.length === 0 && variant === 'first' && (
          <div style={{ flex: 1, minHeight: dotsTall, marginTop: P(28), display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            {dots(copy)}
          </div>
        )}
        {!paged && detail && <div style={{ marginTop: P(28), flexShrink: 0 }}>{notesCard(measuring)}</div>}
        {touchBar(measuring)}
        {footer?.(measuring)}
      </>
    );
  };

  const landscapeLayout = (copy: Copy, shown: number[] | 'all') => {
    const measuring = copy !== 'shown';
    return (
      <div style={{ display: 'flex', gap: P(36), flex: 1, minHeight: 0 }}>
        <div style={{ width: P(700), flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: P(28) }}>
            {picture(200)}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: P(14), minWidth: 0 }}>
              {pill(21, measuring)}
              <div data-testid={tid('recipe-name', measuring)} style={nameStyle(60, 2)}>{meal.name}</div>
            </div>
          </div>
          <div style={{ marginTop: P(26) }}>{stats(30, 18, 40, measuring)}</div>
          {courseLine(22, measuring)}
          {recipe.status !== 'ready' && <div style={{ marginTop: P(26) }}>{status(measuring)}</div>}
          {/* A fixed box with no pages: a long list steps down until it fits, then scrolls on a touch screen. */}
          {hasIngredients && (
            <div style={{ marginTop: P(26), flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {ingredients(copy, (detail?.ingredients.length ?? 0) > 8 ? 2 : 1, 27 * ingScale, 11 * ingScale, ingScale)}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', paddingRight: headerEndGap }}>
          {paged && stepsCard(copy, shown, 32)}
          {/* A saved meal's notes take the steps' place, beside the ingredients rather than under them. */}
          {!paged && detail && <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{notesCard(measuring)}</div>}
          {touchBar(measuring)}
          {footer?.(measuring)}
        </div>
      </div>
    );
  };

  const shownSteps = pages[shownPage] ?? [];
  const layoutBox: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding, boxSizing: 'border-box' };

  return (
    <div
      ref={rootRef}
      data-testid="recipe-sheet"
      data-page={shownPage}
      data-pages={pages.length}
      data-turning={turns ? '' : undefined}
      onPointerDown={interactive ? () => setTouched(true) : undefined}
      style={{ position: 'relative', flex: 1, minHeight: 0, height: '100%' }}
    >
      <div style={layoutBox}>
        {layout === 'landscape'
          ? landscapeLayout('shown', shownSteps)
          : portrait('shown', shownPage === 0 ? 'first' : 'rest', shownSteps)}
      </div>
      {paged && (
        // The measuring copies: every step under page one's header and
        // ingredients, and an empty list under a later page's slim header.
        <div aria-hidden="true" inert style={{ position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={layoutBox}>
            {layout === 'landscape' ? landscapeLayout('all', 'all') : portrait('all', 'first', 'all')}
          </div>
          <div style={layoutBox}>
            {layout === 'landscape' ? landscapeLayout('empty', []) : portrait('empty', 'rest', [])}
          </div>
        </div>
      )}
    </div>
  );
}
