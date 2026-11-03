'use client';

import { useCallback, useState } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveScreens, getActiveDimensions } from '@/lib/editor-multi-display';
import { modulesCutOffByResize, totalModuleCount } from '@/lib/module-utils';
import type { DisplayState } from '@/lib/settings-form';
import type { UpdateSettingsGroup } from '@/hooks/useSettingsAutosave';

interface CanvasSize {
  width: number;
  height: number;
}

interface CanvasResize {
  /** The canvas before the edit, which decides whether it shrinks. */
  from: CanvasSize;
  /** The canvas the edit would leave. */
  to: CanvasSize;
  /** Writes the edit. Runs at once, or after Switch Anyway / Scale to Fit. */
  apply: () => void;
  /** Runs when the user backs out of the prompt instead. */
  revert?: () => void;
}

interface OrientationPrompt {
  offCanvasCount: number;
  totalCount: number;
  oldWidth: number;
  oldHeight: number;
  newWidth: number;
  newHeight: number;
  pending: CanvasResize;
}

interface UseCanvasResizeGuardReturn {
  /** Applies `resize`, or holds it as `prompt` when it would cut modules off. */
  guardResize: (resize: CanvasResize) => void;
  /** Non-null while the confirm modal should be showing. */
  prompt: OrientationPrompt | null;
  dismiss: () => void;
  switchAnyway: () => void;
  scaleToFit: () => void;
}

/**
 * Guards canvas-shrinking resizes of one display behind the orientation-change
 * confirm modal. A resize that would push modules of that display's screens
 * off the canvas is held as a `prompt` until the user picks switch-anyway or
 * scale-to-fit; every other edit applies straight through. `displayId` is the
 * display whose screens are laid out on the canvas (null for the
 * single-display screens), so a rotation on one display's own settings page
 * counts and scales that display's modules, not the editor's selected one.
 */
export function useCanvasResizeGuard(displayId: string | null): UseCanvasResizeGuardReturn {
  const config = useEditorStore((s) => s.config);
  const scaleAllModules = useEditorStore((s) => s.scaleAllModules);

  const [prompt, setPrompt] = useState<OrientationPrompt | null>(null);

  const guardResize = useCallback((resize: CanvasResize) => {
    const screens = config ? getActiveScreens(config, displayId) : [];
    const offCanvas = modulesCutOffByResize(screens, resize.from, resize.to);

    if (!config || offCanvas === 0) {
      resize.apply();
      return;
    }

    // Modules are laid out against the display's saved canvas, not unsaved
    // form state or the global fallback, so that is what scaling starts from.
    const saved = getActiveDimensions(config, displayId);
    setPrompt({
      offCanvasCount: offCanvas,
      totalCount: totalModuleCount(screens),
      oldWidth: saved.width,
      oldHeight: saved.height,
      newWidth: resize.to.width,
      newHeight: resize.to.height,
      pending: resize,
    });
  }, [config, displayId]);

  const dismiss = () => {
    prompt?.pending.revert?.();
    setPrompt(null);
  };

  const switchAnyway = () => {
    if (!prompt) return;
    prompt.pending.apply();
    setPrompt(null);
  };

  // Scaled first, so an `apply` that saves straight away saves the scaled
  // modules along with the new canvas.
  const scaleToFit = () => {
    if (!prompt) return;
    scaleAllModules(displayId, prompt.oldWidth, prompt.oldHeight, prompt.newWidth, prompt.newHeight);
    prompt.pending.apply();
    setPrompt(null);
  };

  return { guardResize, prompt, dismiss, switchAnyway, scaleToFit };
}

interface UseOrientationGuardParams {
  /** Current display form values: the "before" side of a dimension edit. */
  displayValues: DisplayState;
  /** Form-state writer from `useSettingsAutosave`. */
  updateGroup: UpdateSettingsGroup;
}

/**
 * The resize guard for the Defaults Screen page, whose dimension fields write
 * form state that autosaves. In multi-display mode those fields edit the
 * GLOBAL settings while module layout lives in the selected display's own
 * `screens`, so the guard counts and scales the selected display.
 */
export function useOrientationGuard({ displayValues, updateGroup }: UseOrientationGuardParams) {
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const { guardResize, ...rest } = useCanvasResizeGuard(selectedDisplayId);

  /** Drop-in replacement for `updateGroup('display', …)` that guards shrinks. */
  const onDisplayChange = useCallback((updates: Partial<DisplayState>) => {
    guardResize({
      from: { width: displayValues.displayWidth, height: displayValues.displayHeight },
      to: {
        width: updates.displayWidth ?? displayValues.displayWidth,
        height: updates.displayHeight ?? displayValues.displayHeight,
      },
      apply: () => updateGroup('display', updates),
    });
  }, [displayValues.displayWidth, displayValues.displayHeight, guardResize, updateGroup]);

  return { onDisplayChange, ...rest };
}
