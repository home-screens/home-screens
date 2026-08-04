'use client';

import { useState, useRef } from 'react';
import type { MealSettings, MealSlotType } from '@/types/config';
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

  const toggleSlot = (slot: MealSlotType) => {
    const has = draft.enabledSlots.includes(slot);
    const next = has
      ? draft.enabledSlots.filter((s) => s !== slot)
      : [...draft.enabledSlots, slot];
    if (next.length === 0) return; // require at least one
    setDraft({ ...draft, enabledSlots: next });
  };

  const setDefaultTime = (slot: MealSlotType, time: string | undefined) => {
    const nextTimes = { ...draft.defaultSlotTimes };
    if (time) {
      nextTimes[slot] = time;
    } else {
      delete nextTimes[slot];
    }
    setDraft({ ...draft, defaultSlotTimes: nextTimes });
  };

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
    saving,
    saveError,
    handleSave,
  };
}
