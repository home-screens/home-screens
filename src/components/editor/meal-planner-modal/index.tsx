'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
} from '@/lib/meal-constants';
import {
  assignPlanSlot,
  clearPlanSlot,
  setPlanSlotTime,
  clearPlanWeek,
  shufflePlanWeek,
  copyPlanWeek,
  upsertSavedMeal,
  removeSavedMeal,
  toggleSavedMealFavorite,
  restorePlanEntries,
} from '@/lib/meal-plan-actions';
import { useEditorStore } from '@/stores/editor-store';
import { useEditorHouseholdToday } from '@/components/editor/useEditorHouseholdClock';
import CRUDModalShell from '@/components/editor/CRUDModalShell';
import SidebarLibrary from './SidebarLibrary';
import SidebarDetail from './SidebarDetail';
import SidebarGrocery from './SidebarGrocery';
import WeekGrid from './WeekGrid';
import MealPickerPopover from './MealPickerPopover';
import type { SavedMeal, PlannedMeal, MealSlotType, MealSettings } from '@/types/config';
import type { MealEdit } from '@/lib/meal-client';
import { useTranslate } from '@/i18n';
import { useHouseholdTimeFormat } from '@/hooks/useHouseholdTimeFormat';

// ── Props ────────────────────────────────────────────────────

interface MealPlannerModalProps {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  /** Shared meal settings — slots, week start, default times. Comes from data/meals.json. */
  settings: MealSettings;
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
}

type SidebarTab = 'library' | 'detail' | 'grocery';

// ── Component ────────────────────────────────────────────────

