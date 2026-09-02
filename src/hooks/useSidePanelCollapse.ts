'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Whether one of the editor's side panels is collapsed, remembered per side.
 *
 * On a 13" laptop the fixed 224px palette and 288px property panel eat 512px
 * of a 1280px window, which is most of a landscape canvas and all of the room
 * a zoomed-in portrait one needs. The choice is remembered so a small screen
 * stays set up the way it was left.
 */
export function useSidePanelCollapse(key: string): [boolean, (next: boolean) => void] {
  const storageKey = `hs-editor-collapse-${key}`;
  // Starts expanded on the server and on the first client render so the markup
  // matches; the stored preference is applied after mount.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === 'true') setCollapsed(true);
    } catch {
      // Private mode or blocked storage — the default (expanded) is fine.
    }
  }, [storageKey]);

  const set = useCallback(
    (next: boolean) => {
      setCollapsed(next);
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        // Not remembering is better than failing to collapse.
      }
    },
    [storageKey],
  );

  return [collapsed, set];
}
