import { create } from 'zustand';
import { applyMutation, applyHistoryStep } from '@/stores/editor-save';
import { syncEditorUrl } from '@/stores/editor-url';
import { createConfigSlice } from '@/stores/editor-slices/config';
import { createSelectionSlice } from '@/stores/editor-slices/selection';
import { createModuleSlice } from '@/stores/editor-slices/modules';
import { createScreenSlice } from '@/stores/editor-slices/screens';
import { createSettingsSlice } from '@/stores/editor-slices/settings';
import { createProfileSlice } from '@/stores/editor-slices/profiles';
import { createRuleSlice } from '@/stores/editor-slices/rules';
import { createDisplaySlice } from '@/stores/editor-slices/displays';
import { createLayoutSlice } from '@/stores/editor-slices/layout';
import type { EditorState, MutateConfig } from '@/stores/editor-slices/types';

// Re-export pure multi-display helpers so existing consumers that import
// them from `@/stores/editor-store` keep working after the split.
export { getActiveScreens, getActiveDimensions, getActiveRules } from '@/lib/editor-multi-display';

// `orientDimensions` now lives in `@/lib/display-filter` so the server-side
// per-display filter can share it. Re-exported here for existing callers.
export { orientDimensions } from '@/lib/display-filter';

export type { EditorState } from '@/stores/editor-slices/types';

/**
 * The editor store, composed from the slice factories in
 * `editor-slices/`. This file only wires shared machinery: the
 * `mutateConfig` dispatcher every config-mutating action goes through
 * (history bookkeeping lives in `applyMutation`, `editor-save.ts`) and
 * the undo/redo stepper with its URL sync.
 */
export const useEditorStore = create<EditorState>((set, get) => {
  const mutateConfig: MutateConfig = (fn, options) => {
    const next = applyMutation(get(), fn, options);
    if (next) set(next);
  };

  const stepHistory = (direction: 'undo' | 'redo') => {
    const state = get();
    if (!state.config) return;
    const result = applyHistoryStep(state as Parameters<typeof applyHistoryStep>[0], direction);
    if (!result) return;
    set(result.next);
    if (
      result.next.selectedScreenId !== result.previousSelectedScreenId
      || result.next.selectedDisplayId !== result.previousSelectedDisplayId
    ) {
      syncEditorUrl({
        screen: result.next.selectedScreenId ?? null,
        display: result.next.selectedDisplayId ?? null,
      });
    }
  };

  return {
    config: null,
    selectedDisplayId: null,
    selectedScreenId: null,
    selectedModuleId: null,
    isDirty: false,
    isSaving: false,
    saveError: null,
    _pendingResave: null,
    snapEnabled: true,
    _past: [],
    _future: [],
    _lastHistoryTime: 0,
    _lastHistoryActionKey: '',

    ...createConfigSlice(set, get),
    ...createSelectionSlice(set, get),
    ...createModuleSlice(get, mutateConfig),
    ...createScreenSlice(get, mutateConfig),
    ...createSettingsSlice(mutateConfig),
    ...createProfileSlice(get, mutateConfig),
    ...createRuleSlice(get, mutateConfig),
    ...createDisplaySlice(get, mutateConfig),
    ...createLayoutSlice(get, mutateConfig),

    undo: () => stepHistory('undo'),
    redo: () => stepHistory('redo'),
  };
});
