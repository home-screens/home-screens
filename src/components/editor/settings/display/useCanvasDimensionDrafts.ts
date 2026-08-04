'use client';

import { useState } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { MAX_DISPLAY_DIMENSION, orientDimensions } from '@/lib/display-filter';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import type { DisplayNode, GlobalSettings } from '@/types/config';

/**
 * Canvas dimension editing for one display: a local working copy of the
 * width/height inputs plus the commit and rotation handlers that write
 * through to the store.
 *
 * The drafts exist so the user can type freely without every keystroke
 * hitting the store. We commit on blur or Enter to keep partial input
 * states (e.g. "10" while the user types "1080") from resizing the canvas
 * mid-edit.
 *
 * Every mutation handler awaits `saveConfig()` after updating the store.
 * Without this the per-display Display subtab was a non-persisting editor:
 * the mutation landed in the Zustand store (making the UI reflect the
 * change immediately) but never flushed to `data/config.json`, so a page
 * reload reverted every override. The parent settings page has no global
 * Save button for per-display drill-downs — each subtab is self-saving by
 * contract.
 */
export function useCanvasDimensionDrafts(display: DisplayNode, settings: GlobalSettings) {
  // Selector-scoped: an unscoped `useEditorStore()` re-renders the card on
  // every store write (including each save's isSaving flip) while the user
  // is mid-edit in the width/height inputs.
  const updateDisplay = useEditorStore((s) => s.updateDisplay);
  const saveConfig = useEditorStore((s) => s.saveConfig);

  const [widthDraft, setWidthDraft] = useState<string>(
    String(display.displayWidth ?? settings.displayWidth ?? DEFAULT_DISPLAY_WIDTH),
  );
  const [heightDraft, setHeightDraft] = useState<string>(
    String(display.displayHeight ?? settings.displayHeight ?? DEFAULT_DISPLAY_HEIGHT),
  );

  // On blur / Enter, commit the parsed draft back to the store if it's
  // a valid positive integer within the MAX_DISPLAY_DIMENSION cap. Invalid or
  // empty input snaps the visible draft back to the last committed value
  // rather than silently discarding the edit — without this, clearing
  // the field leaves the input blank while the store still holds the
  // old value, which looks like a UI bug to the user.
  const commitWidth = async () => {
    const n = parseInt(widthDraft, 10);
    const current = display.displayWidth ?? settings.displayWidth ?? DEFAULT_DISPLAY_WIDTH;
    if (Number.isFinite(n) && n > 0 && n <= MAX_DISPLAY_DIMENSION) {
      if (n !== current) {
        updateDisplay(display.id, { displayWidth: n });
        await saveConfig();
      }
    } else {
      setWidthDraft(String(current));
    }
  };
  const commitHeight = async () => {
    const n = parseInt(heightDraft, 10);
    const current = display.displayHeight ?? settings.displayHeight ?? DEFAULT_DISPLAY_HEIGHT;
    if (Number.isFinite(n) && n > 0 && n <= MAX_DISPLAY_DIMENSION) {
      if (n !== current) {
        updateDisplay(display.id, { displayHeight: n });
        await saveConfig();
      }
    } else {
      setHeightDraft(String(current));
    }
  };

  const handleTransform = async (next: 'normal' | '90' | '180' | '270') => {
    const w = display.displayWidth ?? settings.displayWidth ?? DEFAULT_DISPLAY_WIDTH;
    const h = display.displayHeight ?? settings.displayHeight ?? DEFAULT_DISPLAY_HEIGHT;
    const { width: finalW, height: finalH } = orientDimensions(w, h, next);
    updateDisplay(display.id, {
      displayTransform: next,
      displayWidth: finalW,
      displayHeight: finalH,
    });
    setWidthDraft(String(finalW));
    setHeightDraft(String(finalH));
    await saveConfig();
  };

  return {
    widthDraft,
    setWidthDraft,
    commitWidth,
    heightDraft,
    setHeightDraft,
    commitHeight,
    handleTransform,
  };
}
