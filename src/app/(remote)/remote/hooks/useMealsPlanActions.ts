'use client';

import { useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { SavedMeal, PlannedMeal, MealSlotType, MealSettings } from '@/types/config';
import {
  filterPlanToWeek,
  resolveMealWithEntry,
  getLocalizedDayNames,
  dateToDayIndex,
  getMealSlotLabelKey,
  formatDayList,
  previousWeekDates,
  type ResolvedPlanEntry,
} from '@/lib/meal-constants';
import {
  applyMealPick,
  clearPlanSlot,
  setPlanSlotTime,
  clearPlanWeek,
  undoClearWeek,
  suggestPlanWeek,
  placePlanWeek,
  copyPlanWeek,
  restorePlanEntries,
  pickReplacedEntry,
  mealieSuggestCells,
  mealieSuggestOutcome,
} from '@/lib/meal-plan-actions';
import { movePlanCourse, removePlanCourse, type MealPick, type MealPickTarget } from '@/lib/meal-courses';
import { withoutSuggested, type MealEdit, type MealieSuggestedEntry } from '@/lib/meal-client';
import { shownWeek } from '@/lib/meal-plan-words';
import { useFormattingLocale, useTranslate } from '@/i18n';
import type { MealsConfirmAction, MealsWeekDay } from '../components/meals-shared';

interface MealsPlanActionsParams {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  setPlan: Dispatch<SetStateAction<PlannedMeal[]>>;
  saveData: (edit: MealEdit) => Promise<boolean>;
  settings: MealSettings;
  /** The viewed week, from `useMealsWeekNav` */
  weekDates: MealsWeekDay[];
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
   * Keep the dishes a meal names drawable after the plan stops naming them
   * (`usePickedMeals`). A Mealie copy carries only the recipes its plan uses,
   * so an Undo would otherwise put back a meal the phone has no name or
   * picture for until Mealie answers.
   */
  keepEntry: (entry: PlannedMeal) => void;
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
  todayISO,
  setConfirmAction,
  savesToMealie,
  suggestFromMealie,
  showNotice,
  keepEntry,
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
    keepEntry(before);
    showNotice(message, () => { void applyToPlan((p) => restorePlanEntries(p, [before])); });
  }, [applyToPlan, keepEntry, showNotice]);

  /**
   * A dish chosen in the picker (a meal, or words typed instead) put where
   * the picker was opened for: the main dish, a new course, or in place of
   * a course. Replacing another dish, the notice offers that one back,
   * naming the new one (`name`).
   */
  const applyPick = useCallback(async (target: MealPickTarget, pick: MealPick, name: string) => {
    const before = pickReplacedEntry(planRef.current, target, pick);
    const saved = applyToPlan((p) => applyMealPick(p, target, pick));
    if (before) offerBack(t('mealsTab.notice.changed', { name }), before);
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
        // Undo puts the week back on top of whatever has been planned since.
        showNotice(thisWeek ? t('mealsTab.notice.cleared') : t('mealsTab.notice.clearedDates', { range }), () => {
          void applyToPlan((p) => undoClearWeek(p, before));
        });
      },
    });
  }, [weekDates, weekPlan, week, applyToPlan, setConfirmAction, savesToMealie, showNotice, t]);

  const suggestRandom = useCallback(async () => {
    const weekDateStrs = weekDates.map((d) => d.date);
    const { thisWeek, range } = week;
    // With the plan in Mealie, Mealie suggests, by its own meal plan rules,
    // and only for the dinners nobody has planned (`mealieSuggestCells`), so
    // nothing is replaced. It asks first, since it writes to the family's
    // Mealie, and the notice can take it all back.
    if (savesToMealie) {
      const ask = mealieSuggestCells(weekPlan, weekDateStrs, settings.enabledSlots);
      if (ask.kind === 'no-dinners') {
        showNotice(t('mealie.suggest.noDinners'));
        return;
      }
      if (ask.kind === 'all-planned') {
        showNotice(thisWeek ? t('mealie.suggest.allPlanned') : t('mealie.suggest.allPlannedDates', { range }));
        return;
      }
      const empty = ask.cells;
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
          const outcome = mealieSuggestOutcome(result);
          if (outcome.kind === 'nothing') {
            showNotice(t('mealie.suggest.nothingFits'));
            return;
          }
          // Names the nights (the new dinners can be far down the week), or
          // says every night rather than listing all seven.
          const message = outcome.everyNight
            ? (thisWeek ? t('mealie.suggest.doneEveryNight') : t('mealie.suggest.doneEveryNightDates', { range }))
            : t('mealie.suggest.done', { count: outcome.count, days: formatDayList(outcome.nights, formattingLocale) });
          showNotice(message, () => { void applyToPlan((p) => withoutSuggested(p, outcome.added)); });
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
    const weekDateStrs = weekDates.map((d) => d.date);
    const prevWeekDates = previousWeekDates(weekDateStrs, settings.weekStartDay);
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
  }, [weekDates, weekPlan, week, todayISO, formattingLocale, settings.weekStartDay, applyToPlan, setConfirmAction, savesToMealie, showNotice, t]);

  const hasPreviousWeekEntries = useMemo(() => {
    const prevWeekDates = previousWeekDates(weekDates.map((d) => d.date), settings.weekStartDay);
    return filterPlanToWeek(plan, prevWeekDates[0], prevWeekDates[6]).length > 0;
  }, [plan, weekDates, settings.weekStartDay]);

  return {
    weekPlan,
    week,
    getMealForSlot,
    applyPick,
    clearSlot,
    clearMeal,
    removeCourse,
    moveCourse,
    setSlotTime,
    clearAllPlan,
    suggestRandom,
    copyLastWeek,
    hasPreviousWeekEntries,
  };
}
