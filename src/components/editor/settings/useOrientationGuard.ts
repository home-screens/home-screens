'use client';

import { useCallback, useState } from 'react';
import { useEditorStore, getActiveScreens, getActiveDimensions } from '@/stores/editor-store';
import { countOffCanvasModules, totalModuleCount } from '@/lib/module-utils';
import type { DisplayState } from '@/lib/settings-form';
import type { UpdateSettingsGroup } from '@/hooks/useSettingsAutosave';

interface OrientationPrompt {
  offCanvasCount: number;
  totalCount: number;
  oldWidth: number;
  oldHeight: number;
  newWidth: number;
  newHeight: number;
  pendingUpdates: Partial<DisplayState>;
}

interface UseOrientationGuardParams {
  /** Current display form values — the "before" side of a dimension edit. */
  displayValues: DisplayState;
  /** Form-state writer from `useSettingsAutosave`. */
  updateGroup: UpdateSettingsGroup;
}

interface UseOrientationGuardReturn {
  /** Drop-in replacement for `updateGroup('display', …)` that guards shrinks. */
  onDisplayChange: (updates: Partial<DisplayState>) => void;
  /** Non-null while the confirm modal should be showing. */
  prompt: OrientationPrompt | null;
  dismiss: () => void;
  switchAnyway: () => void;
  scaleToFit: () => void;
}

/**
 * Guards canvas-shrinking dimension edits behind the orientation-change
 * confirm modal. A dimension change that would push modules off-canvas is
 * held as a `prompt` until the user picks switch-anyway or scale-to-fit;
 * every other edit applies straight through.
 */
export function useOrientationGuard({
  displayValues,
  updateGroup,
}: UseOrientationGuardParams): UseOrientationGuardReturn {
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const scaleAllModules = useEditorStore((s) => s.scaleAllModules);

  const [prompt, setPrompt] = useState<OrientationPrompt | null>(null);

  const onDisplayChange = useCallback((updates: Partial<DisplayState>) => {
    const newW = updates.displayWidth ?? displayValues.displayWidth;
    const newH = updates.displayHeight ?? displayValues.displayHeight;
    const shrunk = newW < displayValues.displayWidth || newH < displayValues.displayHeight;

    if (!shrunk || !config) {
      updateGroup('display', updates);
      return;
    }

    // In multi-display mode, the Display tab's dimension fields edit the
    // GLOBAL settings, but module layout lives inside the currently-active
    // display's own `screens`. Count off-canvas modules and source the
    // "oldWidth/oldHeight" for scaleAllModules from that same active view
    // so the confirm modal and the actual scale op stay consistent.
    const activeScreens = getActiveScreens(config, selectedDisplayId);
    const activeDims = getActiveDimensions(config, selectedDisplayId);
    const offCanvas = countOffCanvasModules(activeScreens, newW, newH);

    if (offCanvas === 0) {
      updateGroup('display', updates);
      return;
    }

    setPrompt({
      offCanvasCount: offCanvas,
      totalCount: totalModuleCount(activeScreens),
      // Use saved active-display dimensions — modules are laid out against
      // those, not unsaved form state or the global fallback.
      oldWidth: activeDims.width,
      oldHeight: activeDims.height,
      newWidth: newW,
      newHeight: newH,
      pendingUpdates: updates,
    });
  }, [displayValues.displayWidth, displayValues.displayHeight, config, selectedDisplayId, updateGroup]);

  const dismiss = () => setPrompt(null);

  const switchAnyway = () => {
    if (!prompt) return;
    updateGroup('display', prompt.pendingUpdates);
    setPrompt(null);
  };

  const scaleToFit = () => {
    if (!prompt) return;
    updateGroup('display', prompt.pendingUpdates);
    scaleAllModules(prompt.oldWidth, prompt.oldHeight, prompt.newWidth, prompt.newHeight);
    setPrompt(null);
  };

  return { onDisplayChange, prompt, dismiss, switchAnyway, scaleToFit };
}
