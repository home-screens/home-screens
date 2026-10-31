'use client';

import { useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { SavedMeal, PlannedMeal, MealSlotType, MealSettings, MealCourse, MealCourseKind } from '@/types/config';
import { filterPlanToWeek, resolveMealWithEntry, getLocalizedDayNames, dateToDayIndex, getMealSlotLabelKey, formatDayList, type ResolvedPlanEntry } from '@/lib/meal-constants';
import {
  assignPlanSlot,
  setPlanSlotText,
  clearPlanSlot,
  setPlanSlotTime,
  clearPlanWeek,
  suggestPlanWeek,
  placePlanWeek,
  copyPlanWeek,
  restorePlanEntries,
  replacesDish,
} from '@/lib/meal-plan-actions';
import { addPlanCourse, movePlanCourse, removePlanCourse, setPlanCourse } from '@/lib/meal-courses';
import { withoutSuggested, type MealEdit, type MealieSuggestedEntry } from '@/lib/meal-client';
import { shownWeek } from '@/lib/meal-plan-words';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { getWeekDates, type MealsConfirmAction } from '../components/meals-shared';

interface MealsPlanActionsParams {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  setPlan: Dispatch<SetStateAction<PlannedMeal[]>>;
  saveData: (edit: MealEdit) => Promise<boolean>;
  settings: MealSettings;
  /** The viewed week, from `useMealsWeekNav` */
  weekDates: ReturnType<typeof getWeekDates>;
  /** Origin of the viewed week — needed to address the *previous* week */
  viewingWeekStart: Date;
  /** The household's day, `YYYY-MM-DD`: messages say "this week" only for its week. */
  todayISO: string;
  setConfirmAction: Dispatch<SetStateAction<MealsConfirmAction | null>>;
  /** Plan saves go to Mealie: the confirm for clearing a meal says so, and Suggest asks Mealie. */
  savesToMealie: boolean;
  /** Mealie's own picks for empty meals (Suggest in Mealie mode). */
  suggestFromMealie: (cells: { date: string; slot: MealSlotType }[]) => Promise<{ created: number; skipped: number; entries: MealieSuggestedEntry[] } | null>;
  /** A short message at the bottom of the tab, with Undo when there is something to take back. */
  showNotice: (message: string, undo?: () => void) => void;
  /**
   * Keep these dishes drawable after the plan stops naming them. A Mealie
   * copy carries only the recipes its plan uses, so an Undo would otherwise
   * put back a meal the phone has no name or picture for until Mealie answers.
   */
  keepMeals: (meals: SavedMeal[]) => void;
}

/** The meal planned in a slot, if any. */
function entryAt(plan: PlannedMeal[], date: string, slot: MealSlotType): PlannedMeal | undefined {
  return plan.find((p) => p.date === date && p.slot === slot);
}

/**
 * Reads and writes of the meal plan for the currently-viewed week: slot
 * assignment, clearing, per-slot times, and the bulk actions (clear week,
 * shuffle, copy last week). Every write is optimistic — local state first,
 * then the PUT.
 */
export function useMealsPlanActions({
  savedMeals,
  plan,
  setPlan,
  saveData,
  settings,
  weekDates,
  viewingWeekStart,
  todayISO,
  setConfirmAction,
  savesToMealie,
  suggestFromMealie,
  showNotice,
  keepMeals,
}: MealsPlanActionsParams) {
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  // "This week" in a message only while it is this week; any other is named by its dates.
  const week = useMemo(
    () => shownWeek(weekDates.map((d) => d.date), todayISO, formattingLocale),
    [weekDates, todayISO, formattingLocale],
  );

  // Filter plan to viewed week
  const weekPlan = useMemo(
    () => filterPlanToWeek(plan, weekDates[0].date, weekDates[6].date),
    [plan, weekDates],
  );

  const getMealForSlot = useCallback(
    (date: string, slot: MealSlotType): ResolvedPlanEntry => resolveMealWithEntry(date, slot, weekPlan, savedMeals),
    [weekPlan, savedMeals],
  );

  /**
   * Apply one of the shared plan transforms optimistically, then persist it as
   * a function of whatever plan the hub has by then (see `MealEdit`). A
   * transform that had nothing to do hands back the same array, and there is
   * then nothing to save.
   */
  // The plan as it is now, not as it was when a callback was made: a notice's
  // Undo runs after the change it takes back has landed, and against the
  // older copy it would find nothing to undo.
  const planRef = useRef(plan);
  planRef.current = plan;
  const applyToPlan = useCallback(async (transform: (current: PlannedMeal[]) => PlannedMeal[]) => {
    const current = planRef.current;
    const next = transform(current);
    if (next === current) return;
    setPlan(next);
    await saveData((c) => ({ plan: transform(c.plan) }));
  }, [saveData, setPlan]);

  /**
   * A notice saying what one tap just did (a dish changed for another, a meal
   * cleared), with Undo putting back `before`, the meal as it was. Undo
   * replays against the plan as it is by then, like every edit here, so in
   * Mealie mode it lands in Mealie as new entries. Shown as the change is
   * made, not once Mealie has answered.
   */
  const offerBack = useCallback((message: string, before: PlannedMeal) => {
    keepMeals(savedMeals.filter((m) => m.id === before.mealId || before.courses?.some((c) => c.mealId === m.id)));
    showNotice(message, () => { void applyToPlan((p) => restorePlanEntries(p, [before])); });
  }, [applyToPlan, keepMeals, savedMeals, showNotice]);

  /** The main dish picked in the picker; replacing another one, the notice offers that back. */
  const assignMealToSlot = useCallback(async (date: string, slot: MealSlotType, meal: SavedMeal) => {
    const before = entryAt(planRef.current, date, slot);
    const saved = applyToPlan((p) => assignPlanSlot(p, date, slot, meal.id));
    if (before && replacesDish(before, null, { mealId: meal.id })) offerBack(t('mealsTab.notice.changed', { name: meal.name }), before);
    await saved;
  }, [applyToPlan, offerBack, t]);

  /** A meal typed straight into the slot, with no library entry behind it. */
  const setSlotText = useCallback(async (date: string, slot: MealSlotType, text: string) => {
    const before = entryAt(planRef.current, date, slot);
    const saved = applyToPlan((p) => setPlanSlotText(p, date, slot, text));
    if (before && replacesDish(before, null, { customText: text })) offerBack(t('mealsTab.notice.changed', { name: text.trim() }), before);
    await saved;
  }, [applyToPlan, offerBack, t]);

  const clearSlot = useCallback(async (date: string, slot: MealSlotType) => {
    await applyToPlan((p) => clearPlanSlot(p, date, slot));
  }, [applyToPlan]);

  /**
   * Clear a whole meal from its sheet. A lone dish goes in one tap, as Remove
   * Meal always did; a meal with courses asks first, since one tap takes
   * several dishes off the plan (and, in Mealie mode, several entries out of
   * Mealie). Either way the notice after offers it back. `onCleared` runs
   * once the meal is gone, to close the sheet.
   */
  const clearMeal = useCallback((date: string, slot: MealSlotType, onCleared: () => void) => {
    const { name, courses, planned } = resolveMealWithEntry(date, slot, weekPlan, savedMeals);
    const dish = name ?? tModules(getMealSlotLabelKey(slot));
    const clear = () => {
      onCleared();
      const saved = clearSlot(date, slot);
      if (planned) {
        offerBack(courses.length === 0
          ? t('mealsTab.notice.removed', { name: dish })
          : t('mealsTab.notice.clearedMeal', { name: dish, count: courses.length }), planned);
      }
      return saved;
    };
    if (courses.length === 0) {
      void clear();
      return;
    }
    const day = getLocalizedDayNames(formattingLocale, 'full')[dateToDayIndex(date)];
    setConfirmAction({
      title: t(`mealSheet.clearConfirm.title.${slot}`, { day }),
      description: t(savesToMealie ? 'mealSheet.clearConfirm.descriptionMealie' : 'mealSheet.clearConfirm.description', {
        dish,
        count: courses.length,
      }),
      confirmLabel: t(`mealSheet.clearConfirm.confirm.${slot}`),
      onConfirm: async () => {
        setConfirmAction(null);
        await clear();
      },
    });
  }, [weekPlan, savedMeals, clearSlot, offerBack, setConfirmAction, savesToMealie, formattingLocale, t, tModules]);

  /** Add a side, a dessert, a drink or another main to a meal. */
  const addCourse = useCallback(async (date: string, slot: MealSlotType, course: MealCourse) => {
    await applyToPlan((p) => addPlanCourse(p, date, slot, course));
  }, [applyToPlan]);

  /**
   * Swap the course at `index` for another dish or typed text (`name`, for
   * the notice that offers the old one back); it keeps its place.
   */
  const changeCourse = useCallback(async (
    date: string,
    slot: MealSlotType,
    index: number,
    change: { kind?: MealCourseKind; mealId?: string; customText?: string },
    name: string,
  ) => {
    const before = entryAt(planRef.current, date, slot);
    const saved = applyToPlan((p) => setPlanCourse(p, date, slot, index, change));
    if (before && replacesDish(before, index, change)) offerBack(t('mealsTab.notice.changed', { name }), before);
    await saved;
  }, [applyToPlan, offerBack, t]);

  // A course goes on one tap, so the notice offers it back.
  const removeCourse = useCallback(async (date: string, slot: MealSlotType, index: number) => {
    const before = plan.find((p) => p.date === date && p.slot === slot);
    const course = before?.courses?.[index];
    const name = course ? (savedMeals.find((m) => m.id === course.mealId)?.name ?? course.customText ?? '') : '';
    const saved = applyToPlan((p) => removePlanCourse(p, date, slot, index));
    if (before && course) offerBack(t('mealsTab.notice.removed', { name }), before);
    await saved;
  }, [applyToPlan, offerBack, plan, savedMeals, t]);

  const moveCourse = useCallback(async (date: string, slot: MealSlotType, from: number, to: number) => {
    await applyToPlan((p) => movePlanCourse(p, date, slot, from, to));
  }, [applyToPlan]);

  const setSlotTime = useCallback(async (date: string, slot: MealSlotType, time: string | undefined) => {
    await applyToPlan((p) => setPlanSlotTime(p, date, slot, time));
  }, [applyToPlan]);

  const clearAllPlan = useCallback(() => {
    // Asked first (in Mealie mode it clears the family's Mealie week too),
    // and Undo after puts back what the week held.
    const before = weekPlan;
    const { thisWeek, range } = week;
    setConfirmAction({
      title: t('mealsTab.confirm.clearWeek.title'),
      description: savesToMealie
        ? (thisWeek ? t('mealsTab.confirm.clearWeek.descriptionMealie') : t('mealsTab.confirm.clearWeek.descriptionMealieDates', { range }))
        : (thisWeek ? t('mealsTab.confirm.clearWeek.description') : t('mealsTab.confirm.clearWeek.descriptionDates', { range })),
      confirmLabel: t('mealsTab.confirm.clearWeek.confirmLabel'),
      onConfirm: async () => {
        const weekDateStrs = weekDates.map((d) => d.date);
        await applyToPlan((p) => clearPlanWeek(p, weekDateStrs));
        setConfirmAction(null);
        showNotice(thisWeek ? t('mealsTab.notice.cleared') : t('mealsTab.notice.clearedDates', { range }), () => {
          void applyToPlan((p) => restorePlanEntries(clearPlanWeek(p, weekDateStrs), before));
        });
      },
    });
  }, [weekDates, weekPlan, week, applyToPlan, setConfirmAction, savesToMealie, showNotice, t]);

  const suggestRandom = useCallback(async () => {
    const weekDateStrs = weekDates.map((d) => d.date);
    const { thisWeek, range } = week;
    // With the plan in Mealie, Mealie suggests, by its own meal plan rules,
    // and only for the dinners nobody has planned, so nothing is replaced.
    // Dinners only: Mealie's random pick ignores what kind of meal it is
    // filling unless the household set meal plan rules there, and a random
    // recipe for breakfast is nonsense. It asks first, since it writes to the
    // family's Mealie, and the notice can take it all back.
    if (savesToMealie) {
      if (!settings.enabledSlots.includes('dinner')) {
        showNotice(t('mealie.suggest.noDinners'));
        return;
      }
      const empty = weekDateStrs
        .filter((date) => !weekPlan.some((p) => p.date === date && p.slot === 'dinner'))
        .map((date) => ({ date, slot: 'dinner' as const }));
      if (empty.length === 0) {
        showNotice(thisWeek ? t('mealie.suggest.allPlanned') : t('mealie.suggest.allPlannedDates', { range }));
        return;
      }
      setConfirmAction({
        title: t('mealie.suggest.confirmTitle', { count: empty.length }),
        description: thisWeek
          ? t('mealie.suggest.confirmDescription', { count: empty.length })
          : t('mealie.suggest.confirmDescriptionDates', { count: empty.length, range }),
        confirmLabel: t('mealie.suggest.confirmLabel'),
        // Filling empty nights removes nothing: not the red of Clear.
        confirmColor: 'var(--hs-accent)',
        onConfirm: async () => {
          setConfirmAction(null);
          const result = await suggestFromMealie(empty);
          if (!result) return;
          if (result.created === 0) {
            if (result.skipped > 0) showNotice(t('mealie.suggest.nothingFits'));
            return;
          }
          const added = result.entries;
          // Names the nights (the new dinners can be far down the week), or
          // says every night rather than listing all seven.
          const dates = new Set(added.map((e) => e.date));
          const message = dates.size >= 7
            ? (thisWeek ? t('mealie.suggest.doneEveryNight') : t('mealie.suggest.doneEveryNightDates', { range }))
            : t('mealie.suggest.done', { count: result.created, days: formatDayList([...dates], formattingLocale) });
          showNotice(message, () => { void applyToPlan((p) => withoutSuggested(p, added)); });
        },
      });
      return;
    }
    // Nothing in the library, nothing to pick from.
    if (savedMeals.length === 0) return;
    // What the week held, for Undo, as Copy Last Week keeps it.
    const before = weekPlan;
    const suggest = async () => {
      // Picked once, then placed: the edit runs for the screen and again for
      // the save, and a fresh pick each time showed one week and saved another.
      const picked = suggestPlanWeek(planRef.current, savedMeals, settings.enabledSlots, weekDateStrs);
      await applyToPlan((p) => placePlanWeek(p, weekDateStrs, picked));
      showNotice(thisWeek ? t('mealsTab.notice.suggested') : t('mealsTab.notice.suggestedDates', { range }), () => {
        void applyToPlan((p) => placePlanWeek(p, weekDateStrs, before));
      });
    };
    // An empty week has nothing to lose. One with meals in it is asked about
    // first, as Clear is: Suggest replaces the whole week, hand-picked meals
    // included.
    if (before.length === 0) {
      await suggest();
      return;
    }
    setConfirmAction({
      title: thisWeek ? t('mealsTab.confirm.suggestWeek.title') : t('mealsTab.confirm.suggestWeek.titleDates', { range }),
      description: thisWeek ? t('mealsTab.confirm.suggestWeek.description') : t('mealsTab.confirm.suggestWeek.descriptionDates', { range }),
      confirmLabel: t('mealsTab.confirm.suggestWeek.confirmLabel'),
      onConfirm: async () => {
        setConfirmAction(null);
        await suggest();
      },
    });
  }, [savedMeals, weekDates, weekPlan, week, settings.enabledSlots, applyToPlan, setConfirmAction, t, savesToMealie, suggestFromMealie, showNotice, formattingLocale]);

  const copyLastWeek = useCallback(async () => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    // Pass the household's weekStartDay so the previous-week window aligns
    // correctly for Monday-start households. Without this, prevStart was rolled
    // back to a Sunday and the 7-day window was shifted by one day.
    const prevWeekDates = getWeekDates(prevStart, settings.weekStartDay).map((d) => d.date);
    const weekDateStrs = weekDates.map((d) => d.date);
    // What the week held, for Undo; a planned week is asked about first, as
    // Clear and Suggest are, since the copy replaces it (in Mealie, for the
    // whole family).
    const before = weekPlan;
    // Another week than this one is named by its dates, and so is the one
    // copied from: "last week" would read as the one before today's.
    const { thisWeek, range } = week;
    const from = shownWeek(prevWeekDates, todayISO, formattingLocale).range;
    const copy = async () => {
      await applyToPlan((p) => copyPlanWeek(p, prevWeekDates, weekDateStrs));
      showNotice(thisWeek ? t('mealsTab.notice.copied') : t('mealsTab.notice.copiedDates', { from }), () => {
        void applyToPlan((p) => restorePlanEntries(clearPlanWeek(p, weekDateStrs), before));
      });
    };
    if (before.length === 0) {
      await copy();
      return;
    }
    setConfirmAction({
      title: thisWeek ? t('mealsTab.confirm.copyWeek.title') : t('mealsTab.confirm.copyWeek.titleDates', { range, from }),
      description: savesToMealie
        ? (thisWeek ? t('mealsTab.confirm.copyWeek.descriptionMealie') : t('mealsTab.confirm.copyWeek.descriptionMealieDates', { range, from }))
        : (thisWeek ? t('mealsTab.confirm.copyWeek.description') : t('mealsTab.confirm.copyWeek.descriptionDates', { range, from })),
      confirmLabel: t('mealsTab.confirm.copyWeek.confirmLabel'),
      onConfirm: async () => {
        setConfirmAction(null);
        await copy();
      },
    });
  }, [viewingWeekStart, weekDates, weekPlan, week, todayISO, formattingLocale, settings.weekStartDay, applyToPlan, setConfirmAction, savesToMealie, showNotice, t]);

  const hasPreviousWeekEntries = useMemo(() => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    // Same fix as copyLastWeek — must honor weekStartDay or the previous-week
    // window is misaligned for Monday-start households.
    const prevWeekDates = getWeekDates(prevStart, settings.weekStartDay);
    return filterPlanToWeek(plan, prevWeekDates[0].date, prevWeekDates[6].date).length > 0;
  }, [plan, viewingWeekStart, settings.weekStartDay]);

  return {
    weekPlan,
    week,
    getMealForSlot,
    assignMealToSlot,
    setSlotText,
    clearSlot,
    clearMeal,
    addCourse,
    changeCourse,
    removeCourse,
    moveCourse,
    setSlotTime,
    clearAllPlan,
    suggestRandom,
    copyLastWeek,
    hasPreviousWeekEntries,
  };
}
