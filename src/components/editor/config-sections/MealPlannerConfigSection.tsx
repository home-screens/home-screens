'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import MealPlannerModal from '@/components/editor/meal-planner-modal';
import { SLOT_ORDER, SLOT_META, DEFAULT_ACCENT_COLOR, DEFAULT_SLOTS, toISODate } from '@/lib/meal-constants';
import { displayCache } from '@/lib/display-cache';
import type {
  ModuleInstance,
  MealPlannerView,
  MealSlotType,
  SavedMeal,
  PlannedMeal,
} from '@/types/config';

type Config = {
  view?: MealPlannerView;
  slots?: MealSlotType[];
  weekStartDay?: 'sunday' | 'monday';
  showEmoji?: boolean;
  showPrepTime?: boolean;
  showTags?: boolean;
  accentColor?: string;
};

const VIEWS: { value: MealPlannerView; label: string }[] = [
  { value: 'week', label: 'Week Grid' },
  { value: 'today', label: "Today's Meals" },
  { value: 'next-meal', label: 'Next Meal (Hero)' },
  { value: 'compact', label: 'Compact (Today + Tomorrow)' },
  { value: 'list', label: 'Full Week List' },
];

export function MealPlannerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const [showModal, setShowModal] = useState(false);
  const [mealData, setMealData] = useState<{ savedMeals: SavedMeal[]; plan: PlannedMeal[] }>({ savedMeals: [], plan: [] });

  const fetchMealData = useCallback(() => {
    fetch('/api/meals/data')
      .then((r) => r.json())
      .then((d) => setMealData({
        savedMeals: d.savedMeals ?? [],
        plan: d.plan ?? [],
      }))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchMealData(); }, [fetchMealData, showModal]);

  // Ref for stable closure in handleModalUpdate
  const mealDataRef = useRef(mealData);
  mealDataRef.current = mealData;

  // One-time migration: if existing config has embedded savedMeals/plan, push to API
  useEffect(() => {
    const raw = mod.config as Record<string, unknown>;
    const embeddedMeals = raw?.savedMeals;
    const embeddedPlan = raw?.plan;
    if (Array.isArray(embeddedMeals) && embeddedMeals.length > 0) {
      // Normalize legacy day-based plan entries to date-based before pushing
      const rawPlan = Array.isArray(embeddedPlan) ? embeddedPlan : [];
      const now = new Date();
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - now.getDay());
      const normalizedPlan = rawPlan.map((e: Record<string, unknown>) => {
        if (typeof e.date === 'string') return e;
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + (typeof e.day === 'number' ? e.day : 0));
        const { day: _day, ...rest } = e;
        return { ...rest, date: toISODate(d) };
      });
      // Merge with existing API data (a fullscreen module may already have data there)
      fetch('/api/meals/data')
        .then((r) => r.json())
        .then((existing) => {
          const existingMeals: SavedMeal[] = existing.savedMeals ?? [];
          const existingIds = new Set(existingMeals.map((m: SavedMeal) => m.id));
          const mergedMeals = [
            ...existingMeals,
            ...(embeddedMeals as SavedMeal[]).filter((m: SavedMeal) => !existingIds.has(m.id)),
          ];
          const mergedPlan = [...(existing.plan ?? []), ...normalizedPlan];
          return fetch('/api/meals/data', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ savedMeals: mergedMeals, plan: mergedPlan }),
          });
        })
        .then(() => {
          // Clear embedded data from config — keep only display preferences
          set({ savedMeals: undefined, plan: undefined, previousPlan: undefined } as unknown as Config);
          displayCache.invalidate('/api/meals/data');
          fetchMealData();
        }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModalUpdate = useCallback(async (updates: Record<string, unknown>) => {
    const current = mealDataRef.current;
    const optimistic = {
      savedMeals: (updates.savedMeals as SavedMeal[]) ?? current.savedMeals,
      plan: (updates.plan as PlannedMeal[]) ?? current.plan,
    };
    setMealData(optimistic);
    try {
      const res = await fetch('/api/meals/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(optimistic),
      });
      if (res.ok) {
        const data = await res.json();
        setMealData({ savedMeals: data.savedMeals, plan: data.plan });
      }
      displayCache.invalidate('/api/meals/data');
    } catch {}
  }, []);

  const slots = c.slots ?? [...DEFAULT_SLOTS];

  const toggleSlot = (slot: MealSlotType) => {
    const has = slots.includes(slot);
    const next = has ? slots.filter((s) => s !== slot) : [...slots, slot];
    if (next.length > 0) set({ slots: next });
  };

  return (
    <>
      {/* View Mode */}
      <ViewSelect
        value={c.view ?? 'week'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Meal Slots */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Meal Slots</span>
        {SLOT_ORDER.map((slot) => (
          <Toggle
            key={slot}
            label={SLOT_META[slot].label}
            checked={slots.includes(slot)}
            onChange={() => toggleSlot(slot)}
          />
        ))}
      </div>

      {/* Week Start */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">Week Starts On</span>
        <select
          value={c.weekStartDay ?? 'monday'}
          onChange={(e) => set({ weekStartDay: e.target.value as 'sunday' | 'monday' })}
          className={INPUT_CLASS}
        >
          <option value="sunday">Sunday</option>
          <option value="monday">Monday</option>
        </select>
      </label>

      {/* Display Toggles */}
      <Toggle
        label="Show Emoji"
        checked={c.showEmoji ?? true}
        onChange={(v) => set({ showEmoji: v })}
      />
      <Toggle
        label="Show Prep Time"
        checked={c.showPrepTime ?? true}
        onChange={(v) => set({ showPrepTime: v })}
      />
      <Toggle
        label="Show Tags"
        checked={c.showTags ?? true}
        onChange={(v) => set({ showTags: v })}
      />

      {/* Accent Color */}
      <ColorPicker
        label="Accent Color"
        value={c.accentColor ?? DEFAULT_ACCENT_COLOR}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* Open Modal */}
      <div className="pt-1 border-t border-neutral-700 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>{mealData.savedMeals.length} saved meals</span>
          <span>&middot;</span>
          <span>{mealData.plan.length} planned</span>
        </div>
        <Button
          variant="primary"
          className="w-full text-xs"
          onClick={() => setShowModal(true)}
        >
          Edit Meal Plan
        </Button>
      </div>

      {/* Modal */}
      {showModal && (
        <MealPlannerModal
          savedMeals={mealData.savedMeals}
          plan={mealData.plan}
          slots={slots}
          weekStartDay={c.weekStartDay ?? 'monday'}
          accentColor={c.accentColor ?? DEFAULT_ACCENT_COLOR}
          onUpdate={handleModalUpdate}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
