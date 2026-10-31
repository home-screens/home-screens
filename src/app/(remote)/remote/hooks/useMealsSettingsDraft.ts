'use client';

import { useState, useRef } from 'react';
import type { MealPlanSource, MealSettings, MealSlotType, TimeFormat, WeekStartDay } from '@/types/config';
import {
  toggleMealSlot,
  setMealSlotDefaultTime,
  setMealWeekStart,
  setMealTimeFormat,
  setMealPlanSource,
} from '@/lib/meal-settings';
import { useTranslate } from '@/i18n';

/**
 * Draft + save state for the meal-planner settings sheet.
 *
 * `onSave` returns true on success, false on failure. On failure the sheet
 * stays open with an inline error so the user can retry; the caller is
 * responsible for reverting its own optimistic state.
 */
export function useMealsSettingsDraft(
  settings: MealSettings,
  onSave: (next: MealSettings) => Promise<boolean>,
  onClose: () => void,
) {
  const t = useTranslate('remote');

  // Local working copy so the user can cancel without persisting partial edits.
  // Sync draft ONLY on mount (not on every settings prop change) — otherwise a
  // parent optimistic update during an in-flight save would silently overwrite
  // the user's in-progress edits while the sheet is open.
  const initialSettingsRef = useRef(settings);
  const [draft, setDraft] = useState<MealSettings>(() => initialSettingsRef.current);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The edit rules are shared with the editor's Settings > Meals page; only the
  // draft-then-Save behaviour around them is this sheet's own.
  const toggleSlot = (slot: MealSlotType) => setDraft(toggleMealSlot(draft, slot));

  const setDefaultTime = (slot: MealSlotType, time: string | undefined) =>
    setDraft(setMealSlotDefaultTime(draft, slot, time));

  const setWeekStartDay = (day: WeekStartDay) => setDraft(setMealWeekStart(draft, day));

  const setTimeFormat = (fmt: TimeFormat | undefined) => setDraft(setMealTimeFormat(draft, fmt));

  const setPlanSource = (source: MealPlanSource | undefined) => setDraft(setMealPlanSource(draft, source));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const ok = await onSave(draft);
      if (ok) {
        onClose();
      } else {
        setSaveError(t('mealsSettings.save.saveFailed'));
      }
    } catch {
      setSaveError(t('mealsSettings.save.networkError'));
    } finally {
      setSaving(false);
    }
  };

  return {
    draft,
    setDraft,
    toggleSlot,
    setDefaultTime,
    setWeekStartDay,
    setTimeFormat,
    setPlanSource,
    saving,
    saveError,
    handleSave,
  };
}
