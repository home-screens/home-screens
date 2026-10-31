'use client';

import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { CookingPot, ExternalLink, RefreshCw, TriangleAlert } from 'lucide-react';
import { uuid } from '@/lib/uuid';
import {
  DEFAULT_MEAL_EMOJI,
  toISODate,
  fromISODate,
  getWeekRange,
  getWeekDatesForRange,
  weekStartAfterDayChange,
  filterPlanToWeek,
  resolveMealTimeFormat,
  resolveMealWithEntry,
  formatDayList,
  getMealSlotLabelKey,
} from '@/lib/meal-constants';
import {
  assignPlanSlot,
  clearPlanSlot,
  setPlanSlotText,
  setPlanSlotTime,
  clearPlanWeek,
  suggestPlanWeek,
  placePlanWeek,
  copyPlanWeek,
  upsertSavedMeal,
  removeSavedMeal,
  toggleSavedMealFavorite,
  restorePlanEntries,
  plannedEntriesOfMeal,
  restoreSavedMeal,
  replacesDish,
} from '@/lib/meal-plan-actions';
import { formatPlannedDays, shownWeek } from '@/lib/meal-plan-words';
import { addPlanCourse, movePlanCourse, removePlanCourse, setPlanCourse } from '@/lib/meal-courses';
import {
  canEditMergedPlan,
  mealiePlannerUrl,
  mealieStatus,
  rangeCovers,
  type MealieWireBlock,
} from '@/lib/meal-sources';
import { formatClockMinutes } from '@/lib/clock-time';
import { wallClockParts } from '@/lib/timezone';
import { groceryChecksForWeek, groceryWeekKey, type GroceryChecked } from '@/lib/grocery-checks';
import { useEditorStore } from '@/stores/editor-store';
import { useEditorHouseholdToday, useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { useMealieHousehold } from '@/hooks/useMealieCheck';
import { useMealieLink } from '@/components/meals/useMealieLink';
import CRUDModalShell from '@/components/editor/CRUDModalShell';
import SidebarLibrary from './SidebarLibrary';
import SidebarDetail from './SidebarDetail';
import SidebarGrocery from './SidebarGrocery';
import { MealieDetail, MealieLibrary } from './SidebarMealie';
import { MealieGrocery } from './SidebarMealieGrocery';
import WeekGrid from './WeekGrid';
import MealPickerPopover, { type PickerPurpose } from './MealPickerPopover';
import MealPopover from './MealPopover';
import type { SavedMeal, PlannedMeal, MealSlotType, MealSettings, MealCourseKind } from '@/types/config';
import { withoutSuggested, type MealEdit, type MealieRange, type MealieSuggestedEntry } from '@/lib/meal-client';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useHouseholdTimeFormat } from '@/hooks/useHouseholdTimeFormat';
import type { MealSaveFailure } from '@/hooks/useMealPlannerData';
import { mealSaveFailedKey } from './save-failed-words';

// ── Props ────────────────────────────────────────────────────

interface MealPlannerModalProps {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  /** Shared meal settings — slots, week start, default times. Comes from data/meals.json. */
  settings: MealSettings;
  /** Every week's grocery ticks, shared with the phone. */
  groceryChecked: GroceryChecked;
  /** Tick or untick one item on the list of `week` (that week's key). */
  onToggleGroceryItem: (week: string, item: string) => void;
  accentColor: string;
  /**
   * Persist a change, written as a function of the copy it applies to. Return
   * only the half that changed — the store preserves whatever is omitted, so
   * an unchanged field sent here would overwrite an edit another surface made
   * in the meantime. The function may run again against a newer copy when the
   * hub reports that somebody else saved first.
   */
  onUpdate: (edit: MealEdit) => void;
  onClose: () => void;
  /**
   * Where `plan` and `savedMeals` come from. In Mealie mode they are Mealie's
   * plan and recipes, every plan change saves to Mealie, and the library
   * cannot be edited here.
   */
  source?: 'local' | 'mealie';
  /** Mealie's block (status, days held, address), in Mealie mode. */
  mealie?: MealieWireBlock | null;
  /** Bring Mealie's plan for more days into the copy, when paging past the weeks it holds. */
  onShowMealieRange?: (range: MealieRange) => void;
  /** Whether those days are on their way or failed to come. */
  mealieWeeks?: 'idle' | 'loading' | 'failed';
  /** Ask the hub again (Mealie stopped answering). */
  onReload?: () => void;
  /** Mealie's own picks for empty meals: Suggest while the plan lives in Mealie. */
  onSuggestFromMealie?: (cells: { date: string; slot: MealSlotType }[]) => Promise<{ created: number; skipped: number; entries: MealieSuggestedEntry[] } | null>;
  /** The last save failed, and why (set by the data hook; cleared when the next one starts). */
  saveError?: MealSaveFailure | null;
  /**
   * The meals have loaded. The window can open in the same moment as the
   * module is picked, before the first answer: until then planning is off, or
   * Suggest would read the empty copy as a family plan with no meals and do
   * nothing.
   */
  loaded: boolean;
}

