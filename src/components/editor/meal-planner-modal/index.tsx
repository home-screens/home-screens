'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { uuid } from '@/lib/uuid';
import { generateRandomPlan } from '@/lib/meal-shuffle';
import {
  DEFAULT_MEAL_EMOJI,
  toISODate,
  getWeekRange,
  getWeekDatesForRange,
  filterPlanToWeek,
  replaceWeekInPlan,
  copyWeekEntries,
} from '@/lib/meal-constants';
import CRUDModalShell from '@/components/editor/CRUDModalShell';
import SidebarLibrary from './SidebarLibrary';
import SidebarDetail from './SidebarDetail';
import SidebarGrocery from './SidebarGrocery';
import WeekGrid from './WeekGrid';
import MealPickerPopover from './MealPickerPopover';
import type { SavedMeal, PlannedMeal, MealSlotType, MealSettings } from '@/types/config';
import { useTranslate } from '@/i18n';

// ── Props ────────────────────────────────────────────────────

interface MealPlannerModalProps {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  /** Shared meal settings — slots, week start, default times. Comes from data/meals.json. */
  settings: MealSettings;
  accentColor: string;
  onUpdate: (updates: Record<string, unknown>) => void;
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
  // Toast notification
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // ── Week navigation ──

  const [viewingWeekStart, setViewingWeekStart] = useState<Date>(() => {
    const { start } = getWeekRange(new Date(), weekStartDay);
    return new Date(start + 'T12:00:00');
  });

  const viewedWeekDates = useMemo(
    () => getWeekDatesForRange(toISODate(viewingWeekStart), weekStartDay),
    [viewingWeekStart, weekStartDay],
  );

  const todayISO = toISODate(new Date());
  const isCurrentWeek = viewedWeekDates.includes(todayISO);

