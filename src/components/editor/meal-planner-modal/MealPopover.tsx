'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Plus, X } from 'lucide-react';
import type { MealCourseKind, MealSlotType, PlannedMeal, SavedMeal, TimeFormat } from '@/types/config';
import { getMealSlotLabelKey, formatMealTime } from '@/lib/meal-constants';
import { COURSE_KINDS, MAX_COURSES, getMealCourseLabelKey } from '@/lib/meal-courses';
import { mealTagLabel } from '@/lib/meal-dish-rules';
import MealTimeChip from '@/components/meals/MealTimeChip';
import { useMealieLink } from '@/components/meals/useMealieLink';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useDishTime } from './dish-time';
import DishPicture from './DishPicture';

const POPOVER_WIDTH = 360;

/** The add buttons: the three course kinds, then another main dish. */
const ADD_ORDER: readonly MealCourseKind[] = [...COURSE_KINDS.filter((k) => k !== 'main'), 'main'];
const GAP = 8;

interface MealPopoverProps {
  date: string;
  slot: MealSlotType;
  /** The meal as planned now; the popover closes itself when it is gone. */
  entry: PlannedMeal | undefined;
  /** Every meal the plan can point at, to resolve names and pictures. */
  meals: SavedMeal[];
  /** The cell that was clicked, to sit beside. */
  anchor: DOMRect;
  /** The window's body, to stay inside of when it can. */
  bounds?: DOMRect;
  /** Keep to the right of this x (the sidebar's edge) when opening to the cell's left. */
  minLeft?: number;
  source: 'local' | 'mealie';
  timeFormat: TimeFormat;
  accentColor: string;
  /** The slot's usual serving time from the shared settings, if any. */
  defaultTime?: string;
  /** A picker is open on top: clicks and Escape belong to it. */
  suspended: boolean;
  onChangeMain: () => void;
  onAddCourse: (kind: MealCourseKind) => void;
  onSwapCourse: (index: number, kind: MealCourseKind) => void;
  onMoveCourse: (from: number, to: number) => void;
  onRemoveCourse: (index: number) => void;
  onSetTime: (time: string | undefined) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * The phone's meal sheet at desktop size, opened by clicking a planned meal
 * in the week grid: the main dish with Change, its courses (swap, move up,
 * move down, remove on hover), four ways to add a course, the serving time,
 * and Clear. Every change saves as it is made, to Mealie in Mealie mode.
 */
export default function MealPopover({
  date,
  slot,
  entry,
  meals,
  anchor,
  bounds,
  minLeft,
  source,
  timeFormat,
  accentColor,
  defaultTime,
  suspended,
  onChangeMain,
  onAddCourse,
  onSwapCourse,
  onMoveCourse,
  onRemoveCourse,
  onSetTime,
  onClear,
  onClose,
}: MealPopoverProps) {
  const t = useTranslate('editor');
  const tModules = useTranslate('modules');
  const locale = useFormattingLocale();
  const dishTime = useDishTime();
  const linkToMealie = useMealieLink();
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchor.top);

