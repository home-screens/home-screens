'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { uuid } from '@/lib/uuid';
import { generateRandomPlan } from '@/lib/meal-shuffle';
import { DEFAULT_MEAL_EMOJI } from '@/lib/meal-constants';
import CRUDModalShell from '@/components/editor/CRUDModalShell';
import SidebarLibrary from './SidebarLibrary';
import SidebarDetail from './SidebarDetail';
import SidebarGrocery from './SidebarGrocery';
import WeekGrid from './WeekGrid';
import MealPickerPopover from './MealPickerPopover';
import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';

// ── Props ────────────────────────────────────────────────────

interface MealPlannerModalProps {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  previousPlan?: PlannedMeal[];
  slots: MealSlotType[];
  weekStartDay: 'sunday' | 'monday';
  accentColor: string;
  onUpdate: (updates: Record<string, unknown>) => void;
  onClose: () => void;
}

type SidebarTab = 'library' | 'detail' | 'grocery';

const TAB_LABELS: Record<SidebarTab, string> = {
  library: 'Library',
  detail: 'Detail',
  grocery: 'Grocery',
};

// ── Component ────────────────────────────────────────────────

export default function MealPlannerModal({
  savedMeals,
  plan,
  previousPlan = [],
  slots,
  weekStartDay,
  accentColor,
  onUpdate,
  onClose,
}: MealPlannerModalProps) {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('library');
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{ day: number; slot: MealSlotType } | null>(null);
  // Pending new meal: created locally, only persisted when user saves from Detail tab
  const [pendingMeal, setPendingMeal] = useState<SavedMeal | null>(null);
  // Grocery checked state lives here so it survives tab switches
  const [groceryChecked, setGroceryChecked] = useState<Set<string>>(() => new Set());
  // Toast notification
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

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
      name: 'New Meal',
      emoji: DEFAULT_MEAL_EMOJI,
    };
    // Don't persist yet — keep it local until the user saves
    setPendingMeal(newMeal);
    setSelectedMealId(id);
    setSidebarTab('detail');
  }, []);

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
    showToast('Changes saved');
  }, [savedMeals, pendingMeal, onUpdate, showToast]);

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
      showToast(`"${deletedMeal.name}" deleted`, () => {
        onUpdate({
          savedMeals: [...remainingMeals, deletedMeal],
          plan: [...remainingPlan, ...deletedEntries],
        });
        setSelectedMealId(deletedMeal.id);
        setSidebarTab('detail');
      });
    }
  }, [savedMeals, plan, pendingMeal, onUpdate, showToast]);

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

  // ── Plan actions ──

  const setSlotMeal = useCallback((day: number, slot: MealSlotType, mealId: string) => {
    const filtered = plan.filter((p) => !(p.day === day && p.slot === slot));
    onUpdate({ plan: [...filtered, { day, slot, mealId }] });
    setPickerTarget(null);
  }, [plan, onUpdate]);

  const removeSlotMeal = useCallback((day: number, slot: MealSlotType) => {
    const removed = plan.find((p) => p.day === day && p.slot === slot);
    const newPlan = plan.filter((p) => !(p.day === day && p.slot === slot));
    onUpdate({ plan: newPlan });
    if (removed) {
      showToast('Meal removed', () => {
        onUpdate({ plan: [...newPlan, removed] });
      });
    }
  }, [plan, onUpdate, showToast]);

  const suggestRandom = useCallback(() => {
    if (savedMeals.length === 0) return;
    const newPlan = generateRandomPlan(savedMeals, slots);
    // Snapshot current plan before replacing
    onUpdate({ previousPlan: [...plan], plan: newPlan });
    showToast('Random meals suggested!');
  }, [savedMeals, slots, plan, onUpdate, showToast]);

  const copyLastWeek = useCallback(() => {
    if (previousPlan.length === 0) return;
    // Restore previous plan without overwriting previousPlan itself
    onUpdate({ plan: [...previousPlan] });
    showToast('Last week copied!');
  }, [previousPlan, onUpdate, showToast]);

  const clearWeek = useCallback(() => {
    if (plan.length === 0) return;
    const snapshot = [...plan];
    onUpdate({ previousPlan: snapshot, plan: [] });
    showToast('Week cleared', () => {
      onUpdate({ plan: snapshot });
    });
  }, [plan, onUpdate, showToast]);

  // ── Picker ──

  const openPicker = useCallback((day: number, slot: MealSlotType) => {
    setPickerTarget({ day, slot });
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
      title="Meal Planner"
      icon={<span className="text-lg">&#127869;</span>}
      subtitle={`${savedMeals.length} meals \u00b7 ${plan.length} planned`}
      maxWidth="max-w-[1340px]"
      headerActions={
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-xs font-semibold rounded bg-amber-500 text-black hover:bg-amber-400 transition"
        >
          Done
        </button>
      }
      hideFooter
      onClose={onClose}
    >
      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar ── */}
        <div className="w-[400px] border-r border-neutral-700 flex flex-col shrink-0 bg-neutral-950">
          {/* Tab bar */}
          <div className="flex border-b border-neutral-700">
            {(['library', 'detail', 'grocery'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
                  sidebarTab === tab
                    ? 'text-amber-500 border-amber-500'
                    : 'text-neutral-500 border-transparent hover:text-neutral-400'
                }`}
              >
                {TAB_LABELS[tab]}
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
              plan={plan}
              meals={savedMeals}
              checkedItems={groceryChecked}
              onToggleItem={toggleGroceryItem}
            />
          )}
        </div>

        {/* ── Week Grid ── */}
        <WeekGrid
          plan={plan}
          savedMeals={savedMeals}
          slots={slots}
          weekStartDay={weekStartDay}
          accentColor={accentColor}
          selectedMealId={selectedMealId}
          onSelectMeal={selectMeal}
          onRemoveMeal={removeSlotMeal}
          onEmptyCellClick={openPicker}
          onSuggestRandom={suggestRandom}
          onCopyLastWeek={copyLastWeek}
          hasPreviousPlan={previousPlan.length > 0}
          onClearWeek={clearWeek}
        />
      </div>

      {/* ── Meal Picker Popover ── */}
      {pickerTarget && (
        <MealPickerPopover
          target={pickerTarget}
          meals={savedMeals}
          onSelect={(mealId) => setSlotMeal(pickerTarget.day, pickerTarget.slot, mealId)}
          onClose={closePicker}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2.5 px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-400 text-xs font-medium shadow-xl">
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
              Undo
            </button>
          )}
        </div>
      )}
    </CRUDModalShell>
  );
}