  // Filter plan to viewed week for grid display
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
    const { start } = getWeekRange(new Date(), weekStartDay);
    setViewingWeekStart(new Date(start + 'T12:00:00'));
  }, [weekStartDay]);

  const showToast = useCallback((message: string, undo?: () => void) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, undo });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  // ── Meal selection ──

  const selectMeal = useCallback((id: string) => {
    setSelectedMealId(id);
    setSidebarTab('detail');
  }, []);

  // Include pending meal in the list passed to children
  const allMeals = pendingMeal ? [...savedMeals, pendingMeal] : savedMeals;

  // ── Meal CRUD ──

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
    if (pendingMeal && updated.id === pendingMeal.id) {
      // First save of a new meal — persist it then return to library
      onUpdate({ savedMeals: [...savedMeals, updated] });
      setPendingMeal(null);
      setSelectedMealId(null);
      setSidebarTab('library');
    } else {
      onUpdate({
        savedMeals: savedMeals.map((m) => (m.id === updated.id ? updated : m)),
      });
    }
    showToast(t('mealPlannerModal.toast.changesSaved'));
  }, [savedMeals, pendingMeal, onUpdate, showToast, t]);

  const deleteMeal = useCallback((id: string) => {
    if (pendingMeal && id === pendingMeal.id) {
      // Discard unsaved new meal
      setPendingMeal(null);
      setSelectedMealId(null);
      setSidebarTab('library');
      return;
    }
    const deletedMeal = savedMeals.find((m) => m.id === id);
    const deletedEntries = plan.filter((p) => p.mealId === id);
    const remainingMeals = savedMeals.filter((m) => m.id !== id);
    const remainingPlan = plan.filter((p) => p.mealId !== id);
    onUpdate({ savedMeals: remainingMeals, plan: remainingPlan });
    setSelectedMealId(null);
    setSidebarTab('library');
    if (deletedMeal) {
      showToast(t('mealPlannerModal.toast.mealDeleted', { name: deletedMeal.name }), () => {
        onUpdate({
          savedMeals: [...remainingMeals, deletedMeal],
          plan: [...remainingPlan, ...deletedEntries],
        });
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
    onUpdate({
      savedMeals: savedMeals.map((m) =>
        m.id === id ? { ...m, isFavorite: !m.isFavorite } : m,
      ),
    });
  }, [savedMeals, pendingMeal, onUpdate]);

  // ── Plan actions (all multi-week safe) ──

  const setSlotMeal = useCallback((date: string, slot: MealSlotType, mealId: string) => {
    const existing = plan.find((p) => p.date === date && p.slot === slot);
    const filtered = plan.filter((p) => !(p.date === date && p.slot === slot));
    // Preserve existing per-instance fields (time, notes, customText) when changing the meal
    const updated: PlannedMeal = { ...(existing ?? {}), date, slot, mealId };
    onUpdate({ plan: [...filtered, updated] });
    setPickerTarget(null);
  }, [plan, onUpdate]);

  const setSlotTime = useCallback((date: string, slot: MealSlotType, time: string | undefined) => {
    const existing = plan.find((p) => p.date === date && p.slot === slot);
    if (!existing) return; // can't set a time on a slot with no meal
    // Treat empty string the same as undefined — a future caller (or a bug in
    // MealTimeChip) that emits `""` must not write an invalid `time: ""` to
    // JSON, where it would fail `isValidTimeString` on the next read.
    const normalized = time ? time : undefined;
    const updated: PlannedMeal = { ...existing };
    if (normalized) {
      updated.time = normalized;
    } else {
      delete updated.time;
    }
    const newPlan = plan.map((p) => (p === existing ? updated : p));
    onUpdate({ plan: newPlan });
  }, [plan, onUpdate]);

  const removeSlotMeal = useCallback((date: string, slot: MealSlotType) => {
    const removed = plan.find((p) => p.date === date && p.slot === slot);
    const newPlan = plan.filter((p) => !(p.date === date && p.slot === slot));
    onUpdate({ plan: newPlan });
    if (removed) {
      showToast(t('mealPlannerModal.toast.mealRemoved'), () => {
        onUpdate({ plan: [...newPlan, removed] });
      });
    }
  }, [plan, onUpdate, showToast, t]);

  const suggestRandom = useCallback(() => {
    if (savedMeals.length === 0) return;
    const newWeek = generateRandomPlan(savedMeals, slots, viewedWeekDates);
    onUpdate({ plan: replaceWeekInPlan(plan, viewedWeekDates, newWeek) });
    showToast(t('mealPlannerModal.toast.randomSuggested'));
  }, [savedMeals, slots, plan, viewedWeekDates, onUpdate, showToast, t]);

  const copyLastWeek = useCallback(() => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevWeekDates = getWeekDatesForRange(toISODate(prevStart), weekStartDay);
    const restamped = copyWeekEntries(plan, prevWeekDates, viewedWeekDates);
    if (restamped.length === 0) return;
    onUpdate({ plan: replaceWeekInPlan(plan, viewedWeekDates, restamped) });
    showToast(t('mealPlannerModal.toast.lastWeekCopied'));
  }, [plan, viewingWeekStart, viewedWeekDates, weekStartDay, onUpdate, showToast, t]);

  const clearWeek = useCallback(() => {
    if (weekPlan.length === 0) return;
    const weekSet = new Set(viewedWeekDates);
    const remaining = plan.filter((p) => !weekSet.has(p.date));
    const snapshot = [...plan];
    onUpdate({ plan: remaining });
    showToast(t('mealPlannerModal.toast.weekCleared'), () => {
      onUpdate({ plan: snapshot });
    });
  }, [plan, weekPlan, viewedWeekDates, onUpdate, showToast, t]);

  // Check if previous week has entries
  const hasPreviousWeekEntries = useMemo(() => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevWeekDates = getWeekDatesForRange(toISODate(prevStart), weekStartDay);
    return filterPlanToWeek(plan, prevWeekDates[0], prevWeekDates[6]).length > 0;
  }, [plan, viewingWeekStart, weekStartDay]);

  // ── Picker ──

  const openPicker = useCallback((date: string, slot: MealSlotType) => {
    setPickerTarget({ date, slot });
  }, []);

  const closePicker = useCallback(() => {
    setPickerTarget(null);
  }, []);

  // ── Grocery check toggle ──

  const toggleGroceryItem = useCallback((key: string) => {
    setGroceryChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Resolve selected meal ──

  const selectedMeal = selectedMealId
    ? allMeals.find((m) => m.id === selectedMealId) ?? null
    : null;

  // ── Render ──

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
          timeFormat={settings.timeFormat ?? '12h'}
          selectedMealId={selectedMealId}
          weekDates={viewedWeekDates}
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