  // The keyboard moves in with it (Tab reaches its buttons next) and goes
  // back to the meal's cell when it closes.
  useReturnFocus();
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);

  // Beside the clicked cell: to its left when there is room there without
  // covering the meal details in the sidebar (the dinner column is on the
  // right), else to its right; kept inside the window.
  const leftEdge = Math.max(GAP, (minLeft ?? 0) + GAP);
  const left = anchor.left - POPOVER_WIDTH - GAP >= leftEdge
    ? anchor.left - POPOVER_WIDTH - GAP
    : Math.min(anchor.right + GAP, window.innerWidth - POPOVER_WIDTH - GAP);

  // Level with the cell, nudged up into the planner window when it would
  // hang below it, and into the browser window when the planner is too short.
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    const lowest = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight) - height - GAP;
    const highest = Math.max(GAP, (bounds?.top ?? 0) + GAP);
    const fits = lowest >= highest;
    setTop(fits
      ? Math.max(highest, Math.min(anchor.top - 40, lowest))
      : Math.max(GAP, Math.min(anchor.top - 40, window.innerHeight - height - GAP)));
  }, [anchor, bounds, entry]);

  // Escape and a click elsewhere close it, unless a picker is open on top.
  useEffect(() => {
    if (suspended) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    }
    function onDown(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target || ref.current?.contains(target)) return;
      // The serving-time chip's own panel lives inside this one. The toast's
      // Undo puts back a course removed here, so the popover stays for it.
      if (target.closest('[data-keeps-meal-popover]')) return;
      onClose();
    }
    window.addEventListener('keydown', onKey, true);
    // Deferred so the click that opened it does not close it.
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
    };
  }, [suspended, onClose]);

  if (!entry) return null;

  const slotLabel = tModules(getMealSlotLabelKey(slot));
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' });
  const mainMeal = entry.mealId ? meals.find((m) => m.id === entry.mealId) ?? null : null;
  const mainName = mainMeal?.name ?? entry.customText?.trim() ?? null;
  const courses = entry.courses ?? [];
  const onMealie = source === 'mealie';
  const mainTag = mainMeal?.tags?.[0];
  const mainMeta = [dishTime(mainMeal), mainMeal && mainTag ? mealTagLabel(mainMeal, mainTag) : null].filter(Boolean).join(' · ');
  const mealieLink = onMealie && mainMeal?.recipeUrl ? linkToMealie(mainMeal.recipeUrl) : undefined;

  const iconBtn = 'w-6 h-6 rounded flex items-center justify-center text-hs-text-faint hover:bg-hs-hover hover:text-hs-text-body disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-hs-text-faint transition';

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${slotLabel} · ${dateLabel}`}
      tabIndex={-1}
      data-testid="meal-popover"
      className="fixed z-[55] bg-hs-panel border border-hs-border-strong rounded-xl shadow-2xl focus:outline-none"
      style={{ left, top, width: POPOVER_WIDTH }}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-hs-border-strong">
        <div className="min-w-0">
          <div className="text-sm font-bold text-hs-text-body">{slotLabel} &middot; {dateLabel}</div>
          {onMealie && <div className="text-xs text-hs-text-faint">{t('mealPlannerModal.popover.savesToMealie')}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('mealPlannerModal.popover.close')}
          className="p-0.5 rounded text-hs-text-faint hover:text-hs-text-body hover:bg-hs-card"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>

      <div className="px-4 py-3">
        {/* Main dish */}
        <div className="text-[10px] font-bold uppercase tracking-wider text-hs-text-faint mb-1.5">
          {t('mealPlannerModal.popover.mainDish')}
        </div>
        <div className="flex items-center gap-2.5 p-2 mb-3.5 rounded-lg bg-hs-card/60 border border-hs-border-strong/50">
          {mainName ? (
            <>
              <DishPicture meal={mainMeal} size={40} typed="pencil" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-hs-text-body leading-[18px] truncate">{mainName}</div>
                {mainMeta && <div className="text-[11px] text-hs-text-faint truncate">{mainMeta}</div>}
                {/* The note written on the plan for this day ("Pizza day"), as the phone's sheet shows it. */}
                {entry.notes?.trim() && <div className="text-[11px] italic text-hs-text-muted line-clamp-2">{entry.notes.trim()}</div>}
              </div>
            </>
          ) : (
            <div className="flex-1 min-w-0 text-xs text-hs-text-faint px-1">{t('mealPlannerModal.popover.noMainDish')}</div>
          )}
          <button
            type="button"
            onClick={onChangeMain}
            className="px-2 py-1 text-xs font-medium rounded-md border border-hs-border-strong bg-hs-card text-hs-text-body hover:bg-hs-hover shrink-0"
          >
            {mainName ? t('mealPlannerModal.popover.change') : t('mealPlannerModal.popover.choose')}
          </button>
        </div>

        {/* Courses */}
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-hs-text-faint mb-1.5">
          <span>{t('mealPlannerModal.popover.withThisMeal')}</span>
        </div>
        {courses.length > 0 && (
          // One grid for every row, so the kind labels share a column as wide
          // as the longest one ("Accompagnement", "Nachtisch"), up to a cap.
          <ul className="grid grid-cols-[fit-content(124px)_auto_minmax(0,1fr)] max-h-[240px] overflow-y-auto -mx-1 px-1">
            {courses.map((course, i) => {
              const meal = course.mealId ? meals.find((m) => m.id === course.mealId) ?? null : null;
              const name = meal?.name ?? course.customText ?? t('mealPlannerModal.popover.missingMeal');
              const kindLabel = tModules(getMealCourseLabelKey(course.kind));
              return (
                <li
                  key={`${i}-${course.sourceId ?? course.mealId ?? course.customText}`}
                  className="group relative col-span-3 grid grid-cols-subgrid items-center gap-x-2 pl-1.5 pr-1 py-1 rounded-md min-h-[34px] hover:bg-hs-card focus-within:bg-hs-card"
                >
                  <span className="min-w-[50px] text-[10px] font-bold uppercase tracking-wide text-hs-text-faint truncate" title={kindLabel}>{kindLabel}</span>
                  <DishPicture meal={meal} size={24} typed="pencil" />
                  <button
                    type="button"
                    onClick={() => onSwapCourse(i, course.kind)}
                    title={t('mealPlannerModal.popover.swapCourse')}
                    className="flex-1 min-w-0 text-left text-xs text-hs-text-secondary truncate hover:text-hs-text-body"
                  >
                    {name}
                  </button>
                  {/* Over the end of the row on hover, so a name gets the
                      whole width the rest of the time. */}
                  <span className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 pl-2 rounded-r-md bg-hs-card opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                    <button
                      type="button"
                      className={iconBtn}
                      disabled={i === 0}
                      onClick={() => onMoveCourse(i, i - 1)}
                      aria-label={t('mealPlannerModal.popover.moveUp', { name })}
                    >
                      <ArrowUp className="w-3.5 h-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={iconBtn}
                      disabled={i === courses.length - 1}
                      onClick={() => onMoveCourse(i, i + 1)}
                      aria-label={t('mealPlannerModal.popover.moveDown', { name })}
                    >
                      <ArrowDown className="w-3.5 h-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={`${iconBtn} hover:!text-hs-danger`}
                      onClick={() => onRemoveCourse(i)}
                      aria-label={t('mealPlannerModal.popover.remove', { name })}
                    >
                      <X className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {courses.length < MAX_COURSES && (
          <div className="flex flex-wrap gap-1.5 mt-2 mb-3.5">
            {/* "Another main" needs a main dish to be another to. */}
            {ADD_ORDER.filter((kind) => kind !== 'main' || !!mainName).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => onAddCourse(kind)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11.5px] font-medium rounded-md border border-dashed border-hs-border-strong text-hs-text-muted hover:text-hs-text-body hover:border-hs-text-faint transition"
              >
                <Plus className="w-3 h-3" aria-hidden />
                {kind === 'main' ? t('mealPlannerModal.popover.anotherMain') : tModules(getMealCourseLabelKey(kind))}
              </button>
            ))}
          </div>
        )}

        {/* Serving time */}
        <div className="flex items-center justify-between pt-2 border-t border-hs-border text-xs text-hs-text-muted">
          <span>
            {t('mealPlannerModal.popover.servingTime')}
            {defaultTime && (
              <span className="text-hs-text-faint">
                {' · '}
                {t('mealPlannerModal.popover.usually', { time: formatMealTime(defaultTime, timeFormat) })}
              </span>
            )}
          </span>
          {/* The chip sits at the popover's foot, near the bottom of the window
              for a late-week meal, so its time panel opens upward over the
              popover instead of below it and off screen. */}
          <span className="[&_[role=dialog]]:!top-auto [&_[role=dialog]]:!bottom-[calc(100%+4px)]">
          <MealTimeChip
            value={entry.time}
            onChange={onSetTime}
            slot={slot}
            variant="dark"
            accentColor={accentColor}
            compact
            align="right"
            timeFormat={timeFormat}
          />
          </span>
        </div>
        {onMealie && (
          <p className="mt-1.5 text-[11px] leading-[15px] text-hs-text-faint">
            {t(courses.length > 1 ? 'mealPlannerModal.popover.timeAndOrderKeptHere' : 'mealPlannerModal.popover.timeKeptHere')}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-hs-border-strong text-xs">
        <button type="button" onClick={onClear} className="font-medium text-hs-danger hover:underline">
          {t(`mealPlannerModal.popover.clear.${slot}`)}
        </button>
        {mealieLink && (
          <a
            href={mealieLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-hs-accent hover:text-hs-accent-hover"
          >
            {t('mealPlannerModal.openInMealie')}
            <ExternalLink className="w-3 h-3" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}