export default function MealPlannerModal({
  savedMeals,
  plan,
  settings,
  accentColor,
  onUpdate,
  onClose,
}: MealPlannerModalProps) {
  const t = useTranslate('editor');
  // Household GlobalSettings.timeFormat — resolves the effective format when
  // the shared meal settings carry no explicit override.
  const globalTf = useHouseholdTimeFormat(useEditorStore((s) => s.config?.settings?.timeFormat));
  const tabLabelMap = useMemo<Record<SidebarTab, string>>(
    () => ({
      library: t('mealPlannerModal.tabs.library'),
      detail: t('mealPlannerModal.tabs.detail'),
      grocery: t('mealPlannerModal.tabs.grocery'),
    }),
    [t],
  );
  const slots = settings.enabledSlots;
  const weekStartDay = settings.weekStartDay;
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('library');
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{ date: string; slot: MealSlotType } | null>(null);
  // Pending new meal: created locally, only persisted when user saves from Detail tab
  const [pendingMeal, setPendingMeal] = useState<SavedMeal | null>(null);
  // Grocery checked state lives here so it survives tab switches
  const [groceryChecked, setGroceryChecked] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // The household's day, not the laptop's: the wall is already on next week
  // from the household's midnight, whatever zone this laptop is in.
  const todayISO = useEditorHouseholdToday();

  const [viewingWeekStart, setViewingWeekStart] = useState<Date>(() => {
    const { start } = getWeekRange(fromISODate(todayISO), weekStartDay);
    return new Date(start + 'T12:00:00');
  });
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

  const weekPlan = useMemo(
    () => filterPlanToWeek(plan, viewedWeekDates[0], viewedWeekDates[6]),
    [plan, viewedWeekDates],
  );

  const navigateWeek = useCallback((direction: -1 | 1) => {
    setViewingWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + direction * 7);
      return next;
    });
  }, []);

  const jumpToToday = useCallback(() => {
    const { start } = getWeekRange(fromISODate(todayISO), weekStartDay);
    setViewingWeekStart(new Date(start + 'T12:00:00'));
  }, [todayISO, weekStartDay]);

  const showToast = useCallback((message: string, undo?: () => void) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, undo });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  const selectMeal = useCallback((id: string) => {
    setSelectedMealId(id);
    setSidebarTab('detail');
  }, []);

  // Include pending meal in the list passed to children
  const allMeals = pendingMeal ? [...savedMeals, pendingMeal] : savedMeals;

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
    const deletedEntries = plan.filter((p) => p.mealId === id);
    onUpdate((c) => removeSavedMeal(c.savedMeals, c.plan, id));
    setSelectedMealId(null);
    setSidebarTab('library');
    if (deletedMeal) {
      showToast(t('mealPlannerModal.toast.mealDeleted', { name: deletedMeal.name }), () => {
        // Put the meal and its slots back on top of whatever is planned now.
        onUpdate((c) => ({
          savedMeals: upsertSavedMeal(c.savedMeals, deletedMeal),
          plan: restorePlanEntries(c.plan, deletedEntries),
        }));
        setSelectedMealId(deletedMeal.id);
        setSidebarTab('detail');
      });
    }
  }, [savedMeals, plan, pendingMeal, onUpdate, showToast, t]);

  const toggleFavorite = useCallback((id: string) => {
    if (pendingMeal && id === pendingMeal.id) {
      setPendingMeal({ ...pendingMeal, isFavorite: !pendingMeal.isFavorite });
      return;
    }
    onUpdate((c) => ({ savedMeals: toggleSavedMealFavorite(c.savedMeals, id) }));
  }, [pendingMeal, onUpdate]);

  const setSlotMeal = useCallback((date: string, slot: MealSlotType, mealId: string) => {
    onUpdate((c) => ({ plan: assignPlanSlot(c.plan, date, slot, mealId) }));
    setPickerTarget(null);
  }, [onUpdate]);

  const setSlotTime = useCallback((date: string, slot: MealSlotType, time: string | undefined) => {
    if (setPlanSlotTime(plan, date, slot, time) === plan) return; // no meal in that slot, so no time to set
    onUpdate((c) => ({ plan: setPlanSlotTime(c.plan, date, slot, time) }));
  }, [plan, onUpdate]);

  const removeSlotMeal = useCallback((date: string, slot: MealSlotType) => {
    const removed = plan.find((p) => p.date === date && p.slot === slot);
    onUpdate((c) => ({ plan: clearPlanSlot(c.plan, date, slot) }));
    if (removed) {
      showToast(t('mealPlannerModal.toast.mealRemoved'), () => {
        onUpdate((c) => ({ plan: restorePlanEntries(c.plan, [removed]) }));
      });
    }
  }, [plan, onUpdate, showToast, t]);

  const suggestRandom = useCallback(() => {
    if (savedMeals.length === 0) return;
    onUpdate((c) => ({ plan: shufflePlanWeek(c.plan, c.savedMeals, slots, viewedWeekDates) }));
    showToast(t('mealPlannerModal.toast.randomSuggested'));
  }, [savedMeals, slots, viewedWeekDates, onUpdate, showToast, t]);

  const copyLastWeek = useCallback(() => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevWeekDates = getWeekDatesForRange(toISODate(prevStart), weekStartDay);
    if (copyPlanWeek(plan, prevWeekDates, viewedWeekDates) === plan) return; // nothing planned last week
    onUpdate((c) => ({ plan: copyPlanWeek(c.plan, prevWeekDates, viewedWeekDates) }));
    showToast(t('mealPlannerModal.toast.lastWeekCopied'));
  }, [plan, viewingWeekStart, viewedWeekDates, weekStartDay, onUpdate, showToast, t]);

  const clearWeek = useCallback(() => {
    if (weekPlan.length === 0) return;
    const cleared = [...weekPlan];
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

  const openPicker = useCallback((date: string, slot: MealSlotType) => {
    setPickerTarget({ date, slot });
  }, []);

  const closePicker = useCallback(() => {
    setPickerTarget(null);
  }, []);

  const toggleGroceryItem = useCallback((key: string) => {
    setGroceryChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectedMeal = selectedMealId
    ? allMeals.find((m) => m.id === selectedMealId) ?? null
    : null;

  return (
    <CRUDModalShell
      title={t('mealPlannerModal.title')}
      icon={<span className="text-lg">&#127869;</span>}
      subtitle={t('mealPlannerModal.subtitleMealsPlanned', { meals: savedMeals.length, planned: plan.length })}
      maxWidth="max-w-[1340px]"
      headerActions={
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-xs font-semibold rounded bg-amber-500 text-black hover:bg-amber-400 transition"
        >
          {t('mealPlannerModal.doneButton')}
        </button>
      }
      hideFooter
      onClose={onClose}
    >
      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar ── */}
        <div className="w-[400px] border-r border-hs-border-strong flex flex-col shrink-0 bg-hs-body">
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
          {sidebarTab === 'library' && (
            <SidebarLibrary
              meals={allMeals}
              selectedMealId={selectedMealId}
              onSelectMeal={selectMeal}
              onToggleFavorite={toggleFavorite}
              onAddMeal={addMeal}
            />
          )}
          {sidebarTab === 'detail' && (
            <SidebarDetail
              meal={selectedMeal}
              onSave={saveMeal}
              onDelete={deleteMeal}
              onToggleFavorite={toggleFavorite}
            />
          )}
          {sidebarTab === 'grocery' && (
            <SidebarGrocery
              plan={weekPlan}
              meals={savedMeals}
              checkedItems={groceryChecked}
              onToggleItem={toggleGroceryItem}
            />
          )}
        </div>

        {/* ── Week Grid ── */}
        <WeekGrid
          plan={weekPlan}
          savedMeals={savedMeals}
          slots={slots}
          accentColor={accentColor}
          timeFormat={resolveMealTimeFormat(settings, globalTf)}
          selectedMealId={selectedMealId}
          weekDates={viewedWeekDates}
          todayISO={todayISO}
          isCurrentWeek={isCurrentWeek}
          onSelectMeal={selectMeal}
          onRemoveMeal={removeSlotMeal}
          onEmptyCellClick={openPicker}
          onSetSlotTime={setSlotTime}
          onSuggestRandom={suggestRandom}
          onCopyLastWeek={copyLastWeek}
          hasPreviousWeek={hasPreviousWeekEntries}
          onClearWeek={clearWeek}
          onNavigateWeek={navigateWeek}
          onJumpToToday={jumpToToday}
        />
      </div>

      {/* ── Meal Picker Popover ── */}
      {pickerTarget && (
        <MealPickerPopover
          target={pickerTarget}
          meals={savedMeals}
          onSelect={(mealId) => setSlotMeal(pickerTarget.date, pickerTarget.slot, mealId)}
          onClose={closePicker}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2.5 px-4 py-2 rounded-lg bg-hs-card border border-hs-border-strong text-hs-text-muted text-xs font-medium shadow-xl">
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