type SidebarTab = 'library' | 'detail' | 'grocery';

interface PickerState {
  date: string;
  slot: MealSlotType;
  purpose: PickerPurpose;
}

interface PopoverState {
  date: string;
  slot: MealSlotType;
  anchor: DOMRect;
  /** The planner window's body when the popover opened. */
  bounds?: DOMRect;
  /** Where the sidebar ends: the popover keeps off the meal details beside the week. */
  minLeft?: number;
}

/** `YYYY-MM-DD` moved by `days`. */
function shiftISODate(date: string, days: number): string {
  const d = fromISODate(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

// ── Component ────────────────────────────────────────────────

export default function MealPlannerModal({
  savedMeals,
  plan,
  settings,
  groceryChecked,
  onToggleGroceryItem,
  accentColor,
  onUpdate,
  onClose,
  source = 'local',
  mealie = null,
  onShowMealieRange,
  mealieWeeks = 'idle',
  onReload,
  onSuggestFromMealie,
  saveError = null,
  loaded,
}: MealPlannerModalProps) {
  const t = useTranslate('editor');
  const tModules = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  // Household GlobalSettings.timeFormat — resolves the effective format when
  // the shared meal settings carry no explicit override.
  const globalTf = useHouseholdTimeFormat(useEditorStore((s) => s.config?.settings?.timeFormat));
  const timeFormat = resolveMealTimeFormat(settings, globalTf);
  const householdZone = useEditorHouseholdTimezone();
  const tabLabelMap = useMemo<Record<SidebarTab, string>>(
    () => ({
      library: t('mealPlannerModal.tabs.library'),
      detail: t('mealPlannerModal.tabs.detail'),
      grocery: t('mealPlannerModal.tabs.grocery'),
    }),
    [t],
  );
  const onMealie = source === 'mealie';
  const status = mealieStatus({ source, mealie });
  const mealieHousehold = useMealieHousehold(onMealie);
  const mealieLink = useMealieLink();
  const slots = settings.enabledSlots;
  const weekStartDay = settings.weekStartDay;
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('library');
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  // Pending new meal: created locally, only persisted when user saves from Detail tab
  const [pendingMeal, setPendingMeal] = useState<SavedMeal | null>(null);
  // Mealie recipes picked or opened here that the copy does not hold yet: a
  // recipe just put on the plan draws at once, before Mealie's answer
  // brings it along with the plan.
  const [pickedMeals, setPickedMeals] = useState<SavedMeal[]>([]);
  const [toast, setToast] = useState<{ message: string; undo?: () => void; error?: boolean } | null>(null);
  // Suggest in Mealie mode waits on Mealie, which can take a while: the button says so.
  const [suggesting, setSuggesting] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // The household's day, not the laptop's: the wall is already on next week
  // from the household's midnight, whatever zone this laptop is in.
  const todayISO = useEditorHouseholdToday();

  const [viewingWeekStart, setViewingWeekStart] = useState<Date>(() => {
    const { start } = getWeekRange(fromISODate(todayISO), weekStartDay);
    return new Date(start + 'T12:00:00');
  });
  // The household's week start comes with the meals, and reads as Sunday
  // until they land. A window opened before that would stay on the week from
  // the Sunday before, which for a Monday household is last week: when the
  // week start changes, show this week again, as the phone does.
  const shownWeekStartDay = useRef(weekStartDay);
  // Before paint: one frame on the old alignment showed last week.
  useLayoutEffect(() => {
    if (shownWeekStartDay.current === weekStartDay) return;
    shownWeekStartDay.current = weekStartDay;
    const { start } = getWeekRange(fromISODate(todayISO), weekStartDay);
    setViewingWeekStart(new Date(start + 'T12:00:00'));
  }, [weekStartDay, todayISO]);
  // Left open past the household's week boundary, the planner follows today
  // onto the new week unless someone navigated to a different week.
  const shownToday = useRef(todayISO);
  useEffect(() => {
    const before = shownToday.current;
    if (before === todayISO) return;
    shownToday.current = todayISO;
    setViewingWeekStart((prev) => {
      const start = weekStartAfterDayChange(toISODate(prev), before, todayISO, weekStartDay);
      return start === toISODate(prev) ? prev : fromISODate(start);
    });
  }, [todayISO, weekStartDay]);

  const viewedWeekDates = useMemo(
    () => getWeekDatesForRange(toISODate(viewingWeekStart), weekStartDay),
    [viewingWeekStart, weekStartDay],
  );

  const isCurrentWeek = viewedWeekDates.includes(todayISO);
  // "This week" in a toast or a label only while it is this week; any other is named by its dates.
  const week = useMemo(() => shownWeek(viewedWeekDates, todayISO, formattingLocale), [viewedWeekDates, todayISO, formattingLocale]);

  const weekPlan = useMemo(
    () => filterPlanToWeek(plan, viewedWeekDates[0], viewedWeekDates[6]),
    [plan, viewedWeekDates],
  );

  // ── Mealie: which days the copy holds, and whether planning is open ──

  const weekStart = viewedWeekDates[0];
  const weekEnd = viewedWeekDates[6];
  // The week in view and the one before it, for Copy Last Week.
  const wantedRange = useMemo(() => ({ start: shiftISODate(weekStart, -7), end: weekEnd }), [weekStart, weekEnd]);
  const weekHeld = !onMealie || status.state === 'unreachable' || rangeCovers(mealie?.range, { start: weekStart, end: weekEnd });
  useEffect(() => {
    if (!onMealie || mealie?.status !== 'ok' || rangeCovers(mealie.range, wantedRange)) return;
    onShowMealieRange?.(wantedRange);
  }, [onMealie, mealie?.status, mealie?.range, wantedRange, onShowMealieRange]);

  const editable = loaded && canEditMergedPlan({ plan, savedMeals, source, mealie }) && weekHeld;

  // Ticks belong to the list they were made on: the viewed week's.
  const groceryWeek = groceryWeekKey(viewedWeekDates[0], weekStartDay);

  const navigateWeek = useCallback((direction: -1 | 1) => {
    setPopover(null);
    setViewingWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + direction * 7);
      return next;
    });
  }, []);

  const jumpToToday = useCallback(() => {
    setPopover(null);
    const { start } = getWeekRange(fromISODate(todayISO), weekStartDay);
    setViewingWeekStart(new Date(start + 'T12:00:00'));
  }, [todayISO, weekStartDay]);

  const showToast = useCallback((message: string, undo?: () => void, error?: boolean) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, undo, error });
    // One that can be undone stays long enough to read and decide, as the
    // phone's does: the window takes back with Undo where the phone asks first.
    toastTimerRef.current = setTimeout(() => setToast(null), error ? 6000 : undo ? 12000 : 4000);
  }, []);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  // A refused save is said here, where the change was made, with Mealie's
  // reason when Mealie refused it; the panel has already gone back to what
  // the hub holds.
  useEffect(() => {
    if (!saveError) return;
    showToast(t(mealSaveFailedKey(saveError, onMealie)), undefined, true);
  }, [saveError, onMealie, showToast, t]);

  const selectMeal = useCallback((id: string) => {
    setSelectedMealId(id);
    setSidebarTab('detail');
  }, []);

  const rememberMeal = useCallback((meal: SavedMeal) => {
    setPickedMeals((prev) => (prev.some((m) => m.id === meal.id) ? prev : [...prev, meal]));
  }, []);

  // Everything the plan can point at: the copy's meals, a new meal not saved
  // yet, and Mealie recipes picked here that the copy does not hold yet.
  const allMeals = useMemo(() => {
    const known = new Set(savedMeals.map((m) => m.id));
    const extra = pickedMeals.filter((m) => !known.has(m.id));
    return [...savedMeals, ...(pendingMeal ? [pendingMeal] : []), ...extra];
  }, [savedMeals, pendingMeal, pickedMeals]);

  const addMeal = useCallback(() => {
    const id = uuid();
    const newMeal: SavedMeal = {
      id,
      name: t('mealPlannerModal.newMealName'),
      emoji: DEFAULT_MEAL_EMOJI,
    };
    // Don't persist yet — keep it local until the user saves
    setPendingMeal(newMeal);
    setSelectedMealId(id);
    setSidebarTab('detail');
  }, [t]);

  const saveMeal = useCallback((updated: SavedMeal) => {
    onUpdate((c) => ({ savedMeals: upsertSavedMeal(c.savedMeals, updated) }));
    if (pendingMeal && updated.id === pendingMeal.id) {
      // First save of a new meal — return to the library once it is persisted
      setPendingMeal(null);
      setSelectedMealId(null);
      setSidebarTab('library');
    }
    showToast(t('mealPlannerModal.toast.changesSaved'));
  }, [pendingMeal, onUpdate, showToast, t]);

  const deleteMeal = useCallback((id: string) => {
    if (pendingMeal && id === pendingMeal.id) {
      setPendingMeal(null);
      setSelectedMealId(null);
      setSidebarTab('library');
      return;
    }
    const deletedMeal = savedMeals.find((m) => m.id === id);
    // Every meal it is in, as the main dish or a course: the days the toast
    // names (the window deletes without asking) and what Undo puts back.
    const deletedEntries = plannedEntriesOfMeal(plan, id);
    onUpdate((c) => removeSavedMeal(c.savedMeals, c.plan, id));
    setSelectedMealId(null);
    setSidebarTab('library');
    if (deletedMeal) {
      const days = formatPlannedDays(deletedEntries.map((p) => p.date), todayISO, formattingLocale, (count) => t('mealPlannerModal.toast.moreDays', { count }));
      const message = days
        ? t('mealPlannerModal.toast.mealDeletedPlanned', { name: deletedMeal.name, days })
        : t('mealPlannerModal.toast.mealDeleted', { name: deletedMeal.name });
      showToast(message, () => {
        // Put the meal and its slots back on top of whatever is planned now.
        onUpdate((c) => restoreSavedMeal(c.savedMeals, c.plan, deletedMeal, deletedEntries));
        setSelectedMealId(deletedMeal.id);
        setSidebarTab('detail');
      });
    }
  }, [savedMeals, plan, pendingMeal, onUpdate, showToast, t, todayISO, formattingLocale]);

  const toggleFavorite = useCallback((id: string) => {
    if (pendingMeal && id === pendingMeal.id) {
      setPendingMeal({ ...pendingMeal, isFavorite: !pendingMeal.isFavorite });
      return;
    }
    onUpdate((c) => ({ savedMeals: toggleSavedMealFavorite(c.savedMeals, id) }));
  }, [pendingMeal, onUpdate]);

  const setSlotTime = useCallback((date: string, slot: MealSlotType, time: string | undefined) => {
    if (setPlanSlotTime(plan, date, slot, time) === plan) return; // no meal in that slot, so no time to set
    onUpdate((c) => ({ plan: setPlanSlotTime(c.plan, date, slot, time) }));
  }, [plan, onUpdate]);

  /**
   * A change made in one click (a dish swapped for another, a meal or a
   * course taken off): the toast says what happened, and Undo puts `before`,
   * the meal as it was, back over whatever the slot holds by then. In Mealie
   * the dishes it names leave the copy with the change, so they are kept
   * here to draw again at once. `swapped` is a dish change's new and old
   * dish: Detail showing the new one when Undo is pressed goes back to the
   * old one, as it followed the change.
   */
  const offerBack = useCallback((message: string, before: PlannedMeal, swapped?: { to: string; from: string }) => {
    if (onMealie) {
      for (const m of allMeals) {
        if (m.id === before.mealId || before.courses?.some((c) => c.mealId === m.id)) rememberMeal(m);
      }
    }
    showToast(message, () => {
      onUpdate((c) => ({ plan: restorePlanEntries(c.plan, [before]) }));
      if (swapped) setSelectedMealId((id) => (id === swapped.to ? swapped.from : id));
    });
  }, [onMealie, allMeals, rememberMeal, onUpdate, showToast]);

  const removeSlotMeal = useCallback((date: string, slot: MealSlotType) => {
    const { planned: removed, name, courses } = resolveMealWithEntry(date, slot, plan, allMeals);
    setPopover((p) => (p && p.date === date && p.slot === slot ? null : p));
    onUpdate((c) => ({ plan: clearPlanSlot(c.plan, date, slot) }));
    if (removed) {
      const dish = name ?? tModules(getMealSlotLabelKey(slot));
      offerBack(courses.length === 0
        ? t('mealPlannerModal.toast.mealRemoved', { name: dish })
        : t('mealPlannerModal.toast.mealRemovedWithCourses', { name: dish, count: courses.length }), removed);
    }
  }, [plan, allMeals, onUpdate, offerBack, t, tModules]);

  const suggestRandom = useCallback(() => {
    // With the plan in Mealie, Mealie suggests by its own meal plan rules,
    // and only for the dinners nobody has planned, so nothing is replaced.
    // The phone's Suggest fills the same dinners.
    if (onMealie) {
      // Dinners only: Mealie's random pick ignores the kind of meal unless the
      // household set meal plan rules there, and a random recipe for
      // breakfast is nonsense. The phone asks first; here, as with Clear Week,
      // the toast's Undo takes back exactly what it added.
      if (!slots.includes('dinner')) {
        showToast(t('mealPlannerModal.toast.mealieNoDinners'));
        return;
      }
      const empty = viewedWeekDates
        .filter((date) => !plan.some((p) => p.date === date && p.slot === 'dinner'))
        .map((date) => ({ date, slot: 'dinner' as const }));
      if (empty.length === 0) {
        showToast(week.thisWeek ? t('mealPlannerModal.toast.mealieAllPlanned') : t('mealPlannerModal.toast.mealieAllPlannedDates', { range: week.range }));
        return;
      }
      if (!onSuggestFromMealie) return;
      setSuggesting(true);
      void onSuggestFromMealie(empty).finally(() => setSuggesting(false)).then((result) => {
        if (!result) return;
        if (result.created === 0) {
          showToast(t('mealPlannerModal.toast.mealieNothingFits'));
          return;
        }
        const added = result.entries;
        const dates = new Set(added.map((e) => e.date));
        const message = dates.size >= 7
          ? (week.thisWeek ? t('mealPlannerModal.toast.mealieSuggestedEveryNight') : t('mealPlannerModal.toast.mealieSuggestedEveryNightDates', { range: week.range }))
          : t('mealPlannerModal.toast.mealieSuggested', { count: result.created, days: formatDayList([...dates], formattingLocale) });
        showToast(message, () => {
          onUpdate((c) => ({ plan: withoutSuggested(c.plan, added) }));
        });
      });
      return;
    }
    if (savedMeals.length === 0) return;
    // Suggest replaces the week, hand-picked meals included: Undo puts back
    // what the week held, as it does after Copy Last Week.
    const before = [...weekPlan];
    // Picked once, then placed: the edit runs for the window and again for
    // the save, and a fresh pick each time showed one week and saved another.
    const picked = suggestPlanWeek(plan, savedMeals, slots, viewedWeekDates);
    onUpdate((c) => ({ plan: placePlanWeek(c.plan, viewedWeekDates, picked) }));
    showToast(t('mealPlannerModal.toast.randomSuggested'), () => {
      onUpdate((c) => ({ plan: placePlanWeek(c.plan, viewedWeekDates, before) }));
    });
  }, [onMealie, plan, weekPlan, week, onSuggestFromMealie, savedMeals, slots, viewedWeekDates, onUpdate, showToast, t, formattingLocale]);

  const copyLastWeek = useCallback(() => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevWeekDates = getWeekDatesForRange(toISODate(prevStart), weekStartDay);
    if (copyPlanWeek(plan, prevWeekDates, viewedWeekDates) === plan) return; // nothing planned last week
    // The copy replaces the week (in Mealie, for the whole family): Undo puts
    // back what the week held.
    const before = [...weekPlan];
    onUpdate((c) => ({ plan: copyPlanWeek(c.plan, prevWeekDates, viewedWeekDates) }));
    // "Last week" only from this week; from any other, the week copied is named by its dates.
    const message = week.thisWeek
      ? t('mealPlannerModal.toast.lastWeekCopied')
      : t('mealPlannerModal.toast.lastWeekCopiedDates', { from: shownWeek(prevWeekDates, todayISO, formattingLocale).range });
    showToast(message, () => {
      onUpdate((c) => ({ plan: restorePlanEntries(clearPlanWeek(c.plan, viewedWeekDates), before) }));
    });
  }, [plan, weekPlan, week, todayISO, formattingLocale, viewingWeekStart, viewedWeekDates, weekStartDay, onUpdate, showToast, t]);

  const clearWeek = useCallback(() => {
    if (weekPlan.length === 0) return;
    const cleared = [...weekPlan];
    setPopover(null);
    onUpdate((c) => ({ plan: clearPlanWeek(c.plan, viewedWeekDates) }));
    showToast(t('mealPlannerModal.toast.weekCleared'), () => {
      // Restore the cleared week on top of whatever is planned now.
      onUpdate((c) => ({ plan: restorePlanEntries(c.plan, cleared) }));
    });
  }, [weekPlan, viewedWeekDates, onUpdate, showToast, t]);

  const hasPreviousWeekEntries = useMemo(() => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevWeekDates = getWeekDatesForRange(toISODate(prevStart), weekStartDay);
    return filterPlanToWeek(plan, prevWeekDates[0], prevWeekDates[6]).length > 0;
  }, [plan, viewingWeekStart, weekStartDay]);

  // ── The meal popover and the picker ──

  const bodyRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const openMeal = useCallback((date: string, slot: MealSlotType, anchor: DOMRect) => {
    setPopover({ date, slot, anchor, bounds: bodyRef.current?.getBoundingClientRect(), minLeft: sidebarRef.current?.getBoundingClientRect().right });
    // The Detail tab follows the main dish (or the course a meal leads with).
    const { meal } = resolveMealWithEntry(date, slot, plan, allMeals);
    if (meal) selectMeal(meal.id);
  }, [plan, allMeals, selectMeal]);

  const closePopover = useCallback(() => setPopover(null), []);

  const openPicker = useCallback((date: string, slot: MealSlotType) => {
    setPicker({ date, slot, purpose: { kind: 'main' } });
  }, []);

  const closePicker = useCallback(() => {
    setPicker(null);
  }, []);

  const pickMeal = useCallback((meal: SavedMeal) => {
    if (!picker) return;
    const { date, slot, purpose } = picker;
    if (onMealie) rememberMeal(meal);
    // Detail was showing the dish being replaced: it follows the new one
    // (in Mealie the old recipe leaves the list once it is off the plan).
    const entry = plan.find((p) => p.date === date && p.slot === slot);
    const replaced = purpose.kind === 'main'
      ? resolveMealWithEntry(date, slot, plan, allMeals).meal?.id
      : purpose.kind === 'swap' ? entry?.courses?.[purpose.index]?.mealId : undefined;
    if (replaced && replaced === selectedMealId) setSelectedMealId(meal.id);
    if (purpose.kind === 'main') {
      onUpdate((c) => ({ plan: assignPlanSlot(c.plan, date, slot, meal.id) }));
    } else if (purpose.kind === 'add') {
      onUpdate((c) => ({ plan: addPlanCourse(c.plan, date, slot, { kind: purpose.course, mealId: meal.id }) }));
    } else {
      onUpdate((c) => ({ plan: setPlanCourse(c.plan, date, slot, purpose.index, { mealId: meal.id }) }));
    }
    // A dish changed for another one, for everyone at once: the toast offers it back.
    if (entry && purpose.kind !== 'add' && replacesDish(entry, purpose.kind === 'swap' ? purpose.index : null, { mealId: meal.id })) {
      offerBack(t('mealPlannerModal.toast.mealChanged', { name: meal.name }), entry, replaced ? { to: meal.id, from: replaced } : undefined);
    }
    setPicker(null);
  }, [picker, onMealie, rememberMeal, onUpdate, offerBack, t, plan, allMeals, selectedMealId]);

  const pickText = useCallback((text: string) => {
    if (!picker || !text.trim()) return;
    const { date, slot, purpose } = picker;
    const entry = plan.find((p) => p.date === date && p.slot === slot);
    if (purpose.kind === 'main') {
      onUpdate((c) => ({ plan: setPlanSlotText(c.plan, date, slot, text) }));
    } else if (purpose.kind === 'add') {
      onUpdate((c) => ({ plan: addPlanCourse(c.plan, date, slot, { kind: purpose.course, customText: text }) }));
    } else {
      onUpdate((c) => ({ plan: setPlanCourse(c.plan, date, slot, purpose.index, { customText: text }) }));
    }
    if (entry && purpose.kind !== 'add' && replacesDish(entry, purpose.kind === 'swap' ? purpose.index : null, { customText: text })) {
      offerBack(t('mealPlannerModal.toast.mealChanged', { name: text.trim() }), entry);
    }
    setPicker(null);
  }, [picker, plan, onUpdate, offerBack, t]);

  const popoverEntry = popover ? plan.find((p) => p.date === popover.date && p.slot === popover.slot) : undefined;
  // The meal went (cleared here, or by a save from somewhere else): nothing to show.
  useEffect(() => {
    if (popover && !popoverEntry) setPopover(null);
  }, [popover, popoverEntry]);
  // Mealie stopped answering: planning pauses, so the popover goes.
  useEffect(() => {
    if (!editable) { setPopover(null); setPicker(null); }
  }, [editable]);

  const moveCourse = useCallback((from: number, to: number) => {
    if (!popover) return;
    const { date, slot } = popover;
    onUpdate((c) => ({ plan: movePlanCourse(c.plan, date, slot, from, to) }));
  }, [popover, onUpdate]);

  const removeCourse = useCallback((index: number) => {
    if (!popover) return;
    const { date, slot } = popover;
    const before = plan.find((p) => p.date === date && p.slot === slot);
    onUpdate((c) => ({ plan: removePlanCourse(c.plan, date, slot, index) }));
    if (before) offerBack(t('mealPlannerModal.toast.courseRemoved'), before);
  }, [popover, plan, onUpdate, offerBack, t]);

  const toggleGroceryItem = useCallback((key: string) => {
    onToggleGroceryItem(groceryWeek, key);
  }, [onToggleGroceryItem, groceryWeek]);

  const selectedMeal = selectedMealId
    ? allMeals.find((m) => m.id === selectedMealId) ?? null
    : null;

  // ── Mealie status: the pill, the paused line, the missing week ──

  const baseUrl = status.state === 'local' ? undefined : status.baseUrl;
  const plannerUrl = baseUrl ? mealieLink(mealiePlannerUrl(baseUrl)) : undefined;
  const lastUpdated = status.state === 'stale' && status.updatedAt
    ? formatClockMinutes(wallClockParts(new Date(status.updatedAt), householdZone).minuteOfDay, timeFormat)
    : null;

  const retryButton = (onClick: (() => void) | undefined) => onClick && (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-hs-border-strong bg-hs-card text-hs-text-body hover:bg-hs-hover shrink-0"
    >
      <RefreshCw className="w-3.5 h-3.5" aria-hidden />
      {t('mealPlannerModal.mealie.tryAgain')}
    </button>
  );

  // Until the meals land there is no week to show: an empty one read as
  // the meals being gone.
  const loadingLine = (
    <div className="flex-1 flex items-center justify-center p-10 text-sm text-hs-text-faint" role="status">
      {t('mealPlannerModal.loading')}
    </div>
  );

  let gridNotice: React.ReactNode = null;
  let gridReplacement: React.ReactNode = null;
  const problemWords = status.state === 'unreachable'
    ? { 'not-connected': 'notConnected', token: 'tokenRefused', unreachable: 'unreachable' }[status.problem]
    : null;
  if (!loaded) {
    gridReplacement = loadingLine;
  } else if (onMealie && status.state === 'unreachable') {
    gridReplacement = (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center" role="status">
        <span className="w-11 h-11 rounded-full bg-hs-warning/10 text-hs-warning flex items-center justify-center">
          <TriangleAlert className="w-5 h-5" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-hs-text-body">{t(`mealPlannerModal.mealie.${problemWords}Title`)}</p>
        <p className="text-xs text-hs-text-faint max-w-sm leading-relaxed">{t(`mealPlannerModal.mealie.${problemWords}Body`)}</p>
        {retryButton(onReload)}
      </div>
    );
  } else if (onMealie && status.state === 'stale') {
    // The last good copy, and why there is no newer one: a refused token
    // says how to fix it, since waiting will not.
    const token = status.problem === 'token';
    gridNotice = (
      <div className="mx-5 mt-3 flex items-start gap-2.5 rounded-lg border border-hs-warning/30 bg-hs-warning/10 px-3 py-2.5" role="status">
        <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-hs-warning" aria-hidden />
        <div className="flex-1 min-w-0 text-xs leading-[17px]">
          <p className="font-semibold text-hs-warning">{t(`mealPlannerModal.mealie.${token ? 'tokenRefused' : 'unreachable'}Title`)}</p>
          <p className="text-hs-text-muted">
            {lastUpdated
              ? t(token ? 'mealPlannerModal.mealie.tokenPausedSince' : 'mealPlannerModal.mealie.pausedSince', { time: lastUpdated })
              : t(token ? 'mealPlannerModal.mealie.tokenPaused' : 'mealPlannerModal.mealie.paused')}
          </p>
        </div>
        {retryButton(onReload)}
      </div>
    );
  } else if (onMealie && !weekHeld) {
    gridReplacement = (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center" role="status">
        {mealieWeeks === 'failed' ? (
          <>
            <p className="text-sm font-semibold text-hs-text-body">{t('mealPlannerModal.mealie.weekFailed', { range: week.range })}</p>
            {retryButton(onShowMealieRange && (() => onShowMealieRange(wantedRange)))}
          </>
        ) : (
          <p className="text-sm text-hs-text-faint">{t('mealPlannerModal.mealie.weekLoading', { range: week.range })}</p>
        )}
      </div>
    );
  }

  const subtitle = onMealie ? (
    <span className="inline-flex items-center gap-2">
      <MealieSourcePill href={plannerUrl} lastUpdated={lastUpdated} />
      {/* With no copy of the plan at all, a count of 0 would read as nothing planned. */}
      {status.state !== 'unreachable' && (
        <span>
          {week.thisWeek
            ? (mealieHousehold
              ? t('mealPlannerModal.mealie.subtitleHousehold', { household: mealieHousehold, planned: weekPlan.length })
              : t('mealPlannerModal.mealie.subtitle', { planned: weekPlan.length }))
            : (mealieHousehold
              ? t('mealPlannerModal.mealie.subtitleHouseholdDates', { household: mealieHousehold, planned: weekPlan.length, range: week.range })
              : t('mealPlannerModal.mealie.subtitleDates', { planned: weekPlan.length, range: week.range }))}
        </span>
      )}
    </span>
  ) : loaded ? t('mealPlannerModal.subtitleMealsPlanned', { meals: savedMeals.length, planned: plan.length }) : null;

  const popoverDefaultTime = popover ? settings.defaultSlotTimes[popover.slot] : undefined;

  return (
    <CRUDModalShell
      title={t('mealPlannerModal.title')}
      icon={<span className="text-lg">&#127869;</span>}
      subtitle={subtitle}
      maxWidth="max-w-[1340px]"
      headerActions={
        <div className="flex items-center gap-2">
          {onMealie && plannerUrl && (
            <a
              href={plannerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-hs-border-strong text-hs-text-muted hover:text-hs-text-body hover:bg-hs-card transition"
            >
              {t('mealPlannerModal.mealie.openMealie')}
              <ExternalLink className="w-3 h-3" aria-hidden />
            </a>
          )}
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded bg-amber-500 text-black hover:bg-amber-400 transition"
          >
            {t('mealPlannerModal.doneButton')}
          </button>
        </div>
      }
      hideFooter
      onClose={onClose}
    >
      <div ref={bodyRef} className="flex flex-1 min-h-0">
        {/* ── Sidebar ── */}
        <div ref={sidebarRef} className="w-[400px] border-r border-hs-border-strong flex flex-col shrink-0 bg-hs-body">
          {/* Tab bar */}
          <div className="flex border-b border-hs-border-strong">
            {(['library', 'detail', 'grocery'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
                  sidebarTab === tab
                    ? 'text-amber-500 border-amber-500'
                    : 'text-hs-text-faint border-transparent hover:text-hs-text-muted'
                }`}
              >
                {tabLabelMap[tab]}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {sidebarTab === 'library' && (!loaded ? loadingLine : onMealie && problemWords ? (
            // The hub already knows Mealie cannot answer: say so at once.
            <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center" role="status">
              <p className="text-sm font-semibold text-hs-text-body">{t(`mealPlannerModal.mealie.${problemWords}Title`)}</p>
            </div>
          ) : onMealie ? (
            <MealieLibrary
              selectedMealId={selectedMealId}
              onSelectMeal={(meal) => { rememberMeal(meal); selectMeal(meal.id); }}
            />
          ) : (
            <SidebarLibrary
              meals={allMeals}
              selectedMealId={selectedMealId}
              onSelectMeal={selectMeal}
              onToggleFavorite={toggleFavorite}
              onAddMeal={addMeal}
            />
          ))}
          {sidebarTab === 'detail' && (onMealie ? (
            <MealieDetail meal={selectedMeal} />
          ) : (
            <SidebarDetail
              meal={selectedMeal}
              onSave={saveMeal}
              onDelete={deleteMeal}
              onToggleFavorite={toggleFavorite}
            />
          ))}
          {sidebarTab === 'grocery' && (onMealie ? (
            <MealieGrocery
              planBaseUrl={baseUrl}
              formatTime={(at) => formatClockMinutes(wallClockParts(new Date(at), householdZone).minuteOfDay, timeFormat)}
              onError={(message) => showToast(message, undefined, true)}
            />
          ) : (
            <SidebarGrocery
              plan={weekPlan}
              meals={savedMeals}
              checkedItems={groceryChecksForWeek(groceryChecked, groceryWeek)}
              onToggleItem={toggleGroceryItem}
              week={week}
            />
          ))}
        </div>

        {/* ── Week Grid ── */}
        <WeekGrid
          plan={weekPlan}
          savedMeals={allMeals}
          slots={slots}
          accentColor={accentColor}
          timeFormat={timeFormat}
          selectedMealId={selectedMealId}
          activeCell={popover ? { date: popover.date, slot: popover.slot } : null}
          editable={editable}
          weekDates={viewedWeekDates}
          todayISO={todayISO}
          isCurrentWeek={isCurrentWeek}
          onSelectMeal={selectMeal}
          onOpenMeal={openMeal}
          onRemoveMeal={removeSlotMeal}
          onEmptyCellClick={openPicker}
          onSetSlotTime={setSlotTime}
          onSuggestRandom={suggestRandom}
          suggesting={suggesting}
          loaded={loaded}
          onCopyLastWeek={copyLastWeek}
          hasPreviousWeek={hasPreviousWeekEntries}
          onClearWeek={clearWeek}
          onNavigateWeek={navigateWeek}
          onJumpToToday={jumpToToday}
          notice={gridNotice}
          replacement={gridReplacement}
        />
      </div>

      {/* ── Meal popover ── */}
      {popover && popoverEntry && (
        <MealPopover
          // A new one per meal: focus goes back to the cell that opened it.
          key={`${popover.date}|${popover.slot}`}
          date={popover.date}
          slot={popover.slot}
          entry={popoverEntry}
          meals={allMeals}
          anchor={popover.anchor}
          bounds={popover.bounds}
          minLeft={popover.minLeft}
          source={source}
          timeFormat={timeFormat}
          accentColor={accentColor}
          defaultTime={popoverDefaultTime}
          suspended={picker !== null}
          onChangeMain={() => setPicker({ date: popover.date, slot: popover.slot, purpose: { kind: 'main' } })}
          onAddCourse={(kind: MealCourseKind) => setPicker({ date: popover.date, slot: popover.slot, purpose: { kind: 'add', course: kind } })}
          onSwapCourse={(index, kind) => setPicker({ date: popover.date, slot: popover.slot, purpose: { kind: 'swap', course: kind, index } })}
          onMoveCourse={moveCourse}
          onRemoveCourse={removeCourse}
          onSetTime={(time) => setSlotTime(popover.date, popover.slot, time)}
          onClear={() => removeSlotMeal(popover.date, popover.slot)}
          onClose={closePopover}
        />
      )}

      {/* ── Meal Picker Popover ── */}
      {picker && (
        <MealPickerPopover
          target={{ date: picker.date, slot: picker.slot }}
          purpose={picker.purpose}
          source={source}
          meals={savedMeals}
          onPickMeal={pickMeal}
          onPickText={pickText}
          onClose={closePicker}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          data-keeps-meal-popover
          role={toast.error ? 'alert' : 'status'}
          className={`fixed bottom-7 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2.5 px-4 py-2 rounded-lg bg-hs-card border text-xs font-medium shadow-xl ${
            toast.error ? 'border-hs-danger/50 text-hs-danger' : 'border-hs-border-strong text-hs-text-muted'
          }`}
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                setToast(null);
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
              }}
              className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500 text-black"
            >
              {t('mealPlannerModal.toast.undoButton')}
            </button>
          )}
        </div>
      )}
    </CRUDModalShell>
  );
}

/**
 * "From Mealie" in the title bar: the one place that says where the plan
 * comes from, and how old it is when Mealie has stopped answering. Opens
 * Mealie's own planner.
 */
function MealieSourcePill({ href, lastUpdated }: { href?: string; lastUpdated: string | null }) {
  const t = useTranslate('editor');
  const body = (
    <>
      <span className="w-4 h-4 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center">
        <CookingPot className="w-2.5 h-2.5" strokeWidth={2.4} aria-hidden />
      </span>
      {t('mealPlannerModal.mealie.fromMealie')}
      {lastUpdated && (
        <span className="text-hs-text-faint">&middot; {t('mealPlannerModal.mealie.lastUpdated', { time: lastUpdated })}</span>
      )}
    </>
  );
  const className = 'inline-flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full bg-hs-card border border-hs-border-strong text-[11.5px] leading-[18px] text-hs-text-body';
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${className} hover:bg-hs-hover`} data-testid="mealie-source-pill">
      {body}
    </a>
  ) : (
    <span className={className} data-testid="mealie-source-pill">{body}</span>
  );
}
