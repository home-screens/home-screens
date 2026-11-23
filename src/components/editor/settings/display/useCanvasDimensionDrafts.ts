'use client';

import { useState } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveDimensions, getPatchedDisplayDimensions } from '@/lib/editor-multi-display';
import { isSupportedDisplayDimension, orientDimensions } from '@/lib/display-filter';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import { useCanvasResizeGuard } from '@/components/editor/settings/useOrientationGuard';
import type { DisplayNode, ScreenConfiguration } from '@/types/config';

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
 *
 * A resize or rotation that would leave modules past the edge of this
 * display's canvas goes through the same Scale to fit / Switch anyway prompt
 * as the Defaults Screen page; the returned `orientation` drives the modal.
 */
export function useCanvasDimensionDrafts(display: DisplayNode, config: ScreenConfiguration) {
  const { settings } = config;
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

  const orientation = useCanvasResizeGuard(display.id);

  // Every canvas edit on this page goes through here: the guard compares the
  // canvas the wall draws today with the one the patch leaves, which a
  // declared rotation may turn on its side.
  const commitCanvas = (
    patch: Pick<DisplayNode, 'displayWidth' | 'displayHeight' | 'displayTransform'>,
    revert?: () => void,
  ) => {
    orientation.guardResize({
      from: getActiveDimensions(config, display.id),
      to: getPatchedDisplayDimensions(config, display.id, patch),
      apply: async () => {
        updateDisplay(display.id, patch);
        await saveConfig();
      },
      revert,
    });
  };

  // On blur / Enter, commit the parsed draft back to the store if it is a
  // resolution a screen could actually have (see isSupportedDisplayDimension).
  // Invalid or empty input snaps the visible draft back to the last committed
  // value rather than silently discarding the edit. Without this, clearing
  // the field leaves the input blank while the store still holds the
  // old value, which looks like a UI bug to the user. A resolution typed with
  // a digit missing snaps back the same way instead of shrinking the canvas
  // to something nothing fits on. Cancelling the off-canvas prompt snaps it
  // back too.
  const commitWidth = () => {
    const n = parseInt(widthDraft, 10);
    const current = display.displayWidth ?? settings.displayWidth ?? DEFAULT_DISPLAY_WIDTH;
    if (isSupportedDisplayDimension(n)) {
      if (n !== current) {
        commitCanvas({ displayWidth: n }, () => setWidthDraft(String(current)));
      }
    } else {
      setWidthDraft(String(current));
    }
  };
  const commitHeight = () => {
    const n = parseInt(heightDraft, 10);
    const current = display.displayHeight ?? settings.displayHeight ?? DEFAULT_DISPLAY_HEIGHT;
    if (isSupportedDisplayDimension(n)) {
      if (n !== current) {
        commitCanvas({ displayHeight: n }, () => setHeightDraft(String(current)));
      }
    } else {
      setHeightDraft(String(current));
    }
  };

  // The inputs show the rotated size straight away. Backing out of the
  // off-canvas prompt puts them back; the select never moved, since it
  // reads the stored rotation.
  const handleTransform = (next: 'normal' | '90' | '180' | '270') => {
    const w = display.displayWidth ?? settings.displayWidth ?? DEFAULT_DISPLAY_WIDTH;
    const h = display.displayHeight ?? settings.displayHeight ?? DEFAULT_DISPLAY_HEIGHT;
    const { width: finalW, height: finalH } = orientDimensions(w, h, next);
    setWidthDraft(String(finalW));
    setHeightDraft(String(finalH));
    commitCanvas(
      { displayTransform: next, displayWidth: finalW, displayHeight: finalH },
      () => {
        setWidthDraft(String(w));
        setHeightDraft(String(h));
      },
    );
  };

  return {
    widthDraft,
    setWidthDraft,
    commitWidth,
    heightDraft,
    setHeightDraft,
    commitHeight,
    handleTransform,
    orientation,
  };
}
