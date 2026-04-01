'use client';

import { useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import MealPlannerModal from '@/components/editor/meal-planner-modal';
import type {
  ModuleInstance,
  MealPlannerView,
  MealSlotType,
  SavedMeal,
  PlannedMeal,
} from '@/types/config';

type Config = {
  view?: MealPlannerView;
  savedMeals?: SavedMeal[];
  plan?: PlannedMeal[];
  previousPlan?: PlannedMeal[];
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

const ALL_SLOTS: { value: MealSlotType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export function MealPlannerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const [showModal, setShowModal] = useState(false);

  const savedMeals = c.savedMeals ?? [];
  const plan = c.plan ?? [];
  const slots = c.slots ?? ['breakfast', 'lunch', 'dinner'];

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
        {ALL_SLOTS.map((s) => (
          <Toggle
            key={s.value}
            label={s.label}
            checked={slots.includes(s.value)}
            onChange={() => toggleSlot(s.value)}
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
        value={c.accentColor ?? '#f59e0b'}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* Open Modal */}
      <div className="pt-1 border-t border-neutral-700 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>{savedMeals.length} saved meals</span>
          <span>&middot;</span>
          <span>{plan.length} planned</span>
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
          savedMeals={savedMeals}
          plan={plan}
          previousPlan={c.previousPlan ?? []}
          slots={slots}
          weekStartDay={c.weekStartDay ?? 'monday'}
          accentColor={c.accentColor ?? '#f59e0b'}
          onUpdate={set}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
